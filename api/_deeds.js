/**
 * Wayne County Register of Deeds — the public index, as an API (docs: /llms.txt, /api/deeds/openapi).
 *
 * Source: wayne.mi.publicsearch.us (Kofile / Neumo). The page is a shell over one WebSocket (/ws): a search is a
 * "@kofile/FETCH_DOCUMENTS/v4" message carrying the same query as the site's results URL; the reply is the index
 * records as JSON. No browser is needed — one GET for the site's anonymous authToken cookie, then the socket.
 *
 * Two kinds of search, both over the anonymous session: the advanced search (grantor and/or grantee and/or document
 * type, within a recorded-date range) and the quick search (one text value: a Tax ID "14/002261", an address
 * "4661 VANCOUVER", a name, a document number). Index data only — parties, type, dates, Tax ID, legal description,
 * the consideration where the clerk entered one, an OCR excerpt; no images.
 * The site's own UI offers the quick search to Pay As You Go sessions; its search service answers it for the
 * anonymous session too. It is used here by the operator's decision (2026-09-13), behind DEEDS_QUICK_SEARCH — set it
 * to "off" to stop sending quick searches (parcel lookups then fall back to free name searches; see parcelHistory).
 *
 * Politeness: one socket per warm instance, at most MAX_INFLIGHT upstream searches at a time, identical searches
 * answered from a short in-memory cache (the endpoints also set CDN cache headers).
 */

const ROD = 'https://wayne.mi.publicsearch.us';
const UA = 'DetroitDataIntel/1.0 (+https://detroit-data-intel-v2.vercel.app/llms.txt)';
const MAX_INFLIGHT = 3;
const CACHE_MS = 30 * 60 * 1000;
const PAGE = 250;                                   // the upstream's largest page
const QUICK = !/^(0|off|false|no)$/i.test(process.env.DEEDS_QUICK_SEARCH || 'on');

// ------------------------------------------------------------------ connection
let conn = null;                                    // { ws, token, wait: Map, opened }

async function connect() {
  if (conn && conn.ws.readyState === 1 && Date.now() - conn.opened < 20 * 60 * 1000) return conn;
  if (conn) try { conn.ws.close(); } catch { /* already closed */ }
  const r = await fetch(`${ROD}/search/advanced`, { headers: { 'user-agent': UA } });
  const cookies = (r.headers.getSetCookie ? r.headers.getSetCookie() : []).map((c) => c.split(';')[0]);
  const token = (cookies.find((c) => c.startsWith('authToken=')) || '').split('=')[1];
  if (!token) throw upstreamError('no session token from the Register of Deeds site');
  const html = await r.text();
  const ws = new WebSocket(`wss://${new URL(ROD).host}/ws`, { headers: { cookie: cookies.join('; '), origin: ROD, 'user-agent': UA } });
  await new Promise((ok, bad) => {
    const t = setTimeout(() => bad(upstreamError('Register of Deeds socket did not open')), 10_000);
    ws.onopen = () => { clearTimeout(t); ok(); };
    ws.onerror = () => { clearTimeout(t); bad(upstreamError('Register of Deeds socket failed')); };
  });
  const wait = new Map();
  ws.onmessage = (e) => {
    let m; try { m = JSON.parse(e.data); } catch { return; }
    const w = wait.get(m.correlationId);
    if (w) { wait.delete(m.correlationId); w(m); }
  };
  ws.onclose = () => { for (const w of wait.values()) w({ type: 'closed' }); wait.clear(); if (conn && conn.ws === ws) conn = null; };
  conn = { ws, token, wait, opened: Date.now(), docTypes: parseDocTypes(html) };
  return conn;
}

let inflight = 0;
const queue = [];
async function slot() {
  if (inflight < MAX_INFLIGHT) { inflight++; return; }
  await new Promise((ok) => queue.push(ok));
  inflight++;
}
function release() { inflight--; const next = queue.shift(); if (next) next(); }

async function send(type, payload, timeoutMs = 20_000) {
  await slot();
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      const c = await connect();
      const correlationId = crypto.randomUUID();
      const m = await new Promise((ok) => {
        const t = setTimeout(() => { c.wait.delete(correlationId); ok({ type: 'timeout' }); }, timeoutMs);
        c.wait.set(correlationId, (msg) => { clearTimeout(t); ok(msg); });
        c.ws.send(JSON.stringify({ type, payload, authToken: c.token, correlationId, sync: true }));
      });
      if (m.type !== 'closed' && m.type !== 'timeout') return m;
      conn = null;                                  // a stale socket: reconnect once
      if (attempt === 1) throw upstreamError(`Register of Deeds did not answer (${m.type})`);
    }
  } finally { release(); }
}

function upstreamError(message) { const e = new Error(message); e.status = 502; return e; }
function badRequest(message) { const e = new Error(message); e.status = 400; return e; }

// ------------------------------------------------------------------ vocabulary
/** The site ships its document-type list in the page: {"code":"LCM","description":"MEMO OF LAND CONTRACT"}. */
function parseDocTypes(html) {
  const out = new Map();
  for (const m of html.matchAll(/\{"code":"([^"]+)","description":"([^"]+)"\}/g)) out.set(m[1], m[2]);
  return [...out].map(([code, description]) => ({ code, description }));
}
async function docTypes() { return (await connect()).docTypes; }

/** Friendly groups → the codes whose description matches. */
const GROUPS = {
  deeds: (d) => /\bDEED\b/.test(d) && !/MASTER DEED|DEED RESTRICTION/.test(d),
  land_contracts: (d) => /LAND CONTRACT|INSTALLMENT CONTRACT/.test(d) && !/TERMINATION/.test(d),
  mortgages: (d) => /MORTGAGE/.test(d) && !/DISCHARGE|RELEASE|SATISFACTION/.test(d),
  discharges: (d) => /DISCHARGE|SATISFACTION/.test(d),
  liens: (d) => /LIEN/.test(d) && !/RELEASE/.test(d),
  treasurer: (d) => /TREASURER|-WCTO\b/.test(d),       // WCTO = Wayne County Treasurer's Office (TQCD = its deed to an auction buyer)
  foreclosure: (d) => /FORFEITURE|FORECLOSURE/.test(d) && !/RELEASE/.test(d),
};
async function resolveDocTypes(list) {
  if (!list.length) return [];
  const all = await docTypes();
  const codes = new Set();
  for (const raw of list) {
    const v = raw.trim().toUpperCase();
    const g = GROUPS[v.toLowerCase().replace(/[\s-]+/g, '_')];
    if (g) { for (const t of all) if (g(t.description)) codes.add(t.code); continue; }
    const byCode = all.find((t) => t.code === v);
    const byDesc = all.filter((t) => t.description === v || (v.length >= 5 && t.description.includes(v)));
    if (byCode) codes.add(byCode.code); else if (byDesc.length) byDesc.forEach((t) => codes.add(t.code));
    else throw badRequest(`unknown doc_type "${raw}" — see /api/deeds/doc-types`);
  }
  return [...codes];
}

// ------------------------------------------------------------------ names, parcels, dates
const ENTITY_WORDS = /\b(L ?L ?C|L ?L ?P|INC|INCORPORATED|CORP|CORPORATION|CO|COMPANY|LTD|THE)\b/g;
/** The index tokenises names and spells LLC "L L C": search on the distinctive words. */
function nameTerm(name, exact) {
  let t = String(name).toUpperCase().replace(/[.,'"()]/g, ' ');
  if (!exact) t = t.replace(ENTITY_WORDS, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  if (t.replace(/\s/g, '').length < 3) throw badRequest(`name "${name}" is too short to search`);
  return t;
}
/** "14/002261" ↔ City of Detroit "14002261." ; "20/013758.011" ↔ "20013758.011" ; "16/002903-4" ↔ "16002903-4".
 *  Only Detroit's ward + 6-digit ids take the slash: the suburbs' 14-digit ids ("33051042070000") are the Tax ID as is. */
function toTaxId(p) {
  const s = String(p).trim().toUpperCase();
  if (s.includes('/')) return s;
  const m = s.match(/^(\d{2})(\d{6}(?:[.-][0-9A-Z]+)?)\.?$/);
  return m ? `${m[1]}/${m[2]}` : s;
}
function toCityParcel(taxId) {
  const [ward, rest] = String(taxId).split('/');
  if (!rest) return null;
  return /[.-]/.test(rest) ? `${ward}${rest}` : `${ward}${rest}.`;
}
function isoDate(v, name) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/); if (m) return `${m[1]}${m[2]}${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); if (m) return `${m[3]}${m[1].padStart(2, '0')}${m[2].padStart(2, '0')}`;
  throw badRequest(`${name} must be YYYY-MM-DD`);
}
const usToIso = (us) => { if (!us) return null; const [m, d, y] = String(us).split('/'); return y ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null; };
const money = (s) => { if (s == null) return null; const n = Number(String(s).replace(/[$,]/g, '')); return Number.isFinite(n) ? n : null; };
const strip = (xs) => (Array.isArray(xs) ? xs : []).map((s) => String(s).replace(/<\/?em>/g, '').trim()).filter(Boolean);

/** One index record → the shape this API returns. The quick search wraps matched text in <em> anywhere — even in dates. */
const deEm = (v) => (typeof v === 'string' ? v.replace(/<\/?em>/g, '') : Array.isArray(v) ? v.map(deEm) : v);
function normalize(raw) {
  const r = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, deEm(v)]));
  const legal = strip(r.legalDescription)[0] || null;
  const field = (k) => { const m = legal && legal.match(new RegExp(`${k}: ([^,]+)`)); return m ? m[1].trim() : null; };
  const municipality = field('Municipality');
  // Two spellings in the index: "Street#: 4661 VANCOUVER", or "Street: 4661, Street#: VANCOUVER".
  const a = field('Street#'), b = field('Street');
  const address = b && /^\d+[A-Z]?$/.test(b) && a ? `${b} ${a}` : a || b;
  const detroit = /DETROIT/.test(municipality || '');
  return {
    doc_id: Number(r.docId), doc_number: r.docNumber || r.instrumentNumber || null,
    doc_type: r.docType || null, doc_type_code: r.docTypeCode || null,
    recorded_date: usToIso(r.recordedDate), instrument_date: usToIso(r.instrumentDate),
    grantors: strip(r.grantor), grantees: strip(r.grantee),
    parcels: [...new Set(strip(r.parcel))].map((t) => ({ tax_id: t, city_parcel_id: detroit ? toCityParcel(t) : null })),
    address: address || null, municipality,
    consideration: money(r.consideration), consideration_raw: r.consideration ?? null,
    legal, ocr_excerpt: r.ocrText || null, pages: r.pageCount ?? null, book_page: r.bookVolumePage || null,
    url: `${ROD}/doc/${r.docId}`,
  };
}

// ------------------------------------------------------------------ search
const cache = new Map();
function cached(key) { const c = cache.get(key); if (c && Date.now() - c.at < CACHE_MS) return c.value; cache.delete(key); return null; }
function remember(key, value) { if (cache.size > 400) cache.delete(cache.keys().next().value); cache.set(key, { at: Date.now(), value }); }

async function certDate() {
  const key = 'cert';
  const hit = cached(key); if (hit) return hit;
  const m = await send('fetch-department-dates', { department: 'RP' });
  const v = { certified_through: m.payload?.certDate || null, recorded_through: (m.payload?.recorded?.to || '').slice(0, 10) || null };
  remember(key, v);
  return v;
}

async function fetchPage(query) {
  const key = JSON.stringify(query);
  const hit = cached(key); if (hit) return hit;
  const m = await send('@kofile/FETCH_DOCUMENTS/v4', { query: { department: 'RP', ...query }, workspaceID: 'ddi' });
  if (!/FULFILLED/.test(m.type)) throw upstreamError(`Register of Deeds refused the search (${m.type})`);
  const d = m.payload?.data || { byOrder: [], byHash: {} };
  const v = { total: m.payload?.meta?.numRecords || 0, records: d.byOrder.map((id) => d.byHash[id]), stats: m.payload?.meta?.statistics || null };
  remember(key, v);
  return v;
}

const list = (v) => (v == null ? [] : (Array.isArray(v) ? v : [v]).flatMap((x) => String(x).split('|')).map((s) => s.trim()).filter(Boolean));
const bool = (v) => v === true || /^(1|true|yes)$/i.test(String(v ?? ''));

/**
 * The flexible search. Params (strings, as from a query string; lists may repeat or use "|"):
 *   grantor, grantee, party (either side)  — names; several in one field are OR'd, fields are AND'd
 *   exact                                  — keep LLC/INC words in the name (default: drop them; the index spells "L L C")
 *   doc_type                               — codes (WD, QCD, LCM…), descriptions, or groups: deeds, land_contracts,
 *                                            mortgages, discharges, liens, treasurer, foreclosure
 *   from, to                               — recorded date range, YYYY-MM-DD (default: all time → certification date)
 *   sort                                   — recorded_desc (default) · recorded_asc · relevance
 *   limit (1–250, default 50), offset      — one upstream page
 *   all, max                               — follow pages up to max (default 1000, cap 2500)
 *   parcel, municipality, address          — filters on the results (parcel: Tax ID "14/002261" or City "14002261.")
 *   min_consideration, max_consideration   — filters on the entered consideration
 */
async function search(params) {
  const p = params || {};
  const exact = bool(p.exact);
  const parties = {};
  const addRole = (role, types) => { const names = list(p[role]); if (names.length) parties[role === 'party' ? 'grantor' : role] = [...(parties[role === 'party' ? 'grantor' : role] || []), ...names.map((n) => ({ term: nameTerm(n, exact), types }))]; };
  addRole('grantor', ['grantor']);
  addRole('grantee', ['grantee']);
  if (list(p.party).length) {
    if (parties.grantor) throw badRequest('use party alone, or grantor/grantee — not both');
    addRole('party', ['grantor', 'grantee']);
  }
  const codes = await resolveDocTypes(list(p.doc_type ?? p.doc_types ?? p.docType));
  // Quick search: each parcel / address / q / doc_number value is its own search; names and doc types then filter.
  const quickValues = QUICK ? [...list(p.parcel).map(toTaxId), ...list(p.address), ...list(p.q), ...list(p.doc_number)] : [];
  if (!quickValues.length && !Object.keys(parties).length && !codes.length) {
    throw badRequest(QUICK ? 'give at least one of parcel, address, q, doc_number, grantor, grantee, party, doc_type'
      : 'give at least one of grantor, grantee, party, doc_type (quick search is switched off: parcel and address only filter)');
  }
  const cert = await certDate();
  const from = isoDate(p.from, 'from') || '18000101';
  const to = isoDate(p.to, 'to') || (cert.certified_through || '').replace(/-/g, '') || '29991231';
  if (quickValues.length) return quickSearch(p, quickValues, { parties, codes, from, to, cert });
  if (!Object.keys(parties).length) {
    const days = (Date.parse(`${to.slice(0, 4)}-${to.slice(4, 6)}-${to.slice(6)}`) - Date.parse(`${from.slice(0, 4)}-${from.slice(4, 6)}-${from.slice(6)}`)) / 86_400_000;
    if (days > 366) throw badRequest('a doc_type search without names needs a from/to range of a year or less');
  }
  const sort = String(p.sort || 'recorded_desc');
  const order = sort === 'relevance' ? {} : { sortBy: 'recordedDate', sort: sort === 'recorded_asc' ? 'asc' : 'desc' };
  const query = { searchType: 'advancedSearch', recordedDateRange: `${from},${to}`, ...order };
  if (Object.keys(parties).length) query.parties = JSON.stringify(parties);
  if (codes.length) query.docTypes = codes.join(',');

  const all = bool(p.all);
  const limit = Math.max(1, Math.min(PAGE, parseInt(p.limit, 10) || (all ? PAGE : 50)));
  const offset = Math.max(0, parseInt(p.offset, 10) || 0);
  const max = Math.max(1, Math.min(2500, parseInt(p.max, 10) || 1000));
  const t0 = Date.now();
  const first = await fetchPage({ ...query, limit: String(limit), offset: String(offset) });
  let records = first.records;
  if (all) for (let off = offset + limit; off < Math.min(first.total, offset + max); off += PAGE) records = records.concat((await fetchPage({ ...query, limit: String(PAGE), offset: String(off) })).records);

  let docs = records.map(normalize);
  const parcels = new Set(list(p.parcel).map(toTaxId));
  const muni = p.municipality ? String(p.municipality).toUpperCase() : null;
  const addr = p.address ? String(p.address).toUpperCase().replace(/\s+/g, ' ').trim() : null;
  const minC = p.min_consideration != null ? Number(p.min_consideration) : null, maxC = p.max_consideration != null ? Number(p.max_consideration) : null;
  const filtered = parcels.size || muni || addr || minC != null || maxC != null;
  if (parcels.size) docs = docs.filter((d) => d.parcels.some((x) => parcels.has(x.tax_id)));
  if (muni) docs = docs.filter((d) => (d.municipality || '').toUpperCase().includes(muni));
  if (addr) docs = docs.filter((d) => (d.address || '').toUpperCase().includes(addr) || (d.legal || '').toUpperCase().includes(addr));
  if (minC != null) docs = docs.filter((d) => d.consideration != null && d.consideration >= minC);
  if (maxC != null) docs = docs.filter((d) => d.consideration != null && d.consideration <= maxC);

  return {
    meta: {
      source: 'Wayne County Register of Deeds public index (wayne.mi.publicsearch.us) — index data only, no document images',
      certified_through: cert.certified_through, mode: 'advanced', total: first.total, fetched: records.length, returned: docs.length,
      filtered_after_fetch: Boolean(filtered), limit, offset, next_offset: offset + records.length < first.total ? offset + records.length : null,
      truncated: all && offset + records.length < first.total, took_ms: Date.now() - t0,
      query: { parties, doc_type_codes: codes, from, to, sort },
      by_doc_type: first.stats?.docTypes || null, by_year: first.stats?.['recorded-years'] || null,
    },
    data: docs,
  };
}

/** The quick-search path of search(): one upstream search per value, merged; names and doc types filter after. */
async function quickSearch(p, values, { parties, codes, from, to, cert }) {
  const sort = String(p.sort || 'recorded_desc');
  const order = sort === 'relevance' ? {} : { sortBy: 'recordedDate', sort: sort === 'recorded_asc' ? 'asc' : 'desc' };
  const max = Math.max(1, Math.min(2500, parseInt(p.max, 10) || 1000));
  const t0 = Date.now();
  const seen = new Map(); let total = 0, truncated = false;
  for (const v of values.slice(0, 25)) {
    const query = { searchType: 'quickSearch', searchValue: v, keywordSearch: 'false', searchOchoice: 'false', recordedDateRange: `${from},${to}`, ...order };
    const first = await fetchPage({ ...query, limit: String(PAGE), offset: '0' });
    total += first.total;
    let records = first.records;
    for (let off = PAGE; off < Math.min(first.total, max); off += PAGE) records = records.concat((await fetchPage({ ...query, limit: String(PAGE), offset: String(off) })).records);
    if (records.length < first.total) truncated = true;
    for (const r of records) seen.set(r.docId, r);
  }
  let docs = [...seen.values()].map(normalize);
  const want = (role) => (parties[role] || []).map((x) => ({ words: x.term.split(' '), types: x.types }));
  const has = (d, w) => w.words.every((word) => w.types.some((t) => (t === 'grantor' ? d.grantors : d.grantees).some((n) => n.toUpperCase().split(/\s+/).includes(word))));
  const g = want('grantor'), e = want('grantee');
  if (g.length) docs = docs.filter((d) => g.some((w) => has(d, w)));
  if (e.length) docs = docs.filter((d) => e.some((w) => has(d, w)));
  if (codes.length) docs = docs.filter((d) => codes.includes(d.doc_type_code));
  const muni = p.municipality ? String(p.municipality).toUpperCase() : null;
  if (muni) docs = docs.filter((d) => (d.municipality || '').toUpperCase().includes(muni));
  const minC = p.min_consideration != null ? Number(p.min_consideration) : null, maxC = p.max_consideration != null ? Number(p.max_consideration) : null;
  if (minC != null) docs = docs.filter((d) => d.consideration != null && d.consideration >= minC);
  if (maxC != null) docs = docs.filter((d) => d.consideration != null && d.consideration <= maxC);
  docs.sort((a, b) => sort === 'recorded_asc' ? (a.recorded_date || '').localeCompare(b.recorded_date || '') : sort === 'relevance' ? 0 : (b.recorded_date || '').localeCompare(a.recorded_date || ''));
  const limit = Math.max(1, Math.min(2500, parseInt(p.limit, 10) || docs.length || 1));
  const offset = Math.max(0, parseInt(p.offset, 10) || 0);
  return {
    meta: {
      source: 'Wayne County Register of Deeds public index (wayne.mi.publicsearch.us) — quick search; index data only, no document images',
      certified_through: cert.certified_through, mode: 'quick', total, fetched: seen.size, returned: Math.min(limit, Math.max(0, docs.length - offset)), matched: docs.length,
      limit, offset, next_offset: offset + limit < docs.length ? offset + limit : null, truncated, took_ms: Date.now() - t0,
      query: { values, parties, doc_type_codes: codes, from, to, sort },
    },
    data: docs.slice(offset, offset + limit),
  };
}

// ------------------------------------------------------------------ entity
/** Everything one entity is party to, both sides, summarised: how it buys, what it sells, whom it deals with. */
async function entity(params) {
  const p = params || {};
  const names = list(p.name);
  if (!names.length) throw badRequest('name is required');
  const base = { from: p.from, to: p.to, exact: p.exact, doc_type: p.doc_type, all: true, max: Math.min(1500, parseInt(p.max, 10) || 500) };
  const [out, inn] = await Promise.all([search({ ...base, grantor: names }), search({ ...base, grantee: names })]);
  const side = (r, other) => {
    const count = (xs) => Object.entries(xs.reduce((m, k) => { if (k) m[k] = (m[k] || 0) + 1; return m; }, {})).sort((a, b) => b[1] - a[1]);
    return {
      total: r.meta.total, fetched: r.meta.fetched, truncated: r.meta.truncated,
      by_doc_type: count(r.data.map((d) => d.doc_type)).map(([k, n]) => ({ doc_type: k, n })),
      by_year: count(r.data.map((d) => (d.recorded_date || '').slice(0, 4))).map(([k, n]) => ({ year: k, n })).sort((a, b) => a.year.localeCompare(b.year)),
      top_counterparties: count(r.data.flatMap((d) => d[other])).slice(0, 15).map(([k, n]) => ({ name: k, n })),
      first: r.data.map((d) => d.recorded_date).filter(Boolean).sort()[0] || null, last: r.data.map((d) => d.recorded_date).filter(Boolean).sort().at(-1) || null,
    };
  };
  // Per parcel: when it came in, when it went out, and how.
  const byParcel = new Map();
  for (const [dir, r] of [['in', inn], ['out', out]]) for (const d of r.data) for (const x of d.parcels) {
    const e = byParcel.get(x.tax_id) || { tax_id: x.tax_id, city_parcel_id: x.city_parcel_id, address: d.address, municipality: d.municipality, in: [], out: [] };
    e[dir].push({ date: d.recorded_date, doc_type: d.doc_type, consideration: d.consideration, counterparties: dir === 'in' ? d.grantors : d.grantees, url: d.url });
    byParcel.set(x.tax_id, e);
  }
  const parcels = [...byParcel.values()].map((e) => {
    e.in.sort((a, b) => (a.date || '').localeCompare(b.date || '')); e.out.sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    const firstIn = e.in[0], firstOut = e.out.find((o) => !firstIn || (o.date || '') >= (firstIn.date || ''));
    return { ...e, held_days: firstIn && firstOut ? Math.round((Date.parse(firstOut.date) - Date.parse(firstIn.date)) / 86_400_000) : null };
  }).sort((a, b) => (b.in[0]?.date || '').localeCompare(a.in[0]?.date || ''));
  return {
    meta: { source: out.meta.source, certified_through: out.meta.certified_through, names, terms: [...new Set(names.map((n) => nameTerm(n, bool(p.exact))))], from: out.meta.query.from, to: out.meta.query.to,
            note: 'Name searches are token matches: common personal names also match other people — check grantors/grantees and parcels before attributing.' },
    summary: { as_grantor: side(out, 'grantees'), as_grantee: side(inn, 'grantors'), parcels: parcels.length },
    parcels,
    documents: { as_grantor: out.data, as_grantee: inn.data },
  };
}

// ------------------------------------------------------------------ parcel history from free searches
/**
 * A parcel's record without the county's paid parcel search: take the names the City of Detroit's public records
 * attach to the parcel (the owner in the parcel file, every grantor and grantee in its sales history), search each
 * name — free — and keep the documents that carry this Tax ID. Finds what any known party recorded; a document
 * between two parties the City never saw is not found (the paid search would find it).
 */
const ARCGIS = 'https://services2.arcgis.com/qvkbeam7Wirps6zC/ArcGIS/rest/services';
async function arcgis(service, where, outFields) {
  const body = new URLSearchParams({ where, outFields, f: 'json', returnGeometry: 'false', resultRecordCount: '200' });
  const r = await fetch(`${ARCGIS}/${service}/FeatureServer/0/query`, { method: 'POST', body, headers: { 'content-type': 'application/x-www-form-urlencoded' } });
  const j = await r.json();
  if (j.error) throw upstreamError(`City of Detroit ${service}: ${j.error.message || 'error'}`);
  return (j.features || []).map((f) => f.attributes);
}
async function parcelHistory(params) {
  const p = params || {};
  const raw = list(p.parcel)[0];
  if (!raw) throw badRequest('parcel is required (City id "14002261." or Tax ID "14/002261")');
  const taxId = toTaxId(raw), city = toCityParcel(taxId);
  if (QUICK) {
    const r = await search({ parcel: taxId, from: p.from, to: p.to, doc_type: p.doc_type, sort: 'recorded_asc' });
    return { meta: { ...r.meta, tax_id: taxId, city_parcel_id: city, method: 'quick search by Tax ID' }, data: r.data };
  }
  const q = `'${city.replace(/'/g, "''")}'`;
  const [file, sales] = await Promise.all([
    arcgis('parcel_file_current', `parcel_id = ${q}`, 'parcel_id,address,taxpayer_1,taxpayer_2'),
    arcgis('assessor_property_sales_view', `parcel_id = ${q}`, 'sale_date,grantor,grantee,amt_sale_price'),
  ]);
  const names = new Set([...list(p.names), ...file.flatMap((f) => [f.taxpayer_1, f.taxpayer_2]), ...sales.flatMap((s) => [s.grantor, s.grantee])]
    .filter(Boolean).map((n) => String(n).trim()).filter((n) => n.replace(/[^A-Z]/gi, '').length >= 4 && !/TREASURER|^WAYNE COUNTY|^CITY OF DETROIT|LAND BANK/i.test(n)));
  const terms = [...new Set([...names].map((n) => { try { return nameTerm(n.replace(/,/g, ' ')); } catch { return null; } }).filter(Boolean))].slice(0, 12);
  const found = new Map();
  for (const t of terms) {
    const r = await search({ party: t, parcel: taxId, from: p.from, to: p.to, all: true, max: 1000 });
    for (const d of r.data) found.set(d.doc_id, d);
  }
  // The Treasurer's deeds (foreclosure → auction) carry the county as grantor: find them by type and date if asked.
  const docs = [...found.values()].sort((a, b) => (a.recorded_date || '').localeCompare(b.recorded_date || ''));
  const cert = await certDate();
  return {
    meta: { source: 'Register of Deeds public index, searched by the names in the City of Detroit parcel file and sales history', method: 'name searches (quick search is off)', certified_through: cert.certified_through,
            tax_id: taxId, city_parcel_id: city, address: file[0]?.address || null, names_searched: terms,
            note: 'Built from name searches: documents between parties the City never recorded are not found. Switch DEEDS_QUICK_SEARCH on for the direct parcel search.' },
    data: docs,
  };
}

module.exports = { search, entity, parcelHistory, docTypes, certDate, toTaxId, toCityParcel, nameTerm, GROUPS, ROD };
