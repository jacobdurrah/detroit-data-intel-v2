const { test } = require('node:test');
const assert = require('node:assert/strict');
const { addressSearchPattern } = require('../api/_address-search-pattern');

function ilike(address, pattern) {
  const re = new RegExp(
    '^' + String(pattern).replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$',
    'i'
  );
  return re.test(address);
}

test('prefix so 1 Woodward Ave is not a suffix of 8901 WOODWARD AVE', () => {
  const pattern = addressSearchPattern('1 WOODWARD AVE');
  assert.equal(pattern, '1 WOODWARD AVE%');
  assert.equal(ilike('1 WOODWARD AVE', pattern), true);
  assert.equal(ilike('1 WOODWARD AVE UNIT 1', pattern), true);
  assert.equal(ilike('8901 WOODWARD AVE', pattern), false);
  assert.equal(ilike('11531 WOODWARD AVE', pattern), false);
  assert.equal(ilike('7301 WOODWARD AVE', pattern), false);
});

test('1 Woodward does not match 11… / 11531 Woodward', () => {
  const pattern = addressSearchPattern('1 Woodward');
  assert.equal(ilike('1 WOODWARD AVE', pattern), true);
  assert.equal(ilike('11531 WOODWARD AVE', pattern), false);
  assert.equal(ilike('11 WOODWARD AVE', pattern), false);
  assert.equal(ilike('10 WOODWARD AVE', pattern), false);
});

test('721 E MCNICHOLS does not match 6721 E MCNICHOLS', () => {
  const pattern = addressSearchPattern('721 E MCNICHOLS');
  assert.equal(ilike('721 E MCNICHOLS', pattern), true);
  assert.equal(ilike('6721 E MCNICHOLS', pattern), false);
  assert.equal(ilike('5721 E MCNICHOLS', pattern), false);
});

test('strips LIKE wildcards and rejects empty', () => {
  assert.equal(addressSearchPattern(''), null);
  assert.equal(addressSearchPattern('   '), null);
  assert.equal(addressSearchPattern('%'), null);
  assert.equal(addressSearchPattern('1 Woodward%'), '1 Woodward%');
  assert.equal(ilike('8901 WOODWARD AVE', addressSearchPattern('1 Woodward%')), false);
});
