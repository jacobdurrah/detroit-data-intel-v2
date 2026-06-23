const { handleCors, sendJson, sendError, intParam, requireWriteAuth } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    if (req.method === 'POST') {
      if (!requireWriteAuth(req, res)) return;

      var body = req.body || {};
      if (!body.search_id || !body.feedback) {
        return sendError(res, 'search_id and feedback (up/down) are required', 400);
      }

      var { data, error } = await supabase
        .from('search_feedback')
        .insert({
          search_id: body.search_id,
          user_name: body.user_name || 'anonymous',
          feedback: body.feedback,
          reason: body.reason || null,
        })
        .select();

      if (error) {
        console.error('Feedback insert error:', error);
        return sendError(res, 'Failed to save feedback');
      }

      // Update property status to reviewed if still 'new'
      await supabase
        .from('property_searches')
        .update({ status: 'reviewed' })
        .eq('id', body.search_id)
        .eq('status', 'new');

      return sendJson(res, { data: data ? data[0] : null }, 201);
    }

    // GET
    var searchId = intParam(req.query.search_id, null);
    if (!searchId) {
      return sendError(res, 'search_id is required', 400);
    }

    var { data, error } = await supabase
      .from('search_feedback')
      .select('*')
      .eq('search_id', searchId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Feedback query error:', error);
      return sendError(res, 'Failed to fetch feedback');
    }

    sendJson(res, { data: data || [] });
  } catch (err) {
    console.error('Error in /api/search-feedback:', err);
    sendError(res, 'Internal server error');
  }
};
