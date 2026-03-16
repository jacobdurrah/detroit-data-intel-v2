const { handleCors, sendJson, sendError } = require('./_helpers');

let investorsData = null;
let salesData = null;
let contractorsData = null;
let neighborhoodsData = null;

function loadInvestors() {
  if (!investorsData) investorsData = require('./_data/investors.json');
  return investorsData;
}

function loadSales() {
  if (!salesData) salesData = require('./_data/sales.json');
  return salesData;
}

function loadContractors() {
  if (!contractorsData) contractorsData = require('./_data/contractors.json');
  return contractorsData;
}

function loadNeighborhoods() {
  if (!neighborhoodsData) neighborhoodsData = require('./_data/neighborhoods.json');
  return neighborhoodsData;
}

const RESULTS_PER_CATEGORY = 10;

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { q } = req.query;

    if (!q || q.trim().length === 0) {
      return sendError(res, 'q parameter is required', 400);
    }

    const query = q.trim().toLowerCase();

    // Search investors by name
    const investors = loadInvestors();
    const matchedInvestors = investors
      .filter(i => i.name && i.name.toLowerCase().includes(query))
      .slice(0, RESULTS_PER_CATEGORY)
      .map(i => ({
        name: i.name,
        total_purchases: i.total_purchases,
        investment_tier: i.investment_tier,
        top_neighborhood: i.top_neighborhood,
      }));

    // Search sales by address and grantee
    const sales = loadSales();
    const matchedProperties = sales
      .filter(s =>
        (s.addr && s.addr.toLowerCase().includes(query)) ||
        (s.ge && s.ge.toLowerCase().includes(query))
      )
      .slice(0, RESULTS_PER_CATEGORY)
      .map(s => ({
        id: s.id,
        address: s.addr,
        sale_price: s.pr,
        sale_date: s.dt,
        grantee: s.ge,
        neighborhood: s.nb,
        lat: s.lat,
        lng: s.lng,
      }));

    // Search contractors by name
    const contractors = loadContractors();
    const matchedContractors = contractors
      .filter(c => c.name && c.name.toLowerCase().includes(query))
      .slice(0, RESULTS_PER_CATEGORY)
      .map(c => ({
        name: c.name,
        total_permits: c.total_permits,
        top_specialty: c.top_specialty,
        top_neighborhood: c.top_neighborhood,
      }));

    // Search neighborhoods
    const neighborhoods = loadNeighborhoods();
    const matchedNeighborhoods = neighborhoods
      .filter(n => n.neighborhood && n.neighborhood.toLowerCase().includes(query))
      .slice(0, RESULTS_PER_CATEGORY);

    sendJson(res, {
      data: {
        investors: matchedInvestors,
        properties: matchedProperties,
        contractors: matchedContractors,
        neighborhoods: matchedNeighborhoods,
      },
      meta: {
        query: q.trim(),
        total: matchedInvestors.length + matchedProperties.length +
               matchedContractors.length + matchedNeighborhoods.length,
      },
    });
  } catch (err) {
    console.error('Error in /api/search:', err);
    sendError(res, 'Internal server error');
  }
};
