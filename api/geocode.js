const { handleCors, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const query = (req.query.q || req.query.query || '').trim();
    if (!query) return sendError(res, 'Query parameter is required', 400);

    const { data, error } = await supabase.from('sales')
      .select('address, latitude, longitude, neighborhood')
      .ilike('address', `%${query}%`)
      .not('latitude', 'is', null)
      .not('longitude', 'is', null)
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
