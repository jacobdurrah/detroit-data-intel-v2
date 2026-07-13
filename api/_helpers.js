/**
 * Shared helpers for Detroit Data Intel V2 API functions
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

/**
 * Valid API keys for authentication
 */
const VALID_KEYS = new Set([
  process.env.DDI_API_KEY || 'frameworkai',
]);

/**
 * Check authentication. Returns true if blocked (unauthorized).
 * Accepts ?key= query param, Authorization: Bearer header, or x-api-key header.
 */
function checkAuth(req, res) {
  const key = req.query.key
    || (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
    || req.headers['x-api-key'];
  if (VALID_KEYS.has(key)) return false; // authenticated
  res.status(401).json({ error: 'Unauthorized. Pass ?key= or Authorization: Bearer header.' });
  return true; // blocked
}

/**
 * Setup endpoints can mutate database schema, so they require a separate
 * server-side secret and fail closed when it is not configured.
 */
function checkSetupAuth(req, res) {
  const expected = process.env.SETUP_API_KEY;
  if (!expected) {
    res.status(500).json({ error: 'SETUP_API_KEY is not configured.' });
    return true;
  }

  const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  if (token && token === expected) return false;

  res.status(401).json({ error: 'Unauthorized. Pass Authorization: Bearer <SETUP_API_KEY>.' });
  return true;
}

/**
 * Handle OPTIONS preflight and return true if handled
 */
function handleCors(req, res) {
  Object.entries(CORS_HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });
  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return true;
  }
  return false;
}

/**
 * Send a paginated JSON response
 */
function sendPaginated(res, data, page, limit) {
  const total = data.length;
  const start = (page - 1) * limit;
  const paged = data.slice(start, start + limit);
  res.status(200).json({
    data: paged,
    meta: { total, page, limit },
  });
}

/**
 * Send a JSON response (non-paginated)
 */
function sendJson(res, data, statusCode = 200) {
  res.status(statusCode).json(data);
}

/**
 * Send an error response
 */
function sendError(res, message, statusCode = 500) {
  res.status(statusCode).json({ error: message });
}

/**
 * Parse integer query param with default
 */
function intParam(val, defaultVal) {
  const parsed = parseInt(val, 10);
  return isNaN(parsed) ? defaultVal : parsed;
}

/**
 * Parse float query param
 */
function floatParam(val) {
  const parsed = parseFloat(val);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Parse bounds string "sw_lat,sw_lng,ne_lat,ne_lng" into object
 */
function parseBounds(boundsStr) {
  if (!boundsStr) return null;
  const parts = boundsStr.split(',').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return null;
  return { sw_lat: parts[0], sw_lng: parts[1], ne_lat: parts[2], ne_lng: parts[3] };
}

/**
 * Filter records by lat/lng bounding box
 */
function filterByBounds(records, bounds) {
  if (!bounds) return records;
  return records.filter(r => {
    if (r.lat == null || r.lng == null) return false;
    return r.lat >= bounds.sw_lat && r.lat <= bounds.ne_lat &&
           r.lng >= bounds.sw_lng && r.lng <= bounds.ne_lng;
  });
}

module.exports = {
  CORS_HEADERS,
  VALID_KEYS,
  checkAuth,
  checkSetupAuth,
  handleCors,
  sendPaginated,
  sendJson,
  sendError,
  intParam,
  floatParam,
  parseBounds,
  filterByBounds,
};
