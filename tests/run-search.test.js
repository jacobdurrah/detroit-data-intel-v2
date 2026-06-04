const assert = require('node:assert/strict');
const test = require('node:test');

const {
  filterUnseenListings,
  markSeenListings,
  storeReport,
} = require('../scripts/run-search');

function fakeSupabase({ propertyError, reportError } = {}) {
  return {
    writes: [],
    from(table) {
      if (table === 'property_searches') {
        return {
          upsert: async (row) => {
            this.writes.push({ table, row });
            return { error: propertyError || null };
          },
        };
      }
      if (table === 'property_reports') {
        return {
          insert: async (row) => {
            this.writes.push({ table, row });
            return { error: reportError || null };
          },
        };
      }
      throw new Error('Unexpected table: ' + table);
    },
  };
}

function sampleReport() {
  return {
    properties: [
      {
        address: '123 Eligible St, Detroit, MI 48224',
        zip: '48224',
        neighborhood: 'Morningside',
        list_price: 95000,
        beds: 3,
        baths: 1,
        sqft: 1200,
        year_built: 1930,
        lot_size: 4000,
        listing_url: 'https://example.com/listing',
        photo_url: 'https://example.com/photo.jpg',
        description: 'Updated furnace and roof.',
        score: 82,
        score_breakdown: { roof: 15 },
        mechanicals: { roof: true },
        estimated_arv: 145000,
      },
    ],
  };
}

test('dedup helpers only mark listings that passed the funnel', () => {
  const seenMap = { '1 Already Seen, Detroit, MI 48224': 100 };
  const listings = [
    { address: '1 Already Seen, Detroit, MI 48224', zip: '48224', list_price: 90000 },
    { address: '2 Too Expensive, Detroit, MI 48224', zip: '48224', list_price: 130000 },
    { address: '3 Eligible, Detroit, MI 48224', zip: '48224', list_price: 95000 },
  ];

  const newListings = filterUnseenListings(listings, seenMap);
  const inRange = newListings.filter(l => l.list_price >= 50000 && l.list_price <= 120000);

  markSeenListings(seenMap, inRange, 200);

  assert.equal(seenMap['1 Already Seen, Detroit, MI 48224'], 100);
  assert.equal(seenMap['2 Too Expensive, Detroit, MI 48224'], undefined);
  assert.equal(seenMap['3 Eligible, Detroit, MI 48224'], 200);
});

test('storeReport throws when a property write fails', async () => {
  const client = fakeSupabase({ propertyError: new Error('upsert failed') });

  await assert.rejects(
    () => storeReport(sampleReport(), client),
    /Failed to store search report: Store error for 123 Eligible St/
  );
});

test('storeReport throws when the daily report write fails', async () => {
  const client = fakeSupabase({ reportError: new Error('insert failed') });

  await assert.rejects(
    () => storeReport(sampleReport(), client),
    /Failed to store search report: Report store error: insert failed/
  );
});

test('storeReport writes properties and the daily report on success', async () => {
  const client = fakeSupabase();

  await storeReport(sampleReport(), client);

  assert.deepEqual(client.writes.map(w => w.table), [
    'property_searches',
    'property_reports',
  ]);
});
