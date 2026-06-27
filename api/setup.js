const { handleCors, sendJson, sendError, requireBearerToken } = require('./_helpers');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  if (req.method !== 'POST') {
    return sendError(res, 'Method not allowed', 405);
  }

  var authError = requireBearerToken(req, res, 'SETUP_API_KEY');
  if (authError) return;

  var dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    return sendError(res, 'DATABASE_URL is not configured', 503);
  }

  try {
    var { Client } = require('pg');
    var client = new Client({
      connectionString: dbUrl,
      ssl: { rejectUnauthorized: false },
      connectionTimeoutMillis: 10000,
    });

    await client.connect();

    var sql = `
CREATE TABLE IF NOT EXISTS property_searches (
  id BIGSERIAL PRIMARY KEY,
  search_date DATE NOT NULL DEFAULT CURRENT_DATE,
  address TEXT NOT NULL,
  parcel_id TEXT, neighborhood TEXT, zip TEXT,
  list_price NUMERIC, estimated_arv NUMERIC,
  score INTEGER DEFAULT 0, score_breakdown JSONB DEFAULT '{}',
  source TEXT, listing_url TEXT, photo_urls JSONB DEFAULT '[]',
  description_raw TEXT, highlights JSONB DEFAULT '{}',
  beds INTEGER, baths NUMERIC, sqft INTEGER, year_built INTEGER,
  lot_size TEXT, property_type TEXT DEFAULT 'single_family',
  status TEXT DEFAULT 'new' CHECK (status IN ('new','reviewed','saved','archived')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(address, search_date)
);
CREATE TABLE IF NOT EXISTS search_feedback (
  id BIGSERIAL PRIMARY KEY,
  search_id BIGINT REFERENCES property_searches(id) ON DELETE CASCADE,
  user_name TEXT NOT NULL DEFAULT 'anonymous',
  feedback TEXT NOT NULL CHECK (feedback IN ('up','down')),
  reason TEXT, created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS saved_properties (
  id BIGSERIAL PRIMARY KEY,
  search_id BIGINT REFERENCES property_searches(id) ON DELETE SET NULL,
  address TEXT NOT NULL, parcel_id TEXT, neighborhood TEXT, zip TEXT,
  list_price NUMERIC, offer_price NUMERIC, estimated_arv NUMERIC, estimated_rehab NUMERIC,
  notes TEXT,
  status TEXT DEFAULT 'researching' CHECK (status IN ('researching','offer_pending','under_contract','closed','passed')),
  photos JSONB DEFAULT '[]', rehab_plan JSONB DEFAULT '{}',
  contractor_bids JSONB DEFAULT '[]', report_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(), updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS search_preferences (
  id BIGSERIAL PRIMARY KEY,
  key TEXT UNIQUE NOT NULL, value NUMERIC NOT NULL DEFAULT 0,
  source TEXT DEFAULT 'default' CHECK (source IN ('default','learned')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS property_reports (
  id BIGSERIAL PRIMARY KEY,
  search_id BIGINT REFERENCES property_searches(id) ON DELETE SET NULL,
  saved_property_id BIGINT REFERENCES saved_properties(id) ON DELETE SET NULL,
  address TEXT NOT NULL,
  report_type TEXT DEFAULT 'dd' CHECK (report_type IN ('dd','rehab','investment')),
  verdict TEXT CHECK (verdict IN ('BUY','WATCH','PASS')),
  score INTEGER, summary TEXT, report_data JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE property_searches ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE saved_properties ENABLE ROW LEVEL SECURITY;
ALTER TABLE search_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE property_reports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_all" ON property_searches;
DROP POLICY IF EXISTS "anon_all" ON search_feedback;
DROP POLICY IF EXISTS "anon_all" ON saved_properties;
DROP POLICY IF EXISTS "anon_all" ON search_preferences;
DROP POLICY IF EXISTS "anon_all" ON property_reports;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='public_read' AND tablename='property_searches') THEN CREATE POLICY "public_read" ON property_searches FOR SELECT USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='public_read' AND tablename='search_feedback') THEN CREATE POLICY "public_read" ON search_feedback FOR SELECT USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='public_read' AND tablename='saved_properties') THEN CREATE POLICY "public_read" ON saved_properties FOR SELECT USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='public_read' AND tablename='search_preferences') THEN CREATE POLICY "public_read" ON search_preferences FOR SELECT USING (true); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname='public_read' AND tablename='property_reports') THEN CREATE POLICY "public_read" ON property_reports FOR SELECT USING (true); END IF;
END $$;
INSERT INTO search_preferences (key, value, source) VALUES
  ('mechanical_weight',25,'default'),('roof_weight',20,'default'),
  ('neighborhood_weight',20,'default'),('price_to_value_weight',25,'default'),
  ('cosmetic_penalty',-5,'default'),('blight_penalty',-15,'default'),
  ('bank_owned_boost',10,'default')
ON CONFLICT (key) DO NOTHING;
    `;

    await client.query(sql);
    await client.end();

    sendJson(res, { success: true, message: 'All tables created successfully' });
  } catch (err) {
    console.error('Setup error:', err);
    sendError(res, 'Setup failed: ' + err.message);
  }
};
