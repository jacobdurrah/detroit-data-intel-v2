const { handleCors, sendPaginated, sendError, intParam } = require('./_helpers');

let contractorsData = null;

function loadData() {
  if (!contractorsData) {
    contractorsData = require('./_data/contractors.json');
  }
  return contractorsData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const data = loadData();
    const {
      specialty, neighborhood, search,
      sort, limit: limitParam, page: pageParam,
    } = req.query;

    const limit = intParam(limitParam, 50);
    const page = intParam(pageParam, 1);

    let filtered = data;

    // Filter by specialty (match top_specialty)
    if (specialty) {
      const sp = specialty.toLowerCase();
      filtered = filtered.filter(c =>
        c.top_specialty && c.top_specialty.toLowerCase().includes(sp)
      );
    }

    // Filter by neighborhood
    if (neighborhood) {
      const nb = neighborhood.toLowerCase();
      filtered = filtered.filter(c =>
        c.top_neighborhood && c.top_neighborhood.toLowerCase() === nb
      );
    }

    // Filter by search (case-insensitive name match)
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(c => c.name && c.name.toLowerCase().includes(s));
    }

    // Sort
    if (sort) {
      switch (sort) {
        case 'permits':
          filtered = filtered.slice().sort((a, b) => (b.total_permits || 0) - (a.total_permits || 0));
          break;
        case 'recent':
          filtered = filtered.slice().sort((a, b) => (b.recent_permits || 0) - (a.recent_permits || 0));
          break;
      }
    }

    sendPaginated(res, filtered, page, limit);
  } catch (err) {
    console.error('Error in /api/contractors:', err);
    sendError(res, 'Internal server error');
  }
};
