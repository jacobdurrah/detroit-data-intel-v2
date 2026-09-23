const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const HANDLER = path.resolve(__dirname, '../api/investor/[name].js');
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
 * Mock that returns exact aggregates for stats/neighborhoods/deeds, exact
 * counts for head queries, and a small page/flip sample. Using .limit(5000)
 * raw-row scans for stats must fail the test — that is the truncation bug.
 */
function installSupabaseMock() {
  clearModule(HANDLER);
  clearModule(SUPABASE_MODULE);

  const calls = { selects: [], limits: [], ilikes: [] };

  function chainable() {
    const state = {
      select: null,
      opts: null,
      ilikeCol: null,
      limitN: null,
      ranged: false,
    };
    const api = {
      select(cols, opts) {
        state.select = cols;
        state.opts = opts || null;
        calls.selects.push(String(cols));
        return api;
      },
      ilike(col) {
        state.ilikeCol = col;
        calls.ilikes.push(col);
        return api;
      },
      not() { return api; },
      order() { return api; },
      limit(n) {
        state.limitN = n;
        calls.limits.push(n);
        return api;
      },
      range() {
        state.ranged = true;
        return api;
      },
      then(resolve, reject) {
        const select = state.select || '';
        const isGrantee = state.ilikeCol === 'grantee';

        if (state.opts && state.opts.head && state.opts.count === 'exact') {
          return Promise.resolve({
            count: isGrantee ? 11289 : 61694,
            data: null,
            error: null,
          }).then(resolve, reject);
        }

        if (String(select).includes('sale_price.sum()') || String(select).includes('spend:')) {
          if (state.limitN != null) {
            return Promise.resolve({
              data: null,
              error: { message: 'stats query must not use a raw-row limit' },
            }).then(resolve, reject);
          }
          return Promise.resolve({
            data: [isGrantee
              ? {
                  spend: 3879705,
                  avg_price: 344,
                  min_price: 0,
                  max_price: 348698,
                  first_date: '2011-01-18',
                  last_date: '2026-03-03',
                }
              : {
                  spend: 50200000,
                  avg_price: 813,
                  min_price: 1,
                  max_price: 900000,
                  first_date: '2011-02-01',
                  last_date: '2026-04-01',
                }],
            error: null,
          }).then(resolve, reject);
        }

        if (String(select).includes('count()') && String(select).includes('neighborhood')) {
          if (state.limitN != null) {
            return Promise.resolve({
              data: null,
              error: { message: 'neighborhood aggregate must not use a raw-row limit' },
            }).then(resolve, reject);
          }
          const rows = isGrantee
            ? [
                { neighborhood: 'Morningside', count: 800 },
                { neighborhood: 'Bagley', count: 400 },
                { neighborhood: 'Warrendale', count: 250 },
              ]
            : [
                { neighborhood: 'Morningside', count: 1200 },
                { neighborhood: 'Bagley', count: 90 },
              ];
          return Promise.resolve({ data: rows, error: null }).then(resolve, reject);
        }

        if (String(select).includes('count()') && String(select).includes('terms_of_sale')) {
          return Promise.resolve({
            data: [
              { terms_of_sale: 'ARMS LENGTH', count: 5000 },
              { terms_of_sale: 'QUIT CLAIM', count: 300 },
            ],
            error: null,
          }).then(resolve, reject);
        }

        if (state.ranged) {
          return Promise.resolve({
            data: [{
              sales_id: 1,
              address: '100 Main',
              sale_date: '2026-03-03',
              sale_price: 12000,
              grantor: 'Seller',
              grantee: 'DETROIT LAND BANK AUTHORITY',
              neighborhood: 'Morningside',
              parcel_id: 'PID-1',
              terms_of_sale: 'ARMS LENGTH',
              latitude: 42.3,
              longitude: -83.0,
            }],
            error: null,
          }).then(resolve, reject);
        }

        if (String(select).includes('address')) {
          return Promise.resolve({
            data: [{
              address: '200 Flip St',
              sale_price: isGrantee ? 5000 : 15000,
              sale_date: isGrantee ? '2015-01-01' : '2016-01-01',
              neighborhood: 'Bagley',
            }],
            error: null,
          }).then(resolve, reject);
        }

        return Promise.resolve({
          data: null,
          error: { message: `unexpected select: ${select}` },
        }).then(resolve, reject);
      },
    };
    return api;
  }

  require.cache[SUPABASE_MODULE] = {
    id: SUPABASE_MODULE,
    filename: SUPABASE_MODULE,
    loaded: true,
    exports: { supabase: { from: () => chainable() } },
  };

  return calls;
}

test('investor detail uses exact aggregates, not PostgREST-capped row samples', async () => {
  const calls = installSupabaseMock();
  const handler = require(HANDLER);
  const res = makeRes();

  await handler(
    {
      method: 'GET',
      query: { name: 'DETROIT LAND BANK AUTHORITY', key: 'frameworkai' },
      headers: {},
    },
    res
  );

  assert.equal(res.statusCode, 200, `expected 200, got ${res.statusCode}: ${JSON.stringify(res.body)}`);
  const profile = res.body.data.profile;

  assert.equal(profile.total_purchases, 11289);
  assert.equal(profile.total_sales, 61694);
  // Live list RPC spend/last-purchase — must NOT be the oldest-1000 sample
  // (sample was spend 2623613 / last_purchase 2014-08-27).
  assert.equal(profile.total_spend, 3879705);
  assert.equal(profile.total_revenue, 50200000);
  assert.equal(profile.avg_purchase_price, 344);
  assert.equal(profile.max_purchase, 348698);
  assert.equal(profile.first_purchase, '2011-01-18');
  assert.equal(profile.last_purchase, '2026-03-03');

  const hoods = res.body.data.neighborhoods;
  const hoodSum = hoods.reduce((s, h) => s + h.count, 0);
  assert.equal(hoods[0].name, 'Morningside');
  assert.equal(hoods[0].count, 800);
  assert.equal(hoodSum, 1450);
  assert.ok(hoodSum > 1000, 'neighborhood counts must exceed PostgREST max-rows sample');
  assert.equal(profile.neighborhoods_active, 3);

  assert.equal(res.body.data.deed_types['ARMS LENGTH'], 5000);
  assert.equal(res.body.meta.total, 11289);
  assert.equal(res.body.meta.pages, Math.ceil(11289 / 50));

  assert.ok(calls.selects.some((s) => s.includes('sale_price.sum()') || s.includes('spend:')));
  assert.ok(calls.selects.some((s) => s.includes('neighborhood') && s.includes('count()')));
  assert.equal(calls.limits.filter((n) => n === 5000).length, 0);
});
