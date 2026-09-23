/**
 * blight.street_number (and similar) is TEXT. PostgREST .gte/.lte on TEXT is
 * lexicographic, so range filters like 100–199 incorrectly include "1000".
 */

function parseStreetNumber(value) {
  if (value == null || value === '') return NaN;
  const n = parseInt(String(value).trim(), 10);
  return Number.isFinite(n) ? n : NaN;
}

function streetNumberInRange(value, minAddr, maxAddr) {
  const n = parseStreetNumber(value);
  if (!Number.isFinite(n)) return false;
  return n >= minAddr && n <= maxAddr;
}

function filterByStreetNumberRange(rows, minAddr, maxAddr) {
  return (rows || []).filter((row) =>
    streetNumberInRange(row.street_number, minAddr, maxAddr)
  );
}

module.exports = {
  parseStreetNumber,
  streetNumberInRange,
  filterByStreetNumberRange,
};
