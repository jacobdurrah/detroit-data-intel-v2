// GET /api/deeds/entity?name=… — everything one buyer/seller is party to, both sides, with a per-parcel in/out
// timeline and a summary (document types by year, top counterparties, days held).
const handler = require('./_handler');
const { entity } = require('../_deeds');
module.exports = handler((q) => entity(q));
