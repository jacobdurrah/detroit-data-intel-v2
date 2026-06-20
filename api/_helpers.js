/**
 * Shared helpers for Detroit Data Intel V2 API functions
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Content-Type': 'application/json',
};

function safeTokenEquals(actual, expected) {
  if (!actual || !expected || actual.length !== expected.length) return false;

  try {
    const crypto = require('crypto');
    return crypto.timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
  } catch (err) {
    return false;
  }
}

function getBearerToken(req) {
  const headers = req.headers || {};
  const auth = headers.authorization || headers.Authorization || '';
  const prefix = 'Bearer ';
  return auth.startsWith(prefix) ? auth.slice(prefix.length) : null;
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
 * Require a server-configured bearer token for privileged API mutations.
 */
function requireApiAuth(req, res, envName = 'SETUP_API_KEY') {
  const expected = process.env[envName];
  if (!expected) {
    sendError(res, envName + ' is not configured', 500);
    return false;
  }

  const token = getBearerToken(req);
  if (!token) {
    sendError(res, 'Authorization bearer token is required', 401);
    return false;
  }

  if (!safeTokenEquals(token, expected)) {
    sendError(res, 'Forbidden', 403);
    return false;
  }

  return true;
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
  handleCors,
  sendPaginated,
  sendJson,
  sendError,
  requireApiAuth,
  intParam,
  floatParam,
  parseBounds,
  filterByBounds,
};
