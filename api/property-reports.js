const { handleCors, sendJson, sendError, intParam, requirePropertyPipelineAuth } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'GET') {
      // Single report by id
      if (req.query.id) {
        const { data, error } = await supabase
          .from('property_reports')
          .select('*')
          .eq('id', intParam(req.query.id))
          .single();
        if (error) return sendError(res, error.message);
        return sendJson(res, { data });
      }

      // Daily report by date
      if (req.query.date) {
        const { data, error } = await supabase
          .from('property_reports')
          .select('*')
          .eq('address', 'DAILY_REPORT_' + req.query.date)
          .order('created_at', { ascending: false })
          .limit(1)
          .single();
        if (error && error.code !== 'PGRST116') return sendError(res, error.message);
        return sendJson(res, { data: data || null });
      }

      // List all DD reports (not daily reports)
      var page = intParam(req.query.page, 1);
      var limit = Math.min(intParam(req.query.limit, 20), 100);
      var offset = (page - 1) * limit;

      var query = supabase
        .from('property_reports')
        .select('*', { count: 'exact' })
        .not('address', 'like', 'DAILY_REPORT_%')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (req.query.verdict) {
        query = query.eq('verdict', req.query.verdict);
      }

      var { data, error, count } = await query;
      if (error) return sendError(res, error.message);

      return sendJson(res, {
        data: data || [],
        meta: { total: count || 0, page, limit }
      });
    }

    if (req.method === 'POST') {
      if (!requirePropertyPipelineAuth(req, res)) return;

      var body = req.body || {};
      if (!body.address) return sendError(res, 'address is required', 400);

      const { data, error } = await supabase
        .from('property_reports')
        .insert({
          address: body.address,
          search_id: body.search_id || null,
          saved_property_id: body.saved_property_id || null,
          report_type: body.report_type || 'dd',
          verdict: body.verdict || null,
          score: body.score || null,
          summary: body.summary || null,
          report_data: body.report_data || {}
        })
        .select()
        .single();

      if (error) return sendError(res, error.message, 400);
      return sendJson(res, { data }, 201);
    }

    sendError(res, 'Method not allowed', 405);
  } catch (err) {
    console.error('Error in /api/property-reports:', err);
    sendError(res, 'Internal server error');
  }
};
