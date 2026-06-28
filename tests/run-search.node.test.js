const assert = require('node:assert/strict');
const test = require('node:test');

process.env.SUPABASE_KEY = process.env.SUPABASE_KEY || 'test-service-key';

const {
  getSupabase,
  markListingsSeen,
  storeReport,
} = require('../scripts/run-search');

function sampleReport() {
  return {
    properties: [
      {
        address: '123 Main St, Detroit, MI 48224',
        zip: '48224',
        neighborhood: 'Morningside',
        list_price: 85000,
        beds: 3,
        baths: 1,
        sqft: 1100,
        year_built: 1940,
        lot_size: 4500,
        listing_url: 'https://example.test/listing',
        photo_url: 'https://example.test/photo.jpg',
        description: 'Updated roof',
        score: 72,
        score_breakdown: { roof: 15 },
        mechanicals: { roof: true },
        estimated_arv: 145000,
      },
    ],
  };
}

function fakeSupabase(options) {
  return {
    from(table) {
      return {
        async upsert() {
          if (table === 'property_searches' && options.propertyError) {
            return { error: new Error(options.propertyError) };
          }
          return { error: null };
        },
        async insert() {
          if (table === 'property_reports' && options.reportError) {
            return { error: new Error(options.reportError) };
          }
          return { error: null };
        },
      };
    },
  };
}

test('legacy SUPABASE_KEY config is accepted for the search runner', () => {
  assert.doesNotThrow(() => getSupabase());
});

test('storeReport throws when a property_searches write fails', async () => {
  await assert.rejects(
    () => storeReport(sampleReport(), fakeSupabase({ propertyError: 'permission denied' })),
    /Store error for 123 Main St/
  );
});

test('storeReport throws when the daily report write fails', async () => {
  await assert.rejects(
    () => storeReport(sampleReport(), fakeSupabase({ reportError: 'timeout' })),
    /Report store error: timeout/
  );
});

test('markListingsSeen mutates only when explicitly called after storage', () => {
  const seen = { 'Existing Address': 1 };
  markListingsSeen(seen, [{ address: '123 Main St' }], 42);
  assert.deepEqual(seen, {
    'Existing Address': 1,
    '123 Main St': 42,
  });
});
