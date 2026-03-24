const { handleCors, checkAuth, sendJson, sendError } = require('../_helpers');
const { supabase } = require('../_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const { id } = req.query;
    if (!id) return sendError(res, 'Permit ID is required', 400);

    const decoded = decodeURIComponent(id);

    const [permitsRes, tradesRes] = await Promise.all([
      supabase.from('permits').select('*').eq('permit_no', decoded).limit(1),
      supabase.from('trades').select('*').eq('permit_no', decoded).limit(1),
    ]);

    const permit = permitsRes.data?.[0] || tradesRes.data?.[0];
    if (!permit) return sendError(res, 'Permit not found', 404);

    sendJson(res, { data: permit });
  } catch (err) {
    console.error('Error in /api/permit/[id]:', err);
    sendError(res, 'Internal server error');
  }
};
