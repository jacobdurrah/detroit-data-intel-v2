const { handleCors, checkAuth, sendJson, sendError, intParam } = require('./_helpers');
const { supabase } = require('./_supabase');

/**
 * GET /api/blocks — Search and list blocks with full scoring data
 * 
 * Returns all blocks with raw metrics for client-side scoring.
 * Client applies score weights + filters locally.
 * 
 * Query params:
 *   search       — street name search (partial match)
 *   neighborhood — filter by neighborhood
 *   zip          — filter by zip code
 *   time_range   — 6m|1y|2y|all (default: 1y)
 *   page         — page number (default: 1)
 *   limit        — results per page (default: 200, max 500)
 */
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const search = (req.query.search || '').trim().toUpperCase();
    const neighborhood = (req.query.neighborhood || '').trim();
    const zip = (req.query.zip || '').trim();
    const timeRange = req.query.time_range || '1y';
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 200), 500);
    const offset = (page - 1) * limit;

    const { data, error } = await supabase.rpc('get_block_scores_v2', {
      p_search: search || null,
      p_neighborhood: neighborhood || null,
      p_zip: zip || null,
      p_time_range: timeRange,
      p_limit: limit,
      p_offset: offset,
    });

    if (error) {
      console.error('Block scores RPC error:', error);
      return sendError(res, 'Failed to load blocks: ' + error.message);
    }

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    sendJson(res, {
      data: data || [],
      meta: { page, limit, total: (data || []).length, time_range: timeRange }
    });
  } catch (err) {
    console.error('Error in /api/blocks:', err);
    sendError(res, 'Internal server error');
  }
};
