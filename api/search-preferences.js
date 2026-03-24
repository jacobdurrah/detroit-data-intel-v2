const { handleCors, checkAuth, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    var { data, error } = await supabase
      .from('search_preferences')
      .select('*')
      .order('key');

    if (error) {
      console.error('Preferences error:', error);
      return sendError(res, 'Failed to fetch preferences');
    }

    // Convert array to key-value map for easy consumption
    var prefs = {};
    (data || []).forEach(function (p) {
      prefs[p.key] = p.value;
    });

    sendJson(res, { data: prefs, raw: data || [] });
  } catch (err) {
    console.error('Error in /api/search-preferences:', err);
    sendError(res, 'Internal server error');
  }
};
