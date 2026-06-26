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

function getAuthorizationHeader(req) {
  return (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
}

function constantTimeEquals(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  var crypto = require('crypto');
  var aBuf = Buffer.from(a);
  var bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function requireBearerToken(req, res, envName, label) {
  var expected = process.env[envName];
  if (!expected) {
    sendError(res, label + ' is not configured', 503);
    return false;
  }

  var header = getAuthorizationHeader(req);
  var actual = header.indexOf('Bearer ') === 0 ? header.slice(7) : '';
  if (!constantTimeEquals(actual, expected)) {
    sendError(res, 'unauthorized', 401);
    return false;
  }

  return true;
}

function requireSetupAuth(req, res) {
  return requireBearerToken(req, res, 'SETUP_API_KEY', 'setup API');
}

function requirePropertyPipelineAuth(req, res) {
  return requireBearerToken(req, res, 'PROPERTY_PIPELINE_API_KEY', 'property pipeline API');
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
  requireBearerToken,
  requireSetupAuth,
  requirePropertyPipelineAuth,
  intParam,
  floatParam,
  parseBounds,
  filterByBounds,
};
