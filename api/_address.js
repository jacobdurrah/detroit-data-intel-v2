/**
 * Shared address parsing for Detroit Data Intel V2 APIs.
 * blight rows store street_number + street_name separately (no full address).
 */

function normalizeAddress(addr) {
  if (!addr) return '';
  return String(addr).toUpperCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Parse "2404 PENNSYLVANIA ST" → { streetNumber: "2404", streetName: "PENNSYLVANIA" }
 * Returns null when the input does not start with a street number.
 */
function parseStreetAddress(addr) {
  const normalized = normalizeAddress(addr);
  const match = normalized.match(/^(\d+)\s+(.+)$/);
  if (!match) return null;

  const streetNumber = match[1];
  const streetName = match[2]
    .replace(/\s+(ST|AVE|DR|BLVD|RD|CT|PL|LN|WAY|CIR|TER|PKWY)\.?$/i, '')
    .trim();

  if (!streetName) return null;
  return { streetNumber, streetName };
}

module.exports = {
  normalizeAddress,
  parseStreetAddress,
};
