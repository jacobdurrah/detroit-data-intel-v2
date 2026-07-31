const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || 'test-service-key';

const { updateMedians, markSeenListings } = require('../scripts/run-search');

function makeSalesClient(result) {
  var selects = [];
  var page = 0;
  var batches = result.batches || [];

  return {
    selects,
    from(table) {
      assert.equal(table, 'sales');
      return {
        select(columns) {
          selects.push(columns);
          return this;
        },
        gte() {
          return this;
        },
        gt() {
          return this;
        },
        range() {
          if (result.error) return Promise.resolve({ data: null, error: result.error });
          return Promise.resolve({ data: batches[page++] || [], error: null });
        },
      };
    },
  };
}

test('updateMedians queries zip_code and refreshes neighborhood medians', async () => {
  var sales = [
    { sale_price: 100000, zip_code: '48224' },
    { sale_price: 120000, zip_code: '48224' },
    { sale_price: 140000, zip_code: '48224' },
    { sale_price: 160000, zip_code: '48224' },
    { sale_price: 300000, zip_code: '48224' },
  ];
  var client = makeSalesClient({ batches: [sales] });
  var neighborhoods = [{ name: 'East English Village', zips: ['48224'], median: 1 }];

  var zipMedians = await updateMedians(client, neighborhoods);

  assert.equal(client.selects[0], 'neighborhood, sale_price, zip_code');
  assert.deepEqual(zipMedians, { '48224': 140000 });
  assert.equal(neighborhoods[0].median, 140000);
});

test('updateMedians fails loudly when the sales query fails', async () => {
  var client = makeSalesClient({
    error: { message: 'column sales.zip does not exist' },
  });

  await assert.rejects(
    () => updateMedians(client, [{ name: 'Example', zips: ['48224'], median: 1 }]),
    /Median refresh failed: column sales\.zip does not exist/
  );
});

test('markSeenListings records only listings that reached evaluation', () => {
  var seenMap = { 'OLD, Detroit, MI 48224': 111 };

  markSeenListings(seenMap, [
    { address: 'NEW, Detroit, MI 48224' },
    { address: '' },
    {},
  ], 222);

  assert.deepEqual(seenMap, {
    'OLD, Detroit, MI 48224': 111,
    'NEW, Detroit, MI 48224': 222,
  });
});

test('run pipeline stores the report before persisting seen addresses', () => {
  var source = fs.readFileSync(path.join(__dirname, '..', 'scripts', 'run-search.js'), 'utf8');

  assert.match(source, /if \(reportError\) throw new Error\('Report store failed:/);
  assert.doesNotMatch(source, /allListings\.forEach\(l => \{ seenMap\[l\.address\]/);
});
