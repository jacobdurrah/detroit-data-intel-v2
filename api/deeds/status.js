// GET /api/deeds/status — is the Register of Deeds reachable, and how current is its index.
const handler = require('./_handler');
const { certDate } = require('../_deeds');
module.exports = handler(async () => {
  const t0 = Date.now();
  const c = await certDate();
  return { ok: true, ...c, upstream_ms: Date.now() - t0, docs: '/llms.txt', openapi: '/api/deeds/openapi', mcp: '/api/mcp' };
}, { cacheSeconds: 300 });
