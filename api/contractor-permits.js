const { handleCors, checkAuth, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const name = req.query.name;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decoded = decodeURIComponent(name);
    const pattern = `%${decoded}%`;

    const [tradesRes, permitsRes] = await Promise.all([
      supabase.from('trades')
        .select('permit_no, address, permit_type, permit_issued, description, latitude, longitude, neighborhood')
        .ilike('contractor_name', pattern)
        .not('latitude', 'is', null)
        .order('permit_issued', { ascending: false })
        .limit(200),
      supabase.from('permits')
        .select('permit_no, address, permit_type, permit_issued, description, estimated_cost, latitude, longitude, neighborhood')
        .ilike('contractor_name', pattern)
        .not('latitude', 'is', null)
        .order('permit_issued', { ascending: false })
        .limit(200),
    ]);

    const points = [];
    const seen = new Set();

    for (const t of (tradesRes.data || [])) {
      const key = t.permit_no || (t.address + t.permit_issued);
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({
        id: t.permit_no, addr: t.address, type: t.permit_type,
        dt: t.permit_issued, desc: t.description, nb: t.neighborhood,
        lat: Number(t.latitude), lng: Number(t.longitude), source: 'trade',
      });
    }

    for (const p of (permitsRes.data || [])) {
      const key = p.permit_no || (p.address + p.permit_issued);
      if (seen.has(key)) continue;
      seen.add(key);
      points.push({
        id: p.permit_no, addr: p.address, type: p.permit_type,
        dt: p.permit_issued, desc: p.description, cost: Number(p.estimated_cost) || 0,
        nb: p.neighborhood, lat: Number(p.latitude), lng: Number(p.longitude), source: 'permit',
      });
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    sendJson(res, { data: points, total: points.length });
  } catch (err) {
    console.error('Error in /api/contractor-permits:', err);
    sendError(res, 'Internal server error');
  }
};
