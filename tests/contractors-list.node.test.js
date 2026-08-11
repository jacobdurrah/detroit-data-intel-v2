const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const HANDLER = path.resolve(__dirname, '../api/contractors.js');
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
 * Mock supabase that only serves contractor_directory — the list endpoint must
 * not touch raw permits/trades samples.
 */
function installDirectoryMock(rows, totalCount) {
  clearModule(HANDLER);
  clearModule(SUPABASE_MODULE);

  const calls = { tables: [], orders: [], ranges: [], filters: [] };

  function chainable(table) {
    calls.tables.push(table);
    const state = {
      countMode: false,
      ascending: null,
      orderCol: null,
    };
    const api = {
      select(_cols, opts) {
        if (opts && opts.count === 'exact') state.countMode = true;
        return api;
      },
      gt() { calls.filters.push('gt'); return api; },
      ilike(col, val) { calls.filters.push(`ilike:${col}:${val}`); return api; },
      overlaps(col, val) { calls.filters.push(`overlaps:${col}:${JSON.stringify(val)}`); return api; },
      order(col, opts) {
        state.orderCol = col;
        state.ascending = !!(opts && opts.ascending);
        calls.orders.push(`${col}:${state.ascending ? 'asc' : 'desc'}`);
        return api;
      },
      range(from, to) {
        calls.ranges.push(`${from}-${to}`);
        return api;
      },
      then(resolve, reject) {
        if (table !== 'contractor_directory') {
          return Promise.resolve({
            data: null,
            error: { message: `unexpected table ${table}` },
            count: null,
          }).then(resolve, reject);
        }
        return Promise.resolve({
          data: rows,
          error: null,
          count: totalCount,
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

  return calls;
}

test('contractors list uses contractor_directory totals, not permit samples', async () => {
  const rows = [
    {
      name: 'DWSD WATER MAIN REPLACEMENT CONTRACT',
      total_permits: 5116,
      recent_permits: 120,
      specialties: ['Water'],
      permit_types: ['Water'],
      neighborhoods: ['Downtown'],
      last_permit_date: '2024-06-01',
      phone: null,
      website: null,
      business_address: null,
    },
    {
      name: 'FLAME FURNACE',
      total_permits: 2185,
      recent_permits: 40,
      specialties: ['Mechanical'],
      permit_types: ['Mechanical Permit'],
      neighborhoods: ['Bagley'],
      last_permit_date: '2024-05-01',
      phone: null,
      website: null,
      business_address: null,
    },
  ];

  const calls = installDirectoryMock(rows, 5061);

  const handler = require(HANDLER);
  const res = makeRes();
  await handler(
    {
      method: 'GET',
      query: { key: 'frameworkai', page: '1', limit: '20', sort: 'total_permits' },
      headers: {},
    },
    res
  );

  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  assert.deepEqual(calls.tables, ['contractor_directory']);
  assert.ok(!calls.tables.includes('permits'));
  assert.ok(!calls.tables.includes('trades'));

  assert.equal(res.body.meta.total, 5061);
  assert.equal(res.body.data.length, 2);
  assert.equal(res.body.data[0].name, 'DWSD WATER MAIN REPLACEMENT CONTRACT');
  assert.equal(res.body.data[0].total_permits, 5116);
  // Must not be capped by the old .limit(5000) sample window.
  assert.ok(res.body.data[0].total_permits > 5000);
  assert.ok(calls.orders.includes('total_permits:desc'));
  assert.ok(calls.ranges.includes('0-19'));
});

test('contractors list accepts search param from UI and specialty filter', async () => {
  const calls = installDirectoryMock([], 0);

  const handler = require(HANDLER);
  const res = makeRes();
  await handler(
    {
      method: 'GET',
      query: {
        key: 'frameworkai',
        search: 'Flame',
        specialty: 'Mechanical',
        sort: 'name',
        page: '2',
        limit: '20',
      },
      headers: {},
    },
    res
  );

  assert.equal(res.statusCode, 200);
  assert.ok(calls.filters.some((f) => f.startsWith('ilike:name:%Flame%')));
  assert.ok(calls.filters.some((f) => f.includes('overlaps:specialties')));
  assert.ok(calls.orders.includes('name:asc'));
  assert.ok(calls.ranges.includes('20-39'));
  assert.equal(res.body.meta.total, 0);
  assert.equal(res.body.meta.page, 2);
});
