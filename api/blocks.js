const { handleCors, checkAuth, sendJson, sendError, intParam } = require('./_helpers');
const { supabase } = require('./_supabase');

/**
 * GET /api/blocks — Search and list blocks (street segments)
 * 
 * Query params:
 *   search    — street name search (partial match)
 *   neighborhood — filter by neighborhood
 *   zip       — filter by zip code
 *   min_sales — minimum total sales on block
 *   sort      — recent_sales|total_sales|avg_price|owner_occ (default: recent_sales)
 *   order     — asc|desc (default: desc)
 *   page      — page number (default: 1)
 *   limit     — results per page (default: 20, max 100)
 */
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const search = (req.query.search || '').trim().toUpperCase();
    const neighborhood = (req.query.neighborhood || '').trim();
    const zip = (req.query.zip || '').trim();
    const minSales = intParam(req.query.min_sales, 0);
    const sort = req.query.sort || 'recent_sales';
    const order = req.query.order === 'asc' ? true : false;
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 20), 100);
    const offset = (page - 1) * limit;

    // Build the block analytics query using a CTE
    // We aggregate sales, blight, and address data per street_id
    const { data, error } = await supabase.rpc('get_block_scores', {
      p_search: search || null,
      p_neighborhood: neighborhood || null,
      p_zip: zip || null,
      p_min_sales: minSales,
      p_sort: sort,
      p_ascending: order,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('Block search error:', error);
      // Fallback: simple street search
      let query = supabase.from('streets')
        .select('street_id, street_name, full_street_name, from_addr_left, to_addr_left, center_lat, center_lng');
      
      if (search) query = query.ilike('street_name', `%${search}%`);
      query = query.order('street_name').range(offset, offset + limit - 1);
      
      const { data: streets, error: err2 } = await query;
      if (err2) return sendError(res, 'Search failed');
      
      return sendJson(res, {
        data: streets || [],
        meta: { page, limit, note: 'Basic search (RPC not available)' }
      });
    }

    // Get total count
    const { data: countData } = await supabase.rpc('count_block_scores', {
      p_search: search || null,
      p_neighborhood: neighborhood || null,
      p_zip: zip || null,
      p_min_sales: minSales,
    });

    const total = countData || 0;

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    sendJson(res, {
      data: data || [],
      meta: { page, limit, total, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Error in /api/blocks:', err);
    sendError(res, 'Internal server error');
  }
};
