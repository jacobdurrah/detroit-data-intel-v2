/**
 * POST /api/mcp — Model Context Protocol server (Streamable HTTP, stateless, JSON responses) so agents can discover and
 * call the Detroit data tools directly. Add it to Claude Code:
 *   claude mcp add --transport http detroit-data https://detroit-data-intel-v2.vercel.app/api/mcp
 * Tools mirror the REST endpoints in api/deeds/ (docs: /llms.txt).
 */
const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const { handleCors } = require('./_helpers');
const deeds = require('./_deeds');

const names = z.union([z.string(), z.array(z.string())]);
const common = {
  from: z.string().optional().describe('Recorded on or after, YYYY-MM-DD'),
  to: z.string().optional().describe('Recorded on or before, YYYY-MM-DD (default: the index certification date)'),
  exact: z.boolean().optional().describe('Keep LLC/INC words in names (default false: the index spells LLC "L L C", so they are dropped)'),
};
const asText = (v) => ({ content: [{ type: 'text', text: JSON.stringify(v) }] });
const fail = (e) => ({ isError: true, content: [{ type: 'text', text: `${e.message} (see https://detroit-data-intel-v2.vercel.app/llms.txt)` }] });

function server() {
  const s = new McpServer({ name: 'detroit-data', version: '1.0.0' }, {
    instructions: 'Wayne County (Detroit) Register of Deeds public index: who bought and sold what, when, by which kind of document. '
      + 'Index data only (parties, document type, recorded date, Tax ID/parcel, legal description, consideration when entered, OCR excerpt) — no images. '
      + 'Search by parcel (Tax ID), address, document number or free text (q); or by names and/or document type within dates. For one investor use deeds_entity; for one parcel use deeds_parcel.',
  });
  s.registerTool('deeds_search', {
    title: 'Search Register of Deeds',
    description: 'Search the Wayne County Register of Deeds index. Direct lookups: parcel (Tax ID "14/002261" or City "14002261."), address ("4661 VANCOUVER"), doc_number, or q (any text). '
      + 'Or by grantor / grantee / either party and/or document type within a recorded-date range — several names in one field are OR\'d, grantor + grantee AND\'d. With a direct lookup, names and doc_type filter its results.',
    inputSchema: {
      grantor: names.optional().describe('Seller / mortgagor / land-contract vendor name(s), "LAST FIRST" for people'),
      grantee: names.optional().describe('Buyer / lender / vendee name(s)'),
      party: names.optional().describe('Name(s) on either side (not with grantor/grantee)'),
      doc_type: names.optional().describe('Codes (WD, QCD, LCM, MTG, TQCD…), descriptions, or groups: deeds, land_contracts, mortgages, discharges, liens, treasurer, foreclosure'),
      ...common,
      sort: z.enum(['recorded_desc', 'recorded_asc', 'relevance']).optional(),
      limit: z.number().int().min(1).max(250).optional(), offset: z.number().int().min(0).optional(),
      all: z.boolean().optional().describe('Follow pages up to max'), max: z.number().int().max(2500).optional(),
      parcel: names.optional().describe('Tax ID "14/002261" or City parcel id "14002261." (one or more)'),
      address: names.optional().describe('Street address, e.g. "4661 VANCOUVER"'), doc_number: names.optional().describe('Document (instrument) number'),
      q: names.optional().describe('Any text the quick search accepts'),
      municipality: z.string().optional().describe('Filter, e.g. DETROIT'),
      min_consideration: z.number().optional(), max_consideration: z.number().optional(),
    },
  }, async (a) => { try { return asText(await deeds.search(a)); } catch (e) { return fail(e); } });
  s.registerTool('deeds_entity', {
    title: 'Register of Deeds: one entity',
    description: 'Everything one buyer/seller (company or person) is party to, both sides: summary by document type and year, top counterparties, '
      + 'and a per-parcel timeline (when it came in, when and how it went out, days held). Newest-first up to max; if meta.truncated, do not treat empty `out` as still held. Use it to study an investor\'s strategy.',
    inputSchema: { name: names.describe('Entity name(s); variants are OR\'d'), doc_type: names.optional(), ...common, max: z.number().int().max(1500).optional() },
  }, async (a) => { try { return asText(await deeds.entity(a)); } catch (e) { return fail(e); } });
  s.registerTool('deeds_parcel', {
    title: 'Register of Deeds: one Detroit parcel',
    description: 'Every recorded document on one parcel, oldest first (foreclosure, Treasurer deed, resales, land contracts, mortgages, liens).',
    inputSchema: { parcel: z.string().describe('City parcel id "14002261." or Tax ID "14/002261"'), doc_type: names.optional(), from: common.from, to: common.to },
  }, async (a) => { try { return asText(await deeds.parcelHistory(a)); } catch (e) { return fail(e); } });
  s.registerTool('deeds_doc_types', {
    title: 'Register of Deeds document types',
    description: 'Every document type code and description the index uses, and the groups deeds_search accepts.',
    inputSchema: {},
  }, async () => { try { const all = await deeds.docTypes(); return asText({ data: all, groups: Object.fromEntries(Object.entries(deeds.GROUPS).map(([g, t]) => [g, all.filter((x) => t(x.description)).map((x) => x.code)])) }); } catch (e) { return fail(e); } });
  return s;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'MCP over Streamable HTTP: POST JSON-RPC here. Docs: /llms.txt', tools: ['deeds_search', 'deeds_entity', 'deeds_parcel', 'deeds_doc_types'] });
  }
  const s = server();
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); s.close(); });
  try {
    await s.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (e) {
    console.error('[mcp]', e);
    if (!res.headersSent) res.status(500).json({ jsonrpc: '2.0', error: { code: -32603, message: e.message }, id: null });
  }
};
