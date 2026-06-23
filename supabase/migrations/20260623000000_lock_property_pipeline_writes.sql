DROP POLICY IF EXISTS "anon_all" ON property_searches;
DROP POLICY IF EXISTS "anon_all" ON search_feedback;
DROP POLICY IF EXISTS "anon_all" ON saved_properties;
DROP POLICY IF EXISTS "anon_all" ON search_preferences;
DROP POLICY IF EXISTS "anon_all" ON property_reports;

REVOKE INSERT, UPDATE, DELETE ON TABLE property_searches FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE search_feedback FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE saved_properties FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE search_preferences FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON TABLE property_reports FROM anon, authenticated;

GRANT SELECT ON TABLE property_searches TO anon, authenticated;
GRANT SELECT ON TABLE search_feedback TO anon, authenticated;
GRANT SELECT ON TABLE saved_properties TO anon, authenticated;
GRANT SELECT ON TABLE search_preferences TO anon, authenticated;
GRANT SELECT ON TABLE property_reports TO anon, authenticated;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_read' AND tablename = 'property_searches') THEN
    CREATE POLICY "anon_read" ON property_searches FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_read' AND tablename = 'search_feedback') THEN
    CREATE POLICY "anon_read" ON search_feedback FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_read' AND tablename = 'saved_properties') THEN
    CREATE POLICY "anon_read" ON saved_properties FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_read' AND tablename = 'search_preferences') THEN
    CREATE POLICY "anon_read" ON search_preferences FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'anon_read' AND tablename = 'property_reports') THEN
    CREATE POLICY "anon_read" ON property_reports FOR SELECT USING (true);
  END IF;
END $$;
