const { handleCors, sendJson, sendError, intParam } = require('../_helpers');

let tradesData = null;
let permitsData = null;

function loadTrades() {
  if (!tradesData) tradesData = require('../_data/trades.json');
  return tradesData;
}

function loadPermits() {
  if (!permitsData) permitsData = require('../_data/permits.json');
  return permitsData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { name, page: pageParam, limit: limitParam, permit_type, neighborhood, date_from, date_to } = req.query;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decodedName = decodeURIComponent(name).toUpperCase();
    const trades = loadTrades();
    const permits = loadPermits();

    // Find all trade permits by this contractor (match on biz or con field)
    let contractorTrades = trades.filter(t =>
      (t.biz && t.biz.toUpperCase() === decodedName) ||
      (t.con && t.con.toUpperCase() === decodedName)
    );

    // Build profile from trade data
    const permTypeCounts = {};
    const neighborhoodCounts = {};
    const ownerSet = new Set();
    const addressSet = new Set();
    contractorTrades.forEach(t => {
      const pt = t.type || 'Unknown';
      permTypeCounts[pt] = (permTypeCounts[pt] || 0) + 1;
      const nb = t.nb || 'Unknown';
      neighborhoodCounts[nb] = (neighborhoodCounts[nb] || 0) + 1;
      if (t.own) ownerSet.add(t.own);
      if (t.addr) addressSet.add(t.addr);
    });

    const dates = contractorTrades
      .map(t => t.dt)
      .filter(Boolean)
      .sort();

    // Find linked building permits (match on address)
    const tradeAddresses = new Set(contractorTrades.map(t => t.addr).filter(Boolean));
    const linkedPermits = permits.filter(p => tradeAddresses.has(p.addr)).slice(0, 50);

    // Apply filters
    if (permit_type) {
      contractorTrades = contractorTrades.filter(t => t.type === permit_type);
    }
    if (neighborhood) {
      contractorTrades = contractorTrades.filter(t =>
        t.nb && t.nb.toUpperCase() === neighborhood.toUpperCase()
      );
    }
    if (date_from) {
      contractorTrades = contractorTrades.filter(t => t.dt && t.dt >= date_from);
    }
    if (date_to) {
      contractorTrades = contractorTrades.filter(t => t.dt && t.dt <= date_to);
    }

    // Sort by date descending
    contractorTrades.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));

    const total = contractorTrades.length;
    const page = intParam(pageParam, 1);
    const limit = Math.min(intParam(limitParam, 50), 200);
    const start = (page - 1) * limit;
    const paged = contractorTrades.slice(start, start + limit);

    const neighborhoods = Object.entries(neighborhoodCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const profile = {
      name: decodedName,
      total_permits: trades.filter(t =>
        (t.biz && t.biz.toUpperCase() === decodedName) ||
        (t.con && t.con.toUpperCase() === decodedName)
      ).length,
      permit_types: permTypeCounts,
      neighborhoods_served: Object.keys(neighborhoodCounts).length,
      unique_properties: addressSet.size,
      unique_owners: ownerSet.size,
      first_permit: dates[0] || null,
      last_permit: dates[dates.length - 1] || null,
      contact_address: (contractorTrades[0] || {}).kaddr || (contractorTrades[0] || {}).caddr || null,
    };

    sendJson(res, {
      data: {
        profile,
        trades: paged,
        neighborhoods,
        linked_permits: linkedPermits,
      },
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    console.error('Error in /api/contractor/[name]:', err);
    sendError(res, 'Internal server error');
  }
};
