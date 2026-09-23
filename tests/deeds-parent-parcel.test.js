const { test } = require('node:test');
const assert = require('node:assert/strict');
const { detroitUnitTaxId, sameRecordedStreet, selectParentParcelDocs, toTaxId } = require('../api/_deeds');

const doc = (over) => ({
  doc_id: over.doc_id,
  address: over.address,
  parcels: over.parcels,
  recorded_date: over.recorded_date || '2026-01-01',
});

test('city condo unit ids convert to a dotted Register tax id', () => {
  assert.equal(toTaxId('01004106.001'), '01/004106.001');
  assert.deepEqual(detroitUnitTaxId('01/004106.001'), {
    exact: '01/004106.001', base: '01/004106', zero: '01/004106.000',
  });
  assert.equal(detroitUnitTaxId('01/004106'), null);
  assert.equal(detroitUnitTaxId('01/004106.000'), null);
  assert.equal(detroitUnitTaxId('14/002261'), null);
});

test('street match ignores unit and street type, not a different house or street', () => {
  assert.equal(sameRecordedStreet('1000 WOODWARD AVE UNIT 1', '1000 WOODWARD'), true);
  assert.equal(sameRecordedStreet('308 ELIOT UNIT 1', '308 ELIOT'), true);
  assert.equal(sameRecordedStreet('2853 BRUSH', '2853 BRUSH'), true);
  assert.equal(sameRecordedStreet('2845 JOHN R UNIT 1/ 101', '112 EDMUND PL'), false);
  assert.equal(sameRecordedStreet('2853 BRUSH', '286 EDMUND PL'), false);
  assert.equal(sameRecordedStreet('100 WOODWARD', '1000 WOODWARD'), false);
  assert.equal(sameRecordedStreet('1000 WOODWARD AVE UNIT 1', null), false);
});

test('parent docs are kept only for the building tax id at the same address', () => {
  const woodward = [
    doc({ doc_id: 1, address: '1000 WOODWARD', parcels: [{ tax_id: '01/004106.000' }] }),
    doc({ doc_id: 2, address: '1000 WOODWARD', parcels: [{ tax_id: '01/004106' }, { tax_id: '01/004106-9' }] }),
  ];
  const edmund = [
    doc({ doc_id: 3, address: '112 EDMUND PL', parcels: [{ tax_id: '01/000701' }] }),
    doc({ doc_id: 4, address: '286 EDMUND PL', parcels: [{ tax_id: '01/000674.000' }] }),
  ];
  assert.deepEqual(
    selectParentParcelDocs('1000 WOODWARD AVE UNIT 1', woodward, ['01/004106', '01/004106.000']).map((d) => d.doc_id),
    [1, 2],
  );
  assert.deepEqual(
    selectParentParcelDocs('2845 JOHN R UNIT 1/ 101', edmund, ['01/000701', '01/000701.000']).map((d) => d.doc_id),
    [],
  );
  assert.deepEqual(
    selectParentParcelDocs('2853 BRUSH', edmund, ['01/000674', '01/000674.000']).map((d) => d.doc_id),
    [],
  );
  // Same stem, wrong tax id on the document: do not keep it just because the address matches.
  assert.deepEqual(
    selectParentParcelDocs('1000 WOODWARD AVE UNIT 1', woodward, ['01/999999', '01/999999.000']).map((d) => d.doc_id),
    [],
  );
});
