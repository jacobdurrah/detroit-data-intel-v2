const { handleCors, sendJson, sendError, intParam, requireBearerToken } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'POST') {
      if (requireBearerToken(req, res, 'PROPERTY_PIPELINE_API_KEY')) return;

      var body = req.body || {};
      var { data, error } = await supabase
        .from('property_searches')
        .upsert({
          address: body.address,
          search_date: body.search_date || new Date().toISOString().slice(0, 10),
          parcel_id: body.parcel_id || null,
          neighborhood: body.neighborhood || null,
          zip: body.zip || null,
          list_price: body.list_price || null,
          estimated_arv: body.estimated_arv || null,
          score: body.score || 0,
          score_breakdown: body.score_breakdown || {},
          source: body.source || null,
          listing_url: body.listing_url || null,
          photo_urls: body.photo_urls || [],
          description_raw: body.description_raw || null,
          highlights: body.highlights || {},
          beds: body.beds || null,
          baths: body.baths || null,
          sqft: body.sqft || null,
          year_built: body.year_built || null,
          lot_size: body.lot_size || null,
          property_type: body.property_type || 'single_family',
          status: body.status || 'new',
        }, { onConflict: 'address,search_date' })
        .select();

      if (error) {
        console.error('Insert error:', error);
        return sendError(res, 'Failed to create search result');
      }
      return sendJson(res, { data: data ? data[0] : null }, 201);
    }

    // GET
    var date = req.query.date || new Date().toISOString().slice(0, 10);
    var status = req.query.status || null;
    var page = intParam(req.query.page, 1);
    var limit = Math.min(intParam(req.query.limit, 20), 100);
    var offset = (page - 1) * limit;

    var query = supabase
      .from('property_searches')
      .select('*', { count: 'exact' })
      .eq('search_date', date)
      .order('score', { ascending: false })
      .range(offset, offset + limit - 1);

    if (status) {
      query = query.eq('status', status);
    }

    var { data, error, count } = await query;

    if (error) {
      console.error('Query error:', error);
      return sendError(res, 'Failed to fetch search results');
    }

    // Fetch feedback for these results
    var ids = (data || []).map(function (r) { return r.id; });
    var feedback = [];
    if (ids.length) {
      var fbResult = await supabase
        .from('search_feedback')
        .select('*')
        .in('search_id', ids)
        .order('created_at', { ascending: false });
      feedback = fbResult.data || [];
    }

    // Attach feedback to each result
    var results = (data || []).map(function (r) {
      r.feedback = feedback.filter(function (f) { return f.search_id === r.id; });
      return r;
    });

    sendJson(res, {
      data: results,
      meta: { total: count || 0, page: page, limit: limit, date: date },
    });
  } catch (err) {
    console.error('Error in /api/property-searches:', err);
    sendError(res, 'Internal server error');
  }
};
