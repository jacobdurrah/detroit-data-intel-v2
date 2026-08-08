const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseStreetNumber,
  streetNumberInRange,
  filterByStreetNumberRange,
} = require('../api/_streetNumber');

describe('streetNumberInRange', () => {
  it('includes numeric house numbers inside the block range', () => {
    assert.equal(streetNumberInRange('100', 100, 199), true);
    assert.equal(streetNumberInRange('150', 100, 199), true);
    assert.equal(streetNumberInRange('199', 100, 199), true);
  });

  it('excludes 1000-series numbers that lexicographic TEXT compare would keep', () => {
    // TEXT: "1000" >= "100" && "1000" <= "199" is true — must not happen numerically
    assert.equal('1000' >= '100' && '1000' <= '199', true);
    assert.equal(streetNumberInRange('1000', 100, 199), false);
    assert.equal(streetNumberInRange('1005', 100, 199), false);
  });

  it('rejects non-numeric street numbers', () => {
    assert.equal(streetNumberInRange('', 100, 199), false);
    assert.equal(streetNumberInRange(null, 100, 199), false);
    assert.equal(streetNumberInRange('N/A', 100, 199), false);
  });
});

describe('filterByStreetNumberRange', () => {
  it('keeps only rows whose street_number is numerically in range', () => {
    const rows = [
      { ticket_id: 1, street_number: '120' },
      { ticket_id: 2, street_number: '1000' },
      { ticket_id: 3, street_number: '180' },
      { ticket_id: 4, street_number: '99' },
    ];
    assert.deepEqual(
      filterByStreetNumberRange(rows, 100, 199).map((r) => r.ticket_id),
      [1, 3]
    );
  });
});

describe('parseStreetNumber', () => {
  it('parses leading digits from street number text', () => {
    assert.equal(parseStreetNumber('15852'), 15852);
    assert.equal(parseStreetNumber(' 42 '), 42);
  });
});
