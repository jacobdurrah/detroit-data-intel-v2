const { handleCors, sendJson, sendError } = require('./_helpers');

// Store feedback in a JSON file (will move to Supabase later)
// For now, use Vercel KV or just log to a file
const feedbackStore = [];

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method === 'POST') {
    try {
      const { page, element, feedback, screenshot, timestamp, userAgent } = req.body || {};
      
      if (!feedback) {
        return sendError(res, 'feedback field is required', 400);
      }

      const entry = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        page: page || 'unknown',
        element: element || null,
        feedback: feedback,
        screenshot: screenshot || null,
        timestamp: timestamp || new Date().toISOString(),
        userAgent: userAgent || req.headers['user-agent'],
        ip: req.headers['x-forwarded-for'] || req.socket?.remoteAddress,
      };

      // Try to write to Supabase
      const supabaseUrl = process.env.SUPABASE_URL;
      const supabaseKey = process.env.SUPABASE_SERVICE_KEY;
      
      if (supabaseUrl && supabaseKey) {
        try {
          await fetch(`${supabaseUrl}/rest/v1/feedback`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Prefer': 'return=minimal',
            },
            body: JSON.stringify({
              page: entry.page,
              element: entry.element,
              feedback: entry.feedback,
              user_agent: entry.userAgent,
              created_at: entry.timestamp,
            }),
          });
        } catch (e) {
          console.error('Supabase feedback write failed:', e);
          // Continue - don't fail the request
        }
      }

      // Always store in memory too (for the GET endpoint)
      feedbackStore.push(entry);
      
      sendJson(res, { success: true, id: entry.id });
    } catch (err) {
      console.error('Feedback POST error:', err);
      sendError(res, 'Failed to save feedback');
    }
  } else if (req.method === 'GET') {
    // Return recent feedback (for admin view)
    const key = req.query.key;
    if (key !== 'frameworkai') {
      return sendError(res, 'Unauthorized', 401);
    }
    sendJson(res, { data: feedbackStore.slice(-100).reverse() });
  } else {
    sendError(res, 'Method not allowed', 405);
  }
};
