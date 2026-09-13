// Run the api/ functions locally without the Vercel CLI — for agents and tests.
//   node scripts/serve-api.mjs [--port 3999]      → http://localhost:3999/api/deeds/search?parcel=14002261.
// Shims the parts of Vercel's Node runtime the handlers use: req.query, req.body (JSON), res.status().json().
import http from 'node:http';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 3999;

function route(pathname) {
  if (pathname === '/llms.txt') return { file: path.join(root, 'public', 'llms.txt') };
  const f = path.join(root, `${pathname.replace(/\/$/, '')}.js`);
  if (pathname.startsWith('/api/') && !path.basename(f).startsWith('_') && fs.existsSync(f)) return { fn: require(f) };
  return null;
}
http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${port}`);
  const r = route(url.pathname);
  if (!r) { res.writeHead(404, { 'content-type': 'application/json' }); return res.end('{"error":"not found"}'); }
  if (r.file) { res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' }); return res.end(fs.readFileSync(r.file)); }
  req.query = {};
  for (const [k, v] of url.searchParams) req.query[k] = k in req.query ? [].concat(req.query[k], v) : v;
  const chunks = []; for await (const c of req) chunks.push(c);
  const raw = Buffer.concat(chunks).toString();
  try { req.body = raw && /json/.test(req.headers['content-type'] || '') ? JSON.parse(raw) : raw; } catch { req.body = raw; }
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (obj) => { if (!res.getHeader('content-type')) res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(obj)); return res; };
  try { await r.fn(req, res); } catch (e) { if (!res.headersSent) res.status(500).json({ error: e.message }); }
}).listen(port, () => console.log(`api on http://localhost:${port}`));
