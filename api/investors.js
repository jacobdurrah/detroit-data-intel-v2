const { handleCors, sendPaginated, sendError, intParam } = require('./_helpers');

let investorsData = null;

function loadData() {
  if (!investorsData) {
    investorsData = require('./_data/investors.json');
  }
  return investorsData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const data = loadData();
    const {
      tier, min_purchases, max_purchases, neighborhood,
      sort, limit: limitParam, page: pageParam, search,
    } = req.query;

    const limit = intParam(limitParam, 50);
    const page = intParam(pageParam, 1);

    let filtered = data;

    // Filter by investment tier
    if (tier) {
      const t = tier.toLowerCase();
      filtered = filtered.filter(i => i.investment_tier && i.investment_tier.toLowerCase() === t);
    }

    // Filter by min purchases
    const minPurch = intParam(min_purchases, null);
    if (minPurch !== null) {
      filtered = filtered.filter(i => i.total_purchases >= minPurch);
    }

    // Filter by max purchases
    const maxPurch = intParam(max_purchases, null);
    if (maxPurch !== null) {
      filtered = filtered.filter(i => i.total_purchases <= maxPurch);
    }

    // Filter by neighborhood
    if (neighborhood) {
      const nb = neighborhood.toLowerCase();
      filtered = filtered.filter(i => i.top_neighborhood && i.top_neighborhood.toLowerCase() === nb);
    }

    // Filter by search (case-insensitive name match)
    if (search) {
      const s = search.toLowerCase();
      filtered = filtered.filter(i => i.name && i.name.toLowerCase().includes(s));
    }

    // Sort
    if (sort) {
      switch (sort) {
        case 'purchases':
          filtered = filtered.slice().sort((a, b) => b.total_purchases - a.total_purchases);
          break;
        case 'spend':
          filtered = filtered.slice().sort((a, b) => b.total_spend - a.total_spend);
          break;
        case 'recent':
          filtered = filtered.slice().sort((a, b) => (b.last_purchase || '').localeCompare(a.last_purchase || ''));
          break;
      }
    }

    sendPaginated(res, filtered, page, limit);
  } catch (err) {
    console.error('Error in /api/investors:', err);
    sendError(res, 'Internal server error');
  }
};
