const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const HANDLER = path.resolve(__dirname, '../api/neighborhood/[name].js');
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
      range() { return api; },
      then(resolve, reject) {
        return Promise.resolve(state.isCount
          ? { count: counts[table] ?? 0, error: null, data: null }
          : {
              data: Array.from({ length: Math.min(state.limitN || 0, 3) }, (_, i) => ({
                sales_id: i + 1,
                address: `${100 + i} Main`,
                sale_date: '2024-01-01',
                sale_price: 50000 + i,
                grantee: 'Buyer Co',
                grantor: 'Seller Co',
                latitude: 42.3,
                longitude: -83.0,
                ticket_id: i + 1,
                violation_description: 'Weeds',
                fine_amount: 100,
                balance_due: 50,
                payment_status: 'UNPAID',
                ticket_issued_date: '2024-01-01',
                permit_no: `P-${i}`,
                permit_type: 'Building',
                description: 'Work',
                permit_issued: '2024-01-01',
                estimated_cost: 1000,
                contractor_name: 'ACME',
                parcel_id: `PID-${i}`,
                total_assessed_value: 20000,
                total_taxable_value: 10000,
                year_built: 1920,
                owner_name: 'Owner',
                property_class: 'Residential',
                neighborhood: 'Bagley',
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

test('neighborhood overview totals use exact counts, not sample.length', async () => {
  installSupabaseMock({
    sales: 1967,
    blight: 842,
    permits: 310,
    trades: 95,
    assessment: 4500,
    rentals: 220,
    demos: 40,
    dlba_owned: 18,
  });

  const handler = require(HANDLER);
  const res = makeRes();
  await handler(
    {
      method: 'GET',
      query: { name: 'Bagley', key: 'frameworkai' },
      headers: {},
    },
    res
  );

  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  const data = res.body.data;
  assert.equal(data.sales.total, 1967);
  assert.equal(data.blight.total, 842);
  assert.equal(data.permits.total, 310);
  assert.equal(data.trades.total, 95);
  assert.equal(data.profile.total_sales, 1967);
  assert.equal(data.profile.total_blight, 842);
  assert.equal(data.profile.total_permits, 405);
  assert.equal(data.profile.total_rentals, 220);
  assert.equal(data.profile.total_demolitions, 40);
  assert.equal(data.profile.total_dlba_owned, 18);
  assert.equal(data.profile.total_parcels, 4500);

  // Sample rows are still present for recent lists, but must not cap totals.
  assert.ok(data.sales.recent.length <= 5);
  assert.ok(data.sales.total > data.sales.recent.length);
});
