const { createClient } = require('@supabase/supabase-js');
const { handleCors, requireBearerAuth } = require('./_helpers');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (!requireBearerAuth(req, res, 'SETUP_API_KEY')) return;

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

  res.json({ tables: results, message: 'Check which tables exist. If missing, create via Supabase Dashboard SQL editor.' });
};
