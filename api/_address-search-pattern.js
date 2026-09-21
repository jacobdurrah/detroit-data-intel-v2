/**
 * Sales.address ILIKE pattern for map geocoding.
 * Prefix from the start so "1 Woodward Ave" does not match "8901 WOODWARD AVE".
 * LIKE wildcards in the user query are stripped so they cannot widen the match.
 */
function addressSearchPattern(q) {
  const query = String(q || '').trim().replace(/[%_]/g, '');
  if (!query) return null;
  return query + '%';
}

module.exports = { addressSearchPattern };
