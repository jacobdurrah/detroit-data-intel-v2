-- Detroit Data Intelligence Platform V2 — Database Schema
-- Supabase Postgres + PostGIS

CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================
-- TABLES
-- ============================================================

DROP TABLE IF EXISTS property_sales CASCADE;
CREATE TABLE property_sales (
  id SERIAL PRIMARY KEY,
  sale_id INTEGER UNIQUE,
  parcel_id TEXT,
  address TEXT,
  sale_date DATE,
  sale_price NUMERIC,
  grantor TEXT,
  grantee TEXT,
  term_of_sale TEXT,
  sale_instrument TEXT,
  property_class_code TEXT,
  property_class_description TEXT,
  neighborhood TEXT,
  ecf_neighborhood TEXT,
  council_district TEXT,
  zip_code TEXT,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_sales_grantee ON property_sales(grantee);
CREATE INDEX idx_sales_grantor ON property_sales(grantor);
CREATE INDEX idx_sales_neighborhood ON property_sales(neighborhood);
CREATE INDEX idx_sales_date ON property_sales(sale_date);
CREATE INDEX idx_sales_price ON property_sales(sale_price);
CREATE INDEX idx_sales_geom ON property_sales USING GIST(geom);

DROP TABLE IF EXISTS building_permits CASCADE;
CREATE TABLE building_permits (
  id SERIAL PRIMARY KEY,
  permit_no TEXT,
  address TEXT,
  permit_type TEXT,
  work_description TEXT,
  issued_date DATE,
  neighborhood TEXT,
  current_use_type TEXT,
  proposed_use_type TEXT,
  is_purchased_from_dlba BOOLEAN,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_permits_neighborhood ON building_permits(neighborhood);
CREATE INDEX idx_permits_type ON building_permits(permit_type);
CREATE INDEX idx_permits_date ON building_permits(issued_date);
CREATE INDEX idx_permits_geom ON building_permits USING GIST(geom);

DROP TABLE IF EXISTS trades_permits CASCADE;
CREATE TABLE trades_permits (
  id SERIAL PRIMARY KEY,
  permit_no TEXT,
  address TEXT,
  permit_type TEXT,
  work_description TEXT,
  issued_date DATE,
  owner_name TEXT,
  contact_business_name TEXT,
  contact_name TEXT,
  contact_address TEXT,
  contractor_address TEXT,
  neighborhood TEXT,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_trades_contractor ON trades_permits(contact_business_name);
CREATE INDEX idx_trades_owner ON trades_permits(owner_name);
CREATE INDEX idx_trades_neighborhood ON trades_permits(neighborhood);
CREATE INDEX idx_trades_geom ON trades_permits USING GIST(geom);

DROP TABLE IF EXISTS blight_tickets CASCADE;
CREATE TABLE blight_tickets (
  id SERIAL PRIMARY KEY,
  ticket_id TEXT,
  address TEXT,
  ordinance_description TEXT,
  ticket_issued_date DATE,
  disposition TEXT,
  fine_amount NUMERIC,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_blight_address ON blight_tickets(address);
CREATE INDEX idx_blight_date ON blight_tickets(ticket_issued_date);
CREATE INDEX idx_blight_geom ON blight_tickets USING GIST(geom);

DROP TABLE IF EXISTS dlba_inventory CASCADE;
CREATE TABLE dlba_inventory (
  id SERIAL PRIMARY KEY,
  parcel_id TEXT,
  address TEXT,
  status TEXT,
  program TEXT,
  neighborhood TEXT,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_dlba_neighborhood ON dlba_inventory(neighborhood);
CREATE INDEX idx_dlba_geom ON dlba_inventory USING GIST(geom);

DROP TABLE IF EXISTS demolitions CASCADE;
CREATE TABLE demolitions (
  id SERIAL PRIMARY KEY,
  address TEXT,
  demolition_date DATE,
  work_description TEXT,
  demolition_contractor TEXT,
  neighborhood TEXT,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_demos_geom ON demolitions USING GIST(geom);

DROP TABLE IF EXISTS rental_registrations CASCADE;
CREATE TABLE rental_registrations (
  id SERIAL PRIMARY KEY,
  address TEXT,
  registration_type TEXT,
  issued_date DATE,
  neighborhood TEXT,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_rentals_geom ON rental_registrations USING GIST(geom);

DROP TABLE IF EXISTS vacant_properties CASCADE;
CREATE TABLE vacant_properties (
  id SERIAL PRIMARY KEY,
  address TEXT,
  issued_date DATE,
  neighborhood TEXT,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vacant_geom ON vacant_properties USING GIST(geom);

DROP TABLE IF EXISTS crime_incidents CASCADE;
CREATE TABLE crime_incidents (
  id SERIAL PRIMARY KEY,
  incident_id TEXT,
  address TEXT,
  call_description TEXT,
  category TEXT,
  incident_date TIMESTAMPTZ,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_crime_date ON crime_incidents(incident_date);
CREATE INDEX idx_crime_geom ON crime_incidents USING GIST(geom);

DROP TABLE IF EXISTS hmda_lending CASCADE;
CREATE TABLE hmda_lending (
  id SERIAL PRIMARY KEY,
  lei TEXT,
  lender_name TEXT,
  loan_type TEXT,
  loan_purpose TEXT,
  loan_amount NUMERIC,
  interest_rate NUMERIC,
  property_value NUMERIC,
  total_units TEXT,
  occupancy_type TEXT,
  census_tract TEXT,
  year INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_hmda_lei ON hmda_lending(lei);
CREATE INDEX idx_hmda_amount ON hmda_lending(loan_amount);
CREATE INDEX idx_hmda_type ON hmda_lending(loan_type);
CREATE INDEX idx_hmda_tract ON hmda_lending(census_tract);

-- ============================================================
-- MATERIALIZED VIEWS
-- ============================================================

DROP MATERIALIZED VIEW IF EXISTS mv_investor_profiles CASCADE;
CREATE MATERIALIZED VIEW mv_investor_profiles AS
SELECT
  grantee AS name,
  COUNT(*) AS total_purchases,
  SUM(sale_price) AS total_spend,
  AVG(sale_price) AS avg_price,
  MIN(sale_price) AS min_price,
  MAX(sale_price) AS max_price,
  MIN(sale_date) AS first_purchase,
  MAX(sale_date) AS last_purchase,
  COUNT(DISTINCT neighborhood) AS neighborhood_count,
  MODE() WITHIN GROUP (ORDER BY neighborhood) AS top_neighborhood,
  CASE
    WHEN SUM(sale_price) >= 10000000 THEN 'institutional'
    WHEN SUM(sale_price) >= 1000000 THEN 'large'
    WHEN SUM(sale_price) >= 100000 THEN 'medium'
    ELSE 'small'
  END AS investment_tier
FROM property_sales
WHERE grantee IS NOT NULL AND grantee != ''
GROUP BY grantee
HAVING COUNT(*) >= 2
ORDER BY COUNT(*) DESC;

CREATE INDEX idx_inv_name ON mv_investor_profiles(name);
CREATE INDEX idx_inv_tier ON mv_investor_profiles(investment_tier);
CREATE INDEX idx_inv_purchases ON mv_investor_profiles(total_purchases DESC);

DROP MATERIALIZED VIEW IF EXISTS mv_neighborhood_scores CASCADE;
CREATE MATERIALIZED VIEW mv_neighborhood_scores AS
SELECT
  n.neighborhood,
  COALESCE(s.total_sales, 0) AS total_sales,
  COALESCE(s.median_price, 0) AS median_price,
  COALESCE(p.total_permits, 0) AS total_permits,
  COALESCE(b.total_blight, 0) AS total_blight,
  COALESCE(r.total_rentals, 0) AS total_rentals,
  COALESCE(d.total_demos, 0) AS total_demos
FROM (SELECT DISTINCT neighborhood FROM property_sales WHERE neighborhood IS NOT NULL) n
LEFT JOIN (
  SELECT neighborhood, COUNT(*) AS total_sales, PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price) AS median_price
  FROM property_sales WHERE sale_price > 0 GROUP BY neighborhood
) s ON n.neighborhood = s.neighborhood
LEFT JOIN (
  SELECT neighborhood, COUNT(*) AS total_permits FROM building_permits GROUP BY neighborhood
) p ON n.neighborhood = p.neighborhood
LEFT JOIN (
  SELECT neighborhood, COUNT(*) AS total_blight FROM blight_tickets GROUP BY neighborhood
) b ON n.neighborhood = b.neighborhood
LEFT JOIN (
  SELECT neighborhood, COUNT(*) AS total_rentals FROM rental_registrations GROUP BY neighborhood
) r ON n.neighborhood = r.neighborhood
LEFT JOIN (
  SELECT neighborhood, COUNT(*) AS total_demos FROM demolitions GROUP BY neighborhood
) d ON n.neighborhood = d.neighborhood;

DROP MATERIALIZED VIEW IF EXISTS mv_contractor_profiles CASCADE;
CREATE MATERIALIZED VIEW mv_contractor_profiles AS
SELECT
  contact_business_name AS name,
  MAX(contact_name) AS contact_name,
  MAX(contact_address) AS contact_address,
  COUNT(*) AS total_permits,
  COUNT(DISTINCT neighborhood) AS neighborhoods_served,
  MODE() WITHIN GROUP (ORDER BY neighborhood) AS top_neighborhood,
  MODE() WITHIN GROUP (ORDER BY permit_type) AS top_specialty,
  COUNT(*) FILTER (WHERE issued_date >= CURRENT_DATE - INTERVAL '12 months') AS recent_permits
FROM trades_permits
WHERE contact_business_name IS NOT NULL AND contact_business_name != ''
GROUP BY contact_business_name
ORDER BY COUNT(*) DESC;

DROP MATERIALIZED VIEW IF EXISTS mv_lender_profiles CASCADE;
CREATE MATERIALIZED VIEW mv_lender_profiles AS
SELECT
  lei,
  MAX(lender_name) AS name,
  COUNT(*) AS total_loans,
  SUM(loan_amount) AS total_volume,
  AVG(loan_amount) AS avg_amount,
  MIN(loan_amount) AS min_amount,
  MAX(loan_amount) AS max_amount,
  AVG(interest_rate) FILTER (WHERE interest_rate > 0) AS avg_rate,
  COUNT(*) FILTER (WHERE loan_amount <= 60000) AS sub_60k_loans,
  COUNT(*) FILTER (WHERE occupancy_type = 'Investment') AS investment_loans,
  COUNT(*) FILTER (WHERE total_units NOT IN ('1', '')) AS multifamily_loans,
  jsonb_object_agg(DISTINCT loan_type, TRUE) AS loan_types
FROM hmda_lending
GROUP BY lei
HAVING COUNT(*) >= 3
ORDER BY COUNT(*) DESC;
