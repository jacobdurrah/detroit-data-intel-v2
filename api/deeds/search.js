// GET /api/deeds/search — the Register of Deeds public index, by grantor / grantee / party / doc_type / dates.
// Parameters and examples: /llms.txt · /api/deeds/openapi
const handler = require('./_handler');
const { search } = require('../_deeds');
module.exports = handler((q) => search(q));
