const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addressHits, constrainLookup } = require('../api/_deeds');

const doc = (over) => ({
  address: '4661 VANCOUVER',
  legal: 'Subdivision: HOLDEN, Tax ID: 14/002261, Municipality: DETROIT, Street#: 4661 VANCOUVER',
  parcels: [{ tax_id: '14/002261', city_parcel_id: '14002261.' }],
  doc_number: '2025304487',
  ...over,
});

test('keeps the recorded street address', () => {
  assert.equal(addressHits(doc(), '4661 VANCOUVER'), true);
  assert.equal(addressHits(doc(), '4661 vancouver street'), true);
  assert.equal(addressHits(doc({ address: null }), '4661 VANCOUVER'), true);
});

test('drops county keyword hits that are a different property', () => {
  // Live: address=1 WOODWARD matched 4815/1240/20101 Woodward (818 docs, 0 at "1 WOODWARD").
  assert.equal(addressHits(doc({ address: '4815 WOODWARD', legal: 'Street: 4815 WOODWARD' }), '1 WOODWARD'), false);
  assert.equal(addressHits(doc({ address: '20101 WOODWARD', legal: 'Street: 20101 WOODWARD' }), '1 WOODWARD'), false);
  // Live: address=100 MAIN matched Maine Street and 67 MAIN, none at 100 Main.
  assert.equal(addressHits(doc({ address: '13998 MAINE', legal: 'Street: 13998 MAINE' }), '100 MAIN'), false);
  assert.equal(addressHits(doc({ address: '67 MAIN', legal: 'Street: 67 MAIN' }), '100 MAIN'), false);
  // Live: address=661 VANCOUVER matched 5070 VANCOUVER because OCR had Liber page 661.
  assert.equal(addressHits(doc({
    address: '5070 VANCOUVER',
    legal: 'Subdivision: HOLDEN AND MURRAYS NORTHWESTERN, Tax ID: 16/002896, Municipality: DETROIT, Street: 5070 VANCOUVER',
  }), '661 VANCOUVER'), false);
});

test('constrainLookup keeps parcel/address/doc_number on the asked-for record', () => {
  const hit = doc();
  const other = doc({
    address: '4815 WOODWARD',
    legal: 'Street: 4815 WOODWARD',
    parcels: [{ tax_id: '01/004190-8', city_parcel_id: '01004190-8' }],
    doc_number: '999',
  });
  assert.deepEqual(constrainLookup([hit, other], { address: '4661 VANCOUVER' }).map((d) => d.address), ['4661 VANCOUVER']);
  assert.deepEqual(constrainLookup([hit, other], { parcel: '14002261.' }).map((d) => d.parcels[0].tax_id), ['14/002261']);
  assert.deepEqual(constrainLookup([hit, other], { doc_number: '2025304487' }).map((d) => d.doc_number), ['2025304487']);
  assert.equal(constrainLookup([hit, other], { q: 'WOODWARD' }).length, 2);
});
