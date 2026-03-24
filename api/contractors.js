const { handleCors, checkAuth, sendJson, sendError, intParam } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 50), 200);
    const { neighborhood, q } = req.query;

    // Query permits and trades for contractor data
    let permitsQ = supabase.from('permits').select('contractor_name, permit_type, neighborhood, estimated_cost, permit_issued')
      .not('contractor_name', 'is', null);
    let tradesQ = supabase.from('trades').select('contractor_name, permit_type, neighborhood, permit_issued')
      .not('contractor_name', 'is', null);

    if (neighborhood) {
      permitsQ = permitsQ.ilike('neighborhood', `%${neighborhood}%`);
      tradesQ = tradesQ.ilike('neighborhood', `%${neighborhood}%`);
    }
    if (q) {
      permitsQ = permitsQ.ilike('contractor_name', `%${q}%`);
      tradesQ = tradesQ.ilike('contractor_name', `%${q}%`);
    }

    const [permitsRes, tradesRes] = await Promise.all([
      permitsQ.limit(5000),
      tradesQ.limit(5000),
    ]);

    const all = [...(permitsRes.data || []), ...(tradesRes.data || [])];
    const grouped = {};
    for (const p of all) {
      const name = p.contractor_name;
      if (!name || name.length < 2) continue;
      if (!grouped[name]) grouped[name] = { name, total_permits: 0, types: {}, neighborhoods: {}, recent: null };
      grouped[name].total_permits++;
      if (p.permit_type) grouped[name].types[p.permit_type] = (grouped[name].types[p.permit_type] || 0) + 1;
      if (p.neighborhood) grouped[name].neighborhoods[p.neighborhood] = (grouped[name].neighborhoods[p.neighborhood] || 0) + 1;
      if (p.permit_issued && (!grouped[name].recent || p.permit_issued > grouped[name].recent)) {
        grouped[name].recent = p.permit_issued;
      }
    }

    const contractors = Object.values(grouped)
      .map(g => ({
        name: g.name,
        total_permits: g.total_permits,
        top_specialty: Object.entries(g.types).sort((a,b) => b[1]-a[1])[0]?.[0] || null,
        top_neighborhood: Object.entries(g.neighborhoods).sort((a,b) => b[1]-a[1])[0]?.[0] || null,
        neighborhood_count: Object.keys(g.neighborhoods).length,
        most_recent: g.recent,
      }))
      .sort((a, b) => b.total_permits - a.total_permits);

    const start = (page - 1) * limit;
    sendJson(res, {
      data: contractors.slice(start, start + limit),
      meta: { total: contractors.length, page, limit },
    });
  } catch (err) {
    console.error('Error in /api/contractors:', err);
    sendError(res, 'Internal server error');
  }
};
