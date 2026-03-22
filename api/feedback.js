const { handleCors, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method === 'POST') {
    try {
      const { page, element, feedback, type, timestamp, userAgent } = req.body || {};

      if (!feedback) return sendError(res, 'feedback field is required', 400);

      const { data, error } = await supabase.from('feedback').insert({
        page: page || 'unknown',
        element: element || null,
        feedback,
        feedback_type: type || 'general',
        user_agent: userAgent || req.headers['user-agent'],
        ip: req.headers['x-forwarded-for'] || null,
        created_at: timestamp || new Date().toISOString(),
      }).select('id').single();

      if (error) {
        console.error('Feedback insert error:', error);
        return sendError(res, 'Failed to save feedback');
      }

      sendJson(res, { success: true, id: data.id });
    } catch (err) {
      console.error('Feedback POST error:', err);
      sendError(res, 'Failed to save feedback');
    }
  } else if (req.method === 'GET') {
    const key = req.query.key;
    if (key !== 'frameworkai') return sendError(res, 'Unauthorized', 401);

    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const { data, error } = await supabase.from('feedback')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) return sendError(res, 'Failed to read feedback');
    sendJson(res, { data: data || [] });
  } else {
    sendError(res, 'Method not allowed', 405);
  }
};
