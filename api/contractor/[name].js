const { handleCors, sendJson, sendError, intParam } = require('../_helpers');

let tradesData = null;
let contractorsData = null;

function loadTrades() {
  if (!tradesData) tradesData = require('../_data/trades.json');
  return tradesData;
}

function loadContractors() {
  if (!contractorsData) contractorsData = require('../_data/contractors.json');
  return contractorsData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { name, page: pageParam, limit: limitParam, permit_type, neighborhood, date_from, date_to } = req.query;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decodedName = decodeURIComponent(name).toUpperCase();
    const page = intParam(pageParam, 1);
    const limit = Math.min(intParam(limitParam, 50), 200);

    // Find contractor profile
    const contractors = loadContractors();
    const profile = contractors.find(c => c.name && c.name.toUpperCase() === decodedName);

    // Find all trade permits by this contractor
    const trades = loadTrades();
    let permits = trades.filter(t =>
      (t.biz && t.biz.toUpperCase() === decodedName) ||
      (t.con && t.con.toUpperCase() === decodedName)
    );

    // Apply filters
    if (permit_type) {
      permits = permits.filter(t => t.type === permit_type);
    }
    if (neighborhood) {
      const nbUpper = neighborhood.toUpperCase();
      permits = permits.filter(t => t.nb && t.nb.toUpperCase() === nbUpper);
    }
    if (date_from) {
      permits = permits.filter(t => t.dt && t.dt >= date_from);
    }
    if (date_to) {
      permits = permits.filter(t => t.dt && t.dt <= date_to);
    }

    // Sort by date descending
    permits.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));

    // Build neighborhood breakdown
    const nbMap = {};
    permits.forEach(t => {
      const nb = t.nb || 'Unknown';
      if (!nbMap[nb]) nbMap[nb] = { name: nb, count: 0 };
      nbMap[nb].count++;
    });
    const neighborhoods = Object.values(nbMap).sort((a, b) => b.count - a.count);

    // Build permit type breakdown
    const typeMap = {};
    permits.forEach(t => {
      const type = t.type || 'Unknown';
      if (!typeMap[type]) typeMap[type] = { name: type, count: 0 };
      typeMap[type].count++;
    });
    const permitTypes = Object.values(typeMap).sort((a, b) => b.count - a.count);

    // Build unique owners list
    const ownerMap = {};
    permits.forEach(t => {
      if (t.own) {
        const key = t.own.toUpperCase();
        if (!ownerMap[key]) ownerMap[key] = { name: t.own, count: 0 };
        ownerMap[key].count++;
      }
    });
    const owners = Object.values(ownerMap).sort((a, b) => b.count - a.count).slice(0, 20);

    // Paginate
    const total = permits.length;
    const start = (page - 1) * limit;
    const paged = permits.slice(start, start + limit).map(t => ({
      record_id: t.id,
      address: t.addr,
      issued_date: t.dt,
      permit_type: t.type,
      work_description: t.desc,
      owner_name: t.own,
      contact_business_name: t.biz,
      contact_name: t.con,
      contractor_address: t.caddr,
      contact_address: t.kaddr,
      neighborhood: t.nb,
      latitude: t.lat,
      longitude: t.lng
    }));

    sendJson(res, {
      data: {
        profile: profile || { name: decodedName, total_permits: total },
        permits: paged,
        neighborhoods,
        permit_types: permitTypes,
        owners
      },
      meta: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Error in /api/contractor/[name]:', err);
    sendError(res, 'Internal server error');
  }
};
