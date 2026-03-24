const { handleCors, checkAuth, sendJson, sendError } = require('../_helpers');
const { supabase } = require('../_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const { name } = req.query;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decoded = decodeURIComponent(name);
    const pattern = `%${decoded}%`;

    const [permitsRes, tradesRes] = await Promise.all([
      supabase.from('permits').select('*').ilike('contractor_name', pattern).order('permit_issued', { ascending: false }).limit(200),
      supabase.from('trades').select('*').ilike('contractor_name', pattern).order('permit_issued', { ascending: false }).limit(200),
    ]);

    const permits = permitsRes.data || [];
    const trades = tradesRes.data || [];
    const all = [...permits, ...trades];

    if (all.length === 0) return sendError(res, 'Contractor not found', 404);

    const neighborhoods = {};
    const types = {};
    for (const p of all) {
      if (p.neighborhood) neighborhoods[p.neighborhood] = (neighborhoods[p.neighborhood] || 0) + 1;
      if (p.permit_type) types[p.permit_type] = (types[p.permit_type] || 0) + 1;
    }

    // Build unique properties and owners
    const uniqueAddrs = new Set();
    const uniqueOwners = new Set();
    let firstDate = null, lastDate = null;
    for (const p of all) {
      if (p.address) uniqueAddrs.add(p.address);
      const desc = (p.description || '');
      if (p.permit_issued) {
        if (!firstDate || p.permit_issued < firstDate) firstDate = p.permit_issued;
        if (!lastDate || p.permit_issued > lastDate) lastDate = p.permit_issued;
      }
    }

    const nbSorted = Object.entries(neighborhoods).sort((a,b) => b[1]-a[1]);
    const typeSorted = Object.entries(types).sort((a,b) => b[1]-a[1]);

    // Format trades for frontend
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const start = (page - 1) * limit;
    const paged = all.slice(start, start + limit);

    sendJson(res, {
      data: {
        profile: {
          name: decoded,
          total_permits: all.length,
          building_permits: permits.length,
          trade_permits: trades.length,
          neighborhoods_served: nbSorted.length,
          unique_properties: uniqueAddrs.size,
          unique_owners: uniqueOwners.size,
          first_permit: firstDate,
          last_permit: lastDate,
          top_specialty: typeSorted[0]?.[0] || null,
        },
        specialties: typeSorted.map(([t,c]) => ({ type: t, count: c })),
        neighborhoods: nbSorted.map(([n,c]) => ({ name: n, count: c })),
        trades: paged.map(p => ({
          id: p.permit_no, addr: p.address, type: p.permit_type,
          desc: p.description, dt: p.permit_issued, nb: p.neighborhood,
          contractor: p.contractor_name,
        })),
      },
      meta: { page, limit, pages: Math.ceil(all.length / limit), total: all.length },
    });
  } catch (err) {
    console.error('Error in /api/contractor/[name]:', err);
    sendError(res, 'Internal server error');
  }
};
