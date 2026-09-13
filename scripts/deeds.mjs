#!/usr/bin/env node
// Register of Deeds from the command line — the same code the API runs, called directly (no rate limit; be polite).
//   node scripts/deeds.mjs search parcel=14002261.
//   node scripts/deeds.mjs search grantor="TOBBY ADALBERTO" doc_type=land_contracts from=2025-09-17 [--table]
//   node scripts/deeds.mjs entity name="ASSET GUARD" from=2023-01-01
//   node scripts/deeds.mjs parcel parcel=14002261.
//   node scripts/deeds.mjs doc-types
// Any API parameter works as key=value (repeat a key for several values). --api <base> calls a deployed API instead.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const [cmd = 'help', ...rest] = process.argv.slice(2);
const params = {}; let api = null, table = false;
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a === '--api') { api = rest[++i]; continue; }
  if (a === '--table') { table = true; continue; }
  const m = a.match(/^([a-z_]+)=(.*)$/); if (!m) continue;
  params[m[1]] = m[1] in params ? [].concat(params[m[1]], m[2]) : m[2];
}
const PATHS = { search: '/api/deeds/search', entity: '/api/deeds/entity', parcel: '/api/deeds/parcel', 'doc-types': '/api/deeds/doc-types', status: '/api/deeds/status' };
if (!PATHS[cmd]) { console.log('usage: deeds.mjs search|entity|parcel|doc-types|status key=value … [--table] [--api https://detroit-data-intel-v2.vercel.app]'); process.exit(cmd === 'help' ? 0 : 2); }
let out;
if (api) {
  const u = new URL(PATHS[cmd], api);
  for (const [k, v] of Object.entries(params)) for (const x of [].concat(v)) u.searchParams.append(k, x);
  const r = await fetch(u); out = await r.json(); if (!r.ok) { console.error(out.error || r.status); process.exit(1); }
} else {
  const d = require('../api/_deeds.js');
  try {
    out = cmd === 'search' ? await d.search(params) : cmd === 'entity' ? await d.entity(params) : cmd === 'parcel' ? await d.parcelHistory(params)
      : cmd === 'doc-types' ? { data: await d.docTypes() } : await d.certDate();
  } catch (e) { console.error(e.message); process.exit(1); }
}
if (table && Array.isArray(out.data)) {
  for (const x of out.data) console.log([x.recorded_date, (x.doc_type_code || '').padEnd(5), (x.parcels || []).map((p) => p.tax_id).join(',').padEnd(14), (x.address || '').padEnd(22), `${(x.grantors || []).join('; ')} → ${(x.grantees || []).join('; ')}`, x.consideration ?? ''].join('  '));
  if (out.meta) console.log(`— ${out.meta.returned ?? out.data.length} of ${out.meta.total ?? '?'} · certified through ${out.meta.certified_through}`);
} else console.log(JSON.stringify(out, null, 2));
if (!api) require('../api/_deeds.js').close();
