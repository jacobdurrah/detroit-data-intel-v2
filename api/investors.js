const { handleCors, sendJson, sendError, intParam } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 50), 200);
    const search = req.query.search || req.query.q || null;
    const neighborhood = req.query.neighborhood || null;
    const minPurchases = intParam(req.query.min_purchases, 2);
    const maxPurchases = req.query.max_purchases ? intParam(req.query.max_purchases, 0) : null;
    const dateFrom = req.query.date_from || null;
    const dateTo = req.query.date_to || null;
    const sort = req.query.sort || 'total_purchases';

    // Use server-side RPC for proper aggregation across all 505K+ sales
    const [{ data: investors, error }, { data: countResult }] = await Promise.all([
      supabase.rpc('get_investors', {
        p_search: search,
        p_neighborhood: neighborhood,
        p_min_purchases: minPurchases,
        p_limit: limit,
        p_offset: (page - 1) * limit,
      }),
      supabase.rpc('count_investors', {
        p_search: search,
        p_neighborhood: neighborhood,
        p_min_purchases: minPurchases,
      }),
    ]);

    if (error) {
      console.error('RPC error:', error);
      return sendError(res, 'Failed to query investors');
    }

    // Post-filter by max_purchases and date range
    let filtered = investors || [];
    if (maxPurchases) {
      filtered = filtered.filter(i => i.total_purchases <= maxPurchases);
    }
    if (dateFrom) {
      filtered = filtered.filter(i => i.last_purchase >= dateFrom);
    }
    if (dateTo) {
      filtered = filtered.filter(i => i.first_purchase <= dateTo);
    }

    // Cache default first-page request at Vercel edge
    if (!search && !neighborhood && !dateFrom && !dateTo && page === 1) {
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    }

    sendJson(res, {
      data: filtered,
      meta: { total: countResult || filtered.length, page, limit },
    });
  } catch (err) {
    console.error('Error in /api/investors:', err);
    sendError(res, 'Internal server error');
  }
};
