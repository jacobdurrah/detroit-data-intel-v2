// GET /api/deeds/openapi — OpenAPI 3.1 description of the Register of Deeds endpoints (for tool builders and agents).
const handler = require('./_handler');
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const names = (description) => ({ name: '', in: 'query', description: `${description} Repeat the parameter or separate with "|" for several.`, schema: { type: 'string' } });
const q = (name, description, schema = { type: 'string' }) => ({ name, in: 'query', description, schema });
const common = [
  q('from', 'Recorded on or after (YYYY-MM-DD).', { type: 'string', format: 'date' }),
  q('to', 'Recorded on or before (YYYY-MM-DD). Default: the index certification date.', { type: 'string', format: 'date' }),
  q('exact', 'Keep LLC/INC words in names. Default false — the index spells LLC "L L C".', { type: 'boolean' }),
];
const doc = { type: 'object', properties: {
  doc_id: { type: 'integer' }, doc_number: str('Instrument number'), doc_type: str('e.g. MEMO OF LAND CONTRACT'), doc_type_code: str('e.g. LCM'),
  recorded_date: str('YYYY-MM-DD'), instrument_date: str('YYYY-MM-DD'), grantors: { type: 'array', items: { type: 'string' } }, grantees: { type: 'array', items: { type: 'string' } },
  parcels: { type: 'array', items: { type: 'object', properties: { tax_id: str('Register format, 14/002261'), city_parcel_id: str('City of Detroit format, 14002261. (Detroit only)') } } },
  address: str('Street address from the legal description'), municipality: str(''), consideration: { type: ['number', 'null'], description: 'As entered by the clerk; often 0 or missing on land contracts; occasionally mis-keyed' },
  consideration_raw: str(''), legal: str('Legal description line'), ocr_excerpt: str('First ~200 characters of the OCR text'), pages: { type: 'integer' }, book_page: str(''), url: str('The document page on the Register site'),
} };
const spec = {
  openapi: '3.1.0',
  info: { title: 'Detroit Data Intel — Register of Deeds', version: '1.0.0',
    description: 'The Wayne County (Detroit) Register of Deeds public index as JSON: who conveyed what to whom, when, and by which document. Index data only — no document images. Open; rate-limited per caller; responses cached. Agent guide: /llms.txt. MCP: POST /api/mcp.' },
  servers: [{ url: 'https://detroit-data-intel-v2.vercel.app' }],
  paths: {
    '/api/deeds/search': { get: { operationId: 'deedsSearch', summary: 'Search the index',
      description: 'Direct lookups by parcel / address / doc_number / q (names and doc_type then filter), or a search by grantor / grantee / party and/or doc_type within dates (several names in one field OR, grantor + grantee AND).',
      parameters: [
        { ...names('Tax ID "14/002261" or City parcel id "14002261.".'), name: 'parcel' }, { ...names('Street address, e.g. "4661 VANCOUVER".'), name: 'address' },
        { ...names('Document (instrument) number.'), name: 'doc_number' }, { ...names('Any text the Register quick search accepts.'), name: 'q' },
        { ...names('Seller / mortgagor / land-contract vendor. People are "LAST FIRST".'), name: 'grantor' }, { ...names('Buyer / lender / vendee.'), name: 'grantee' },
        { ...names('Either side (not with grantor/grantee).'), name: 'party' },
        { ...names('Codes (WD, QCD, LCM, MTG, TQCD…), descriptions, or groups: deeds, land_contracts, mortgages, discharges, liens, treasurer, foreclosure. See /api/deeds/doc-types.'), name: 'doc_type' },
        ...common,
        q('sort', 'recorded_desc (default), recorded_asc, relevance', { type: 'string', enum: ['recorded_desc', 'recorded_asc', 'relevance'] }),
        q('limit', '1–250 (default 50)', { type: 'integer' }), q('offset', 'Paging offset', { type: 'integer' }),
        q('all', 'Follow pages up to max', { type: 'boolean' }), q('max', 'Up to 2500 (default 1000)', { type: 'integer' }),
        q('municipality', 'Filter, e.g. DETROIT'), q('min_consideration', 'Filter', { type: 'number' }), q('max_consideration', 'Filter', { type: 'number' }),
      ],
      responses: { 200: { description: 'Results', content: { 'application/json': { schema: { type: 'object', properties: { meta: { type: 'object' }, data: { type: 'array', items: doc } } } } } },
                   400: { description: 'Bad query' }, 429: { description: 'Rate limited (see Retry-After)' }, 502: { description: 'Register of Deeds unreachable' } } } },
    '/api/deeds/entity': { get: { operationId: 'deedsEntity', summary: 'One buyer/seller, both sides',
      description: 'Everything one entity is party to: summary by document type and year, top counterparties, and a per-parcel timeline (in, out, days held).',
      parameters: [{ ...names('Entity name(s); variants OR\'d.'), name: 'name', required: true }, { ...names('Limit to document types.'), name: 'doc_type' }, ...common, q('max', 'Per side, up to 1500 (default 500)', { type: 'integer' })],
      responses: { 200: { description: 'Entity' } } } },
    '/api/deeds/parcel': { get: { operationId: 'deedsParcel', summary: 'Every document on one parcel',
      parameters: [q('parcel', 'City parcel id "14002261." or Tax ID "14/002261"'), { ...names('Limit to document types.'), name: 'doc_type' }, common[0], common[1]],
      responses: { 200: { description: 'Documents, oldest first' } } } },
    '/api/deeds/doc-types': { get: { operationId: 'deedsDocTypes', summary: 'Document type codes and groups', responses: { 200: { description: 'Types' } } } },
    '/api/deeds/status': { get: { operationId: 'deedsStatus', summary: 'Upstream health and certification date', responses: { 200: { description: 'Status' } } } },
  },
};
module.exports = handler(async () => spec, { cacheSeconds: 86400 });
