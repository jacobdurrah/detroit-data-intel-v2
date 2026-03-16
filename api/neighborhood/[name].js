const { handleCors, sendJson, sendError, intParam } = require('../_helpers');

let salesData = null;
let permitsData = null;
let tradesData = null;
let blightData = null;
let neighborhoodsData = null;

function load(name) {
  switch (name) {
    case 'sales': if (!salesData) salesData = require('../_data/sales.json'); return salesData;
    case 'permits': if (!permitsData) permitsData = require('../_data/permits.json'); return permitsData;
    case 'trades': if (!tradesData) tradesData = require('../_data/trades.json'); return tradesData;
    case 'blight': if (!blightData) blightData = require('../_data/blight.json'); return blightData;
    case 'neighborhoods': if (!neighborhoodsData) neighborhoodsData = require('../_data/neighborhoods.json'); return neighborhoodsData;
  }
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { name, section, page: pageParam, limit: limitParam } = req.query;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decodedName = decodeURIComponent(name);
    const upperName = decodedName.toUpperCase();
    const page = intParam(pageParam, 1);
    const limit = Math.min(intParam(limitParam, 20), 100);

    // Find neighborhood profile
    const neighborhoods = load('neighborhoods');
    const profile = neighborhoods.find(n =>
      (n.name || n.neighborhood || '').toUpperCase() === upperName
    ) || { name: decodedName };

    // If specific section requested, only load that data
    if (section) {
      let records = [];
      let total = 0;

      switch (section) {
        case 'sales': {
          const all = load('sales').filter(s => s.nb && s.nb.toUpperCase() === upperName);
          all.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));
          total = all.length;
          records = all.slice((page - 1) * limit, page * limit);
          break;
        }
        case 'permits': {
          const all = load('permits').filter(p => p.nb && p.nb.toUpperCase() === upperName);
          all.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));
          total = all.length;
          records = all.slice((page - 1) * limit, page * limit);
          break;
        }
        case 'trades': {
          const all = load('trades').filter(t => t.nb && t.nb.toUpperCase() === upperName);
          all.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));
          total = all.length;
          records = all.slice((page - 1) * limit, page * limit);
          break;
        }
        case 'blight': {
          const all = load('blight').filter(b => b.nb && b.nb.toUpperCase() === upperName);
          all.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));
          total = all.length;
          records = all.slice((page - 1) * limit, page * limit);
          break;
        }
      }

      return sendJson(res, {
        data: { section, records },
        meta: { total, page, limit, pages: Math.ceil(total / limit) },
      });
    }

    // Full overview - count records in each dataset
    const sales = load('sales').filter(s => s.nb && s.nb.toUpperCase() === upperName);
    const permits = load('permits').filter(p => p.nb && p.nb.toUpperCase() === upperName);
    const trades = load('trades').filter(t => t.nb && t.nb.toUpperCase() === upperName);
    const blight = load('blight').filter(b => b.nb && b.nb.toUpperCase() === upperName);

    // Sales summary
    const salesPrices = sales.map(s => s.pr).filter(p => p > 0);
    const salesSummary = {
      total: sales.length,
      total_volume: salesPrices.reduce((a, b) => a + b, 0),
      median_price: salesPrices.length > 0 ? salesPrices.sort((a, b) => a - b)[Math.floor(salesPrices.length / 2)] : 0,
      recent: sales.sort((a, b) => (b.dt || '').localeCompare(a.dt || '')).slice(0, 5),
    };

    // Permits summary
    const permitTypes = {};
    permits.forEach(p => {
      const t = p.type || 'Unknown';
      permitTypes[t] = (permitTypes[t] || 0) + 1;
    });

    // Trades - top contractors
    const contractorCounts = {};
    trades.forEach(t => {
      const c = t.biz || t.con || 'Unknown';
      contractorCounts[c] = (contractorCounts[c] || 0) + 1;
    });
    const topContractors = Object.entries(contractorCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Blight summary
    const totalFines = blight.reduce((sum, b) => sum + (b.fine || 0), 0);

    sendJson(res, {
      data: {
        profile,
        sales: salesSummary,
        permits: { total: permits.length, types: permitTypes, recent: permits.sort((a, b) => (b.dt || '').localeCompare(a.dt || '')).slice(0, 5) },
        trades: { total: trades.length, top_contractors: topContractors },
        blight: { total: blight.length, total_fines: totalFines, recent: blight.sort((a, b) => (b.dt || '').localeCompare(a.dt || '')).slice(0, 5) },
      },
    });
  } catch (err) {
    console.error('Error in /api/neighborhood/[name]:', err);
    sendError(res, 'Internal server error');
  }
};
