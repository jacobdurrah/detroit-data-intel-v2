const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const HANDLER = path.resolve(__dirname, '../api/neighborhoods.js');
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
 * Mock supabase:
 * - neighborhood_stats view fails (so we exercise the aggregate path)
 * - aggregate selects return exact per-neighborhood counts far above any
 *   PostgREST max-rows sample window (e.g. 1000)
 */
function installAggregateMock(aggByTable) {
  clearModule(HANDLER);
  clearModule(SUPABASE_MODULE);

  const calls = { tables: [], selects: [], limits: [], filters: [] };

  function chainable(table) {
    calls.tables.push(table);
    const state = { select: null };
    const api = {
      select(cols) {
        state.select = cols;
        calls.selects.push(`${table}:${cols}`);
        return api;
      },
      not() { return api; },
      gte(col, val) {
        calls.filters.push(`gte:${table}:${col}:${val}`);
        return api;
      },
      limit(n) {
        calls.limits.push(`${table}:${n}`);
        return api;
      },
      then(resolve, reject) {
        if (table === 'neighborhood_stats') {
          return Promise.resolve({
            data: null,
            error: { message: 'relation neighborhood_stats does not exist' },
          }).then(resolve, reject);
        }

        const rows = aggByTable[table];
        if (!rows) {
          return Promise.resolve({
            data: null,
            error: { message: `unexpected table ${table}` },
          }).then(resolve, reject);
        }

        // Fail the test if the handler tries to scan raw rows with a limit —
        // that is the truncated-sample bug we are fixing.
        if (calls.limits.some((l) => l.startsWith(`${table}:`) && !l.endsWith(':1000'))) {
          return Promise.resolve({
            data: null,
            error: { message: `raw limit used for ${table}` },
          }).then(resolve, reject);
        }

        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
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

  return calls;
}

function installViewMock(rows) {
  clearModule(HANDLER);
  clearModule(SUPABASE_MODULE);

  const calls = { tables: [] };

  function chainable(table) {
    calls.tables.push(table);
    const api = {
      select() { return api; },
      limit() { return api; },
      not() { return api; },
      gte() { return api; },
      then(resolve, reject) {
        if (table !== 'neighborhood_stats') {
          return Promise.resolve({
            data: null,
            error: { message: `aggregate path should not run when view works (${table})` },
          }).then(resolve, reject);
        }
        return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
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

  return calls;
}

test('neighborhoods list uses exact aggregates, not raw-row sample limits', async () => {
  const calls = installAggregateMock({
    sales: [
      { neighborhood: 'Warrendale', count: 17649, avg_price: 42000 },
      { neighborhood: 'Bagley', count: 8343, avg_price: 150000 },
      { neighborhood: 'Brightmoor', count: 8246, avg_price: 28000 },
    ],
    blight: [
      { neighborhood: 'Warrendale', count: 31289 },
      { neighborhood: 'Bagley', count: 21148 },
      { neighborhood: 'Brightmoor', count: 19290 },
    ],
    permits: [
      { neighborhood: 'Warrendale', count: 854 },
      { neighborhood: 'Bagley', count: 1046 },
      { neighborhood: 'Brightmoor', count: 501 },
    ],
    demos: [
      { neighborhood: 'Warrendale', count: 120 },
      { neighborhood: 'Bagley', count: 40 },
      { neighborhood: 'Brightmoor', count: 200 },
    ],
    rentals: [
      { neighborhood: 'Warrendale', count: 500 },
      { neighborhood: 'Bagley', count: 800 },
      { neighborhood: 'Brightmoor', count: 100 },
    ],
    dlba_owned: [
      { neighborhood: 'Warrendale', count: 300 },
      { neighborhood: 'Bagley', count: 150 },
      { neighborhood: 'Brightmoor', count: 900 },
    ],
  });

  const handler = require(HANDLER);
  const req = { method: 'GET', query: { time_range: 'all' }, headers: {} };
  const res = makeRes();
  // Bypass auth: checkAuth uses DDI_API_KEY default frameworkai when unset,
  // but also accepts missing key only if... actually checkAuth requires key.
  // Set query key.
  req.query.key = process.env.DDI_API_KEY || 'frameworkai';

  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.ok(res.body && Array.isArray(res.body.data));
  assert.equal(res.body.meta.source, 'aggregates');

  const byName = Object.fromEntries(
    res.body.data.map((n) => [n.name || n.neighborhood, n])
  );

  assert.equal(byName.Warrendale.sales_count, 17649);
  assert.equal(byName.Bagley.sales_count, 8343);
  assert.equal(byName.Brightmoor.blight_count, 19290);
  assert.equal(byName.Bagley.blight_count, 21148);

  // Must not scan raw fact tables with a sample limit.
  assert.equal(calls.limits.filter((l) => !l.startsWith('neighborhood_stats')).length, 0);

  // Aggregate selects must use count(), not raw row dumps.
  assert.ok(calls.selects.some((s) => s.startsWith('sales:') && s.includes('count()')));
  assert.ok(calls.selects.some((s) => s.startsWith('blight:') && s.includes('count()')));
});

test('neighborhoods list applies time_range cutoff on dated tables', async () => {
  const calls = installAggregateMock({
    sales: [{ neighborhood: 'Bagley', count: 500, avg_price: 140000 }],
    blight: [{ neighborhood: 'Bagley', count: 100 }],
    permits: [{ neighborhood: 'Bagley', count: 50 }],
    demos: [],
    rentals: [{ neighborhood: 'Bagley', count: 20 }],
    dlba_owned: [{ neighborhood: 'Bagley', count: 5 }],
  });

  const handler = require(HANDLER);
  const req = {
    method: 'GET',
    query: { time_range: '1y', key: process.env.DDI_API_KEY || 'frameworkai' },
    headers: {},
  };
  const res = makeRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.meta.time_range, '1y');
  assert.equal(res.body.meta.source, 'aggregates');
  assert.ok(calls.filters.some((f) => f.startsWith('gte:sales:sale_date:')));
  assert.ok(calls.filters.some((f) => f.startsWith('gte:blight:ticket_issued_date:')));
  assert.ok(calls.filters.some((f) => f.startsWith('gte:permits:permit_issued:')));
  // rentals/dlba have no date filter in the product contract
  assert.ok(!calls.filters.some((f) => f.startsWith('gte:rentals:')));
});

test('neighborhoods list prefers neighborhood_stats view for all-time', async () => {
  installViewMock([
    {
      neighborhood: 'Bagley',
      total_sales: 8343,
      median_price: 154000,
      total_permits: 1046,
      total_blight: 21148,
      total_demos: 40,
      total_rentals: 800,
    },
  ]);

  const handler = require(HANDLER);
  const req = {
    method: 'GET',
    query: { time_range: 'all', key: process.env.DDI_API_KEY || 'frameworkai' },
    headers: {},
  };
  const res = makeRes();
  await handler(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.meta.source, 'neighborhood_stats');
  assert.equal(res.body.data[0].sales_count, 8343);
  assert.equal(res.body.data[0].median_price, 154000);
  assert.equal(res.body.data[0].blight_count, 21148);
});
