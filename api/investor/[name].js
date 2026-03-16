const { handleCors, sendJson, sendError, intParam } = require('../_helpers');

let investorsData = null;
let salesData = null;

function loadInvestors() {
  if (!investorsData) investorsData = require('../_data/investors.json');
  return investorsData;
}

function loadSales() {
  if (!salesData) salesData = require('../_data/sales.json');
  return salesData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { name, page: pageParam, limit: limitParam, neighborhood, date_from, date_to, min_price, max_price, deed_type } = req.query;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decodedName = decodeURIComponent(name).toUpperCase();

    const investors = loadInvestors();
    const profile = investors.find(i => i.name && i.name.toUpperCase() === decodedName);
    if (!profile) return sendError(res, 'Investor not found', 404);

    const sales = loadSales();
    let purchases = sales.filter(s => s.ge && s.ge.toUpperCase() === decodedName);

    // Apply filters
    if (neighborhood) {
      purchases = purchases.filter(s => s.nb && s.nb.toUpperCase() === neighborhood.toUpperCase());
    }
    if (date_from) {
      purchases = purchases.filter(s => s.dt && s.dt >= date_from);
    }
    if (date_to) {
      purchases = purchases.filter(s => s.dt && s.dt <= date_to);
    }
    if (min_price) {
      const minP = parseFloat(min_price);
      if (!isNaN(minP)) purchases = purchases.filter(s => (s.pr || 0) >= minP);
    }
    if (max_price) {
      const maxP = parseFloat(max_price);
      if (!isNaN(maxP)) purchases = purchases.filter(s => (s.pr || 0) <= maxP);
    }
    if (deed_type) {
      purchases = purchases.filter(s => s.si && s.si.toUpperCase() === deed_type.toUpperCase());
    }

    // Sort by date descending
    purchases.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));

    const total = purchases.length;
    const page = intParam(pageParam, 1);
    const limit = Math.min(intParam(limitParam, 50), 200);
    const start = (page - 1) * limit;
    const paged = purchases.slice(start, start + limit);

    // Build neighborhoods breakdown (from unfiltered data)
    const allPurchases = sales.filter(s => s.ge && s.ge.toUpperCase() === decodedName);
    const neighborhoodMap = {};
    allPurchases.forEach(s => {
      const nb = s.nb || 'Unknown';
      if (!neighborhoodMap[nb]) neighborhoodMap[nb] = { neighborhood: nb, count: 0, total_spent: 0 };
      neighborhoodMap[nb].count += 1;
      neighborhoodMap[nb].total_spent += (s.pr || 0);
    });
    const neighborhoods = Object.values(neighborhoodMap).sort((a, b) => b.count - a.count);

    // Deed type breakdown
    const deedTypes = {};
    allPurchases.forEach(s => {
      const dt = s.si || 'Unknown';
      deedTypes[dt] = (deedTypes[dt] || 0) + 1;
    });

    sendJson(res, {
      data: {
        profile,
        purchases: paged,
        neighborhoods,
        deed_types: deedTypes,
      },
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error in /api/investor/[name]:', err);
    sendError(res, 'Internal server error');
  }
};
