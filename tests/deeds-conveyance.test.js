const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isConveyanceDoc } = require('../api/_deeds');

test('deeds and land contracts transfer title', () => {
  for (const t of [
    'WARRANTY DEED', 'QUIT CLAIM DEED', 'QUIT CLAIM DEED-WCTO', 'DEED',
    'SHERIFFS DEED', 'MEMO OF LAND CONTRACT', 'LAND CONTRACT',
  ]) {
    assert.equal(isConveyanceDoc(t), true, t);
  }
});

test('mortgages, discharges, assignments, and master deeds are not a sale', () => {
  for (const t of [
    'MORTGAGE', 'DISCHARGE', 'ASSIGNMENT', 'RELEASE', 'AFFIDAVIT',
    'NOTICE OF COMMENCEMENT', 'MASTER DEED', 'DEED RESTRICTION',
    'TERMINATION OF LAND CONTRACT',
  ]) {
    assert.equal(isConveyanceDoc(t), false, t);
  }
});
