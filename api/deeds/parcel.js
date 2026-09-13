// GET /api/deeds/parcel?parcel=14002261. — every recorded document on one parcel, oldest first (quick search by Tax ID;
// with DEEDS_QUICK_SEARCH=off, name searches on the parties the City of Detroit's records attach to the parcel).
const handler = require('./_handler');
const { parcelHistory } = require('../_deeds');
module.exports = handler((q) => parcelHistory(q));
