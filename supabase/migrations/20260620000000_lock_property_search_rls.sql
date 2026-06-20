-- Remove permissive anonymous read/write policies from property pipeline tables.
-- Server-side APIs use the service-role key and bypass RLS; public clients must
-- not be able to mutate these tables directly through Supabase REST.

ALTER TABLE IF EXISTS property_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS search_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS saved_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS search_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE IF EXISTS property_reports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_all" ON property_searches;
DROP POLICY IF EXISTS "anon_all" ON search_feedback;
DROP POLICY IF EXISTS "anon_all" ON saved_properties;
DROP POLICY IF EXISTS "anon_all" ON search_preferences;
DROP POLICY IF EXISTS "anon_all" ON property_reports;
