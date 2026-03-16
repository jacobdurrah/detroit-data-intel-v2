const { handleCors, sendJson, sendError } = require('../_helpers');

let investorsData = null;
let salesData = null;

function loadInvestors() {
  if (!investorsData) {
    investorsData = require('../_data/investors.json');
  }
  return investorsData;
}

function loadSales() {
  if (!salesData) {
    salesData = require('../_data/sales.json');
  }
  return salesData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { name } = req.query;
    if (!name) {
      return sendError(res, 'Name parameter is required', 400);
    }

    const decodedName = decodeURIComponent(name).toUpperCase();

    // Find investor profile
    const investors = loadInvestors();
    const profile = investors.find(i => i.name && i.name.toUpperCase() === decodedName);

    if (!profile) {
      return sendError(res, 'Investor not found', 404);
    }

    // Find purchase history from sales data
    const sales = loadSales();
    const purchases = sales.filter(s => s.ge && s.ge.toUpperCase() === decodedName);

    // Sort by date descending and take last 20
    const sortedPurchases = purchases
      .slice()
      .sort((a, b) => (b.dt || '').localeCompare(a.dt || ''))
      .slice(0, 20)
      .map(s => ({
        id: s.id,
        parcel_id: s.pid,
        address: s.addr,
        sale_date: s.dt,
        sale_price: s.pr,
        grantor: s.gr,
        grantee: s.ge,
        neighborhood: s.nb,
        lat: s.lat,
        lng: s.lng,
      }));

    // Build neighborhoods breakdown
    const neighborhoodMap = {};
    purchases.forEach(s => {
      const nb = s.nb || 'Unknown';
      if (!neighborhoodMap[nb]) {
        neighborhoodMap[nb] = { neighborhood: nb, count: 0, total_spent: 0 };
      }
      neighborhoodMap[nb].count += 1;
      neighborhoodMap[nb].total_spent += (s.pr || 0);
    });

    const neighborhoods = Object.values(neighborhoodMap)
      .sort((a, b) => b.count - a.count);

    sendJson(res, {
      data: {
        profile,
        recent_purchases: sortedPurchases,
        neighborhoods,
      },
      meta: {
        total_purchases_found: purchases.length,
      },
    });
  } catch (err) {
    console.error('Error in /api/investor/[name]:', err);
    sendError(res, 'Internal server error');
  }
};
