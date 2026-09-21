const { handleCors, checkAuth, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');
const { addressSearchPattern } = require('./_address-search-pattern');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const pattern = addressSearchPattern(req.query.q || req.query.query || '');
    if (!pattern) return sendError(res, 'Query parameter is required', 400);

    const { data, error } = await supabase.from('sales')
      .select('address, latitude, longitude, neighborhood')
      .ilike('address', pattern)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
      .order('address')
      .limit(5);

    if (error) {
      console.error('Geocode error:', error);
      return sendError(res, 'Search failed');
    }

    res.setHeader('Cache-Control', 'public, s-maxage=600, stale-while-revalidate=1200');
    sendJson(res, {
      results: (data || []).map(r => ({
        address: r.address,
        lat: Number(r.latitude),
        lng: Number(r.longitude),
        neighborhood: r.neighborhood,
      })),
    });
  } catch (err) {
    console.error('Error in /api/geocode:', err);
    sendError(res, 'Internal server error');
  }
};
