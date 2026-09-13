/**
 * Shared wrapper for the /api/deeds/* endpoints: open (no key), CORS, per-IP rate limit, CDN caching, and errors as
 * JSON with the status the core chose (400 bad query, 429 slow down, 502 upstream).
 */
const { handleCors } = require('../_helpers');

const WINDOW_MS = 60_000, PER_WINDOW = Number(process.env.DEEDS_RATE_PER_MIN || 60);
const hits = new Map();                              // ip → [timestamps] — per warm instance; the CDN cache absorbs repeats
function limited(req, res) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
  const now = Date.now();
  const recent = (hits.get(ip) || []).filter((t) => now - t < WINDOW_MS);
  recent.push(now);
  hits.set(ip, recent);
  if (hits.size > 5000) hits.delete(hits.keys().next().value);
  res.setHeader('X-RateLimit-Limit', String(PER_WINDOW));
  res.setHeader('X-RateLimit-Remaining', String(Math.max(0, PER_WINDOW - recent.length)));
  if (recent.length <= PER_WINDOW) return false;
  res.setHeader('Retry-After', String(Math.ceil((WINDOW_MS - (now - recent[0])) / 1000)));
  res.status(429).json({ error: `rate limit: ${PER_WINDOW} requests a minute per caller — for bulk work run the local CLI (scripts/deeds.mjs)` });
  return true;
}

/** fn(query) → body. cacheSeconds: how long the CDN may serve the same URL (the index is certified weekly). */
module.exports = (fn, { cacheSeconds = 3600 } = {}) => async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'GET') return res.status(405).json({ error: 'GET only' });
  if (limited(req, res)) return;
  try {
    const body = await fn(req.query || {}, req);
    res.setHeader('Cache-Control', `public, s-maxage=${cacheSeconds}, stale-while-revalidate=86400`);
    res.status(200).json(body);
  } catch (e) {
    const status = e.status || 500;
    if (status >= 500) console.error('[deeds]', e);
    res.status(status).json({ error: e.message, docs: '/llms.txt' });
  }
};
