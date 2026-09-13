// GET /api/deeds/doc-types — every document type the index uses (code + description), and the groups the search
// accepts in doc_type (deeds, land_contracts, mortgages, discharges, liens, treasurer, foreclosure).
const handler = require('./_handler');
const { docTypes, GROUPS } = require('../_deeds');
module.exports = handler(async () => {
  const all = await docTypes();
  return { data: all, groups: Object.fromEntries(Object.entries(GROUPS).map(([g, test]) => [g, all.filter((t) => test(t.description)).map((t) => t.code)])) };
}, { cacheSeconds: 86400 });
