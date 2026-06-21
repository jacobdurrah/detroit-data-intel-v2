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

function getHeader(req, name) {
  if (!req || !req.headers) return '';
  var titleCase = name.charAt(0).toUpperCase() + name.slice(1).toLowerCase();
  return req.headers[name] || req.headers[name.toLowerCase()] || req.headers[name.toUpperCase()] || req.headers[titleCase] || '';
}

function safeEqual(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  var diff = 0;
  for (var i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function requireBearerAuth(req, res, envNames) {
  var names = Array.isArray(envNames) ? envNames : [envNames || 'SETUP_API_KEY'];
  var expected = '';
  var configuredName = '';
  for (var i = 0; i < names.length; i += 1) {
    var value = (process.env[names[i]] || '').trim();
    if (value) {
      expected = value;
      configuredName = names[i];
      break;
    }
  }

  if (!expected) {
    console.error('Missing API auth secret. Set one of: ' + names.join(', '));
    sendError(res, 'Server authorization is not configured', 503);
    return false;
  }

  var auth = String(getHeader(req, 'authorization') || '');
  var match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match || !safeEqual(match[1].trim(), expected)) {
    sendError(res, 'Unauthorized', 401);
    return false;
  }

  req.authenticatedWith = configuredName;
  return true;
}

function requirePropertyWriteAuth(req, res) {
  return requireBearerAuth(req, res, ['PROPERTY_WRITE_API_KEY', 'SETUP_API_KEY']);
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
  requireBearerAuth,
  requirePropertyWriteAuth,
  intParam,
  floatParam,
  parseBounds,
  filterByBounds,
};
