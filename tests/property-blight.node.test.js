const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const { normalizeAddress, parseStreetAddress } = require('../api/_address');

const PROPERTY_HANDLER = path.resolve(__dirname, '../api/property/[address].js');
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

test('parseStreetAddress splits number and strips street suffix', () => {
  assert.deepEqual(parseStreetAddress('2404 Pennsylvania St'), {
    streetNumber: '2404',
    streetName: 'PENNSYLVANIA',
  });
  assert.deepEqual(parseStreetAddress('15852 WABASH'), {
    streetNumber: '15852',
    streetName: 'WABASH',
  });
  assert.equal(parseStreetAddress('Michigan Ave'), null);
});

test('normalizeAddress uppercases and strips punctuation', () => {
  assert.equal(normalizeAddress('2404 Pennsylvania, St.'), '2404 PENNSYLVANIA ST');
});

test('property API queries blight by street_number + street_name, not full-address ILIKE', async () => {
  const originalLoad = Module._load;
  const blightCalls = [];

  function chainable(table) {
    const state = { table, filters: [] };
    const api = {
      select() { return api; },
      ilike(column, value) {
        state.filters.push({ op: 'ilike', column, value });
        return api;
      },
      eq(column, value) {
        state.filters.push({ op: 'eq', column, value });
        return api;
      },
      or(expr) {
        state.filters.push({ op: 'or', expr });
        return api;
      },
      order() { return api; },
      limit() {
        if (table === 'blight') blightCalls.push(state.filters.slice());
        return Promise.resolve({
          data: table === 'blight'
            ? [{
                ticket_id: 1,
                street_number: '2404',
                street_name: 'PENNSYLVANIA',
                fine_amount: 250,
                balance_due: 100,
                ticket_issued_date: '2024-01-01',
                violation_description: 'Weeds',
                payment_status: 'UNPAID',
                disposition: null,
                neighborhood: 'Islandview',
                latitude: 42.3,
                longitude: -83.0,
              }]
            : [],
          error: null,
        });
      },
    };
    return api;
  }

  Module._load = function mockLoad(request, parent, isMain) {
    if (request === './_supabase' || request === '../_supabase' || request.endsWith('/_supabase')) {
      return { supabase: { from: (table) => chainable(table) } };
    }
    // Resolve relative _supabase from property handler
    if (parent && parent.filename && parent.filename.includes('property') && request === '../_supabase') {
      return { supabase: { from: (table) => chainable(table) } };
    }
    return originalLoad.call(this, request, parent, isMain);
  };

  // Also stub by absolute path once resolved
  clearModule(PROPERTY_HANDLER);
  clearModule(SUPABASE_MODULE);
  require.cache[SUPABASE_MODULE] = {
    id: SUPABASE_MODULE,
    filename: SUPABASE_MODULE,
    loaded: true,
    exports: { supabase: { from: (table) => chainable(table) } },
  };

  try {
    const handler = require(PROPERTY_HANDLER);
    const res = makeRes();
    await handler(
      {
        method: 'GET',
        query: { address: '2404 Pennsylvania', key: 'frameworkai' },
        headers: {},
      },
      res
    );

    assert.equal(res.statusCode, 200);
    assert.ok(res.body && res.body.data, 'expected property payload');
    assert.equal(res.body.data.summary.total_blight, 1);
    assert.ok(
      res.body.data.signals.some((s) => /blight ticket/i.test(s)),
      'expected blight motivated-seller signal'
    );

    assert.equal(blightCalls.length, 1, 'expected one blight query');
    const filters = blightCalls[0];
    assert.ok(!filters.some((f) => f.op === 'or'), 'must not use broken full-address .or() filter');
    assert.deepEqual(
      filters.find((f) => f.op === 'eq' && f.column === 'street_number'),
      { op: 'eq', column: 'street_number', value: '2404' }
    );
    assert.deepEqual(
      filters.find((f) => f.op === 'ilike' && f.column === 'street_name'),
      { op: 'ilike', column: 'street_name', value: 'PENNSYLVANIA%' }
    );
  } finally {
    Module._load = originalLoad;
    clearModule(PROPERTY_HANDLER);
    clearModule(SUPABASE_MODULE);
  }
});
