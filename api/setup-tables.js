const { handleCors, sendJson, sendError, requireSetupAuth } = require('./_helpers');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireSetupAuth(req, res)) return;

  if (!process.env.SUPABASE_SERVICE_KEY) {
    return sendError(res, 'SUPABASE_SERVICE_KEY is not configured', 500);
  }

  const { createClient } = require('@supabase/supabase-js');

  // Use service role key to bypass RLS
  const sb = createClient(
    'https://vgtwkgckvryxbgujnqro.supabase.co',
    process.env.SUPABASE_SERVICE_KEY
  );

  const results = [];

  // Test if tables exist by trying to query them
  const tables = ['property_searches', 'search_feedback', 'saved_properties', 'search_preferences', 'property_reports'];
  for (const t of tables) {
    const { error } = await sb.from(t).select('*', { count: 'exact', head: true });
    results.push({ table: t, exists: !error, error: error?.message });
  }

  // If property_searches doesn't exist, we need to create via SQL
  // Since we can't run DDL through PostgREST, we'll use the pg-meta endpoint
  // Actually, let's use the Supabase Management API SQL endpoint

  sendJson(res, { tables: results, message: 'Check which tables exist. If missing, create via Supabase Dashboard SQL editor.' });
};
