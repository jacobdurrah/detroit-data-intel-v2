// Phase R accept — the Register of Deeds API and MCP server, end to end against a base URL.
//   node scripts/test-deeds.mjs [--base http://localhost:3999]   (node scripts/serve-api.mjs runs it locally)
// Known ground truth (recorded 2025–26): 4661 Vancouver, Tax ID 14/002261 — Treasurer deed to Tobby Adalberto LLC
// 2025-10-16, then a memo of land contract 2025-12-01; Marcus Jamar sold seven parcels to Craft One Enterprise.
const i = process.argv.indexOf('--base');
const BASE = (i > 0 ? process.argv[i + 1] : 'http://localhost:3999').replace(/\/$/, '');
const headers = process.env.VERCEL_BYPASS ? { 'x-vercel-protection-bypass': process.env.VERCEL_BYPASS } : {};
let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => { console.log(`${cond ? '  ok  ' : ' FAIL '} ${name}${detail ? ` — ${detail}` : ''}`); cond ? pass++ : fail++; };
const get = async (p) => { const r = await fetch(BASE + p, { headers }); let j = null; try { j = await r.json(); } catch { /* not json */ } return { status: r.status, j, h: r.headers }; };
const mcp = async (method, params, id = 1) => (await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { ...headers, 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: JSON.stringify({ jsonrpc: '2.0', id, method, params }) })).json();

const st = await get('/api/deeds/status');
ok('status: upstream reachable, certification date', st.j?.ok && /^\d{4}-\d{2}-\d{2}$/.test(st.j.certified_through || ''), st.j?.certified_through);
const p = await get('/api/deeds/search?parcel=14002261.&from=2025-01-01&sort=recorded_asc');
const codes = (p.j?.data || []).map((d) => d.doc_type_code);
ok('parcel (City id) → quick search, Treasurer deed then land contract', p.j?.meta?.mode === 'quick' && codes.includes('TQCD') && codes.includes('LCM'), codes.join(','));
ok('records normalised (ISO dates, Tax ID ↔ City id, address, link)', (p.j?.data || []).every((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.recorded_date) && d.parcels[0]?.tax_id === '14/002261' && d.parcels[0]?.city_parcel_id === '14002261.' && /VANCOUVER/.test(d.address || '') && /\/doc\/\d+$/.test(d.url)));
const g = await get('/api/deeds/search?grantor=Tobby%20Adalberto%20LLC&doc_type=land_contracts&from=2025-09-17&to=2026-08-10');
ok('grantor + doc_type group (LLC words dropped)', g.j?.meta?.mode === 'advanced' && g.j.meta.total >= 10 && g.j.data.every((d) => /LAND CONTRACT/.test(d.doc_type)), `${g.j?.meta?.total} land contracts`);
const both = await get('/api/deeds/search?grantor=TOBBY%20ADALBERTO&grantee=CRUZ%20FRANCISCO&from=2025-09-17&to=2026-08-10');
ok('grantor AND grantee', both.j?.meta?.total >= 1 && both.j.data.every((d) => d.grantees.some((n) => /CRUZ/.test(n))), `${both.j?.meta?.total}`);
const pg = await get('/api/deeds/search?party=ASSET%20GUARD&from=2025-01-01&to=2026-08-10&all=true');
ok('party, all pages', pg.j?.meta?.fetched === pg.j?.meta?.total && pg.j.meta.total > 100, `${pg.j?.meta?.fetched}/${pg.j?.meta?.total}`);
const dt = await get('/api/deeds/search?doc_type=TQCD&from=2025-10-01&to=2025-10-31&municipality=DETROIT&limit=10');
ok('doc_type + dates + municipality filter', dt.j?.meta?.total > 1000 && dt.j.data.every((d) => d.doc_type_code === 'TQCD' && /DETROIT/.test(d.municipality || '')), `${dt.j?.meta?.total} Treasurer deeds in Oct 2025`);
const addr = await get('/api/deeds/search?address=4661%20VANCOUVER&from=2025-01-01');
ok('address lookup', (addr.j?.data || []).some((d) => d.parcels.some((x) => x.tax_id === '14/002261')));
const bad = await get('/api/deeds/search?from=2025-01-01');
ok('no criteria → 400 with guidance', bad.status === 400 && /give at least one/.test(bad.j?.error || ''));
const bad2 = await get('/api/deeds/search?grantor=X&doc_type=NOPE');
ok('unknown doc_type → 400', bad2.status === 400);
const wide = await get('/api/deeds/search?doc_type=WD&from=2020-01-01&to=2026-01-01');
ok('doc_type alone over > 1 year → 400', wide.status === 400);
const e = await get('/api/deeds/entity?name=MARCUS%20JAMAR&from=2025-01-01&to=2026-08-10');
const top = e.j?.summary?.as_grantor?.top_counterparties?.[0];
ok('entity: top counterparty and per-parcel timeline', /CRAFT ONE/.test(top?.name || '') && top.n >= 7 && e.j.parcels.some((x) => x.in.length && x.out.length && x.held_days != null), `${top?.name} ×${top?.n}`);
const par = await get('/api/deeds/parcel?parcel=14/002261');
ok('parcel history, oldest first', (par.j?.data || []).length >= 10 && par.j.data[0].recorded_date < par.j.data.at(-1).recorded_date, `${par.j?.data?.length} documents`);
const types = await get('/api/deeds/doc-types');
ok('doc types + groups', types.j?.data?.length > 100 && types.j.groups.land_contracts.includes('LCM') && types.j.groups.treasurer.includes('TQCD') && types.j.groups.foreclosure.includes('TJOF'));
const oa = await get('/api/deeds/openapi');
ok('OpenAPI 3.1 document', oa.j?.openapi === '3.1.0' && oa.j.paths['/api/deeds/search']);
const llms = await fetch(`${BASE}/llms.txt`, { headers }); const lt = await llms.text();
ok('llms.txt names the endpoints and MCP', llms.ok && /\/api\/deeds\/search/.test(lt) && /\/api\/mcp/.test(lt));
// Locally the header carries s-maxage; on Vercel the CDN consumes it and answers x-vercel-cache instead.
ok('CORS open, responses cacheable', st.h.get('access-control-allow-origin') === '*' && (/s-maxage/.test(p.h.get('cache-control') || '') || /HIT|MISS|STALE|PRERENDER/.test(p.h.get('x-vercel-cache') || '')), p.h.get('x-vercel-cache') || p.h.get('cache-control'));
const init = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test-deeds', version: '1' } });
ok('MCP initialize', init.result?.serverInfo?.name === 'detroit-data', init.result?.protocolVersion);
const tl = await mcp('tools/list', {}, 2);
ok('MCP tools/list', ['deeds_search', 'deeds_entity', 'deeds_parcel', 'deeds_doc_types'].every((n) => tl.result?.tools?.some((t) => t.name === n)));
const call = await mcp('tools/call', { name: 'deeds_search', arguments: { parcel: '14002261.', from: '2025-01-01' } }, 3);
let callData = null; try { callData = JSON.parse(call.result.content[0].text); } catch { /* reported below */ }
ok('MCP tools/call deeds_search', callData?.data?.some((d) => d.doc_type_code === 'LCM'));
const err = await mcp('tools/call', { name: 'deeds_search', arguments: {} }, 4);
ok('MCP error path is a tool error, not a crash', err.result?.isError === true);
console.log(`\n${pass} passed, ${fail} failed — ${BASE}`);
process.exit(fail ? 1 : 0);
