const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const HANDLER = path.resolve(__dirname, '../api/contractor/[name].js');
const SUPABASE_MODULE = path.resolve(__dirname, '../api/_supabase.js');

function makeRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
      return this;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

function clearModule(modulePath) {
  try {
    delete require.cache[require.resolve(modulePath)];
  } catch (_) {
    // ignore unresolved
  }
}

/**
 * Mock supabase that returns limited sample rows for data queries and exact
 * counts for head:true count queries — so we can assert totals are not
 * capped at sample.length.
 */
function installSupabaseMock(counts) {
  clearModule(HANDLER);
  clearModule(SUPABASE_MODULE);

  function chainable(table) {
    const state = {
      table,
      isCount: false,
      limitN: null,
    };
    const api = {
      select(_cols, opts) {
        if (opts && opts.head && opts.count === 'exact') state.isCount = true;
        return api;
      },
      ilike() { return api; },
      order() { return api; },
      limit(n) {
        state.limitN = n;
        return api;
      },
      then(resolve, reject) {
        return Promise.resolve(state.isCount
          ? { count: counts[table] ?? 0, error: null, data: null }
          : {
              data: Array.from({ length: Math.min(state.limitN || 0, 3) }, (_, i) => ({
                permit_no: `${table}-${i}`,
                address: `${100 + i} Main`,
                permit_type: table === 'trades' ? 'Mechanical Permit' : 'Building',
                description: 'Work',
                permit_issued: '2024-01-01',
                neighborhood: 'Bagley',
                contractor_name: 'FLAME FURNACE',
                estimated_cost: 1000,
              })),
              error: null,
            }).then(resolve, reject);
      },
    };
    return api;
  }

  require.cache[SUPABASE_MODULE] = {
    id: SUPABASE_MODULE,
    filename: SUPABASE_MODULE,
    loaded: true,
    exports: { supabase: { from: (table) => chainable(table) } },
  };
}

test('contractor detail totals use exact counts, not sample.length', async () => {
  installSupabaseMock({
    permits: 2185,
    trades: 4526,
  });

  const handler = require(HANDLER);
  const res = makeRes();
  await handler(
    {
      method: 'GET',
      query: { name: 'FLAME FURNACE', key: 'frameworkai', limit: '50' },
      headers: {},
    },
    res
  );

  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  const data = res.body.data;
  const meta = res.body.meta;

  assert.equal(data.profile.building_permits, 2185);
  assert.equal(data.profile.trade_permits, 4526);
  assert.equal(data.profile.total_permits, 6711);
  assert.equal(meta.total, 6711);

  // Sample rows are still returned for the list, but must not cap totals.
  assert.ok(data.trades.length <= 50);
  assert.ok(data.profile.total_permits > data.trades.length);
  assert.ok(data.profile.total_permits > 400, 'must exceed combined .limit(200)×2 sample cap');
});
