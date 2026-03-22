-- Aggregation views for API endpoints
-- Apply AFTER the base tables migration (20260316_create_detroit_tables.sql)

-- Investor profiles: aggregated from sales by grantee
CREATE OR REPLACE VIEW investor_profiles AS
SELECT
  grantee AS name,
  count(*)::INTEGER AS total_purchases,
  COALESCE(sum(sale_price), 0)::NUMERIC AS total_spend,
  ROUND(COALESCE(avg(sale_price), 0), 2)::NUMERIC AS avg_price,
  COALESCE(min(sale_price), 0)::NUMERIC AS min_price,
  COALESCE(max(sale_price), 0)::NUMERIC AS max_price,
  min(sale_date)::TEXT AS first_purchase,
  max(sale_date)::TEXT AS last_purchase,
  count(DISTINCT neighborhood)::INTEGER AS neighborhood_count,
  mode() WITHIN GROUP (ORDER BY neighborhood) AS top_neighborhood,
  CASE
    WHEN count(*) >= 100 THEN 'institutional'
    WHEN count(*) >= 50 THEN 'large'
    WHEN count(*) >= 10 THEN 'medium'
    ELSE 'small'
  END AS investment_tier
FROM sales
WHERE grantee IS NOT NULL AND TRIM(grantee) != ''
GROUP BY grantee;

-- Contractor profiles: aggregated from trades by contractor_name
CREATE OR REPLACE VIEW contractor_profiles AS
SELECT
  contractor_name AS name,
  count(*)::INTEGER AS total_permits,
  count(DISTINCT neighborhood)::INTEGER AS neighborhoods_served,
  count(DISTINCT address)::INTEGER AS unique_properties,
  mode() WITHIN GROUP (ORDER BY permit_type) AS top_specialty,
  mode() WITHIN GROUP (ORDER BY neighborhood) AS top_neighborhood,
  min(permit_issued)::TEXT AS first_permit,
  max(permit_issued)::TEXT AS last_permit,
  count(*) FILTER (WHERE permit_issued >= CURRENT_DATE - INTERVAL '1 year')::INTEGER AS recent_permits
FROM trades
WHERE contractor_name IS NOT NULL AND TRIM(contractor_name) != ''
GROUP BY contractor_name;

-- Neighborhood stats: aggregated across multiple tables
CREATE OR REPLACE VIEW neighborhood_stats AS
WITH
  sale_stats AS (
    SELECT
      neighborhood,
      count(*)::INTEGER AS total_sales,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY sale_price)
        FILTER (WHERE sale_price > 0), 0)::NUMERIC AS median_price,
      COALESCE(sum(sale_price), 0)::NUMERIC AS total_volume
    FROM sales
    WHERE neighborhood IS NOT NULL
    GROUP BY neighborhood
  ),
  permit_stats AS (
    SELECT neighborhood, count(*)::INTEGER AS total_permits
    FROM permits
    WHERE neighborhood IS NOT NULL
    GROUP BY neighborhood
  ),
  blight_stats AS (
    SELECT
      neighborhood,
      count(*)::INTEGER AS total_blight,
      COALESCE(sum(fine_amount), 0)::NUMERIC AS total_fines
    FROM blight
    WHERE neighborhood IS NOT NULL
    GROUP BY neighborhood
  ),
  demo_stats AS (
    SELECT neighborhood, count(*)::INTEGER AS total_demos
    FROM demos
    WHERE neighborhood IS NOT NULL
    GROUP BY neighborhood
  ),
  rental_stats AS (
    SELECT neighborhood, count(*)::INTEGER AS total_rentals
    FROM rentals
    WHERE neighborhood IS NOT NULL
    GROUP BY neighborhood
  ),
  all_neighborhoods AS (
    SELECT DISTINCT neighborhood FROM (
      SELECT neighborhood FROM sales WHERE neighborhood IS NOT NULL
      UNION SELECT neighborhood FROM permits WHERE neighborhood IS NOT NULL
      UNION SELECT neighborhood FROM blight WHERE neighborhood IS NOT NULL
      UNION SELECT neighborhood FROM demos WHERE neighborhood IS NOT NULL
      UNION SELECT neighborhood FROM rentals WHERE neighborhood IS NOT NULL
    ) sub
  )
SELECT
  n.neighborhood,
  COALESCE(s.total_sales, 0)::INTEGER AS total_sales,
  COALESCE(s.median_price, 0)::NUMERIC AS median_price,
  COALESCE(s.total_volume, 0)::NUMERIC AS total_volume,
  COALESCE(p.total_permits, 0)::INTEGER AS total_permits,
  COALESCE(b.total_blight, 0)::INTEGER AS total_blight,
  COALESCE(b.total_fines, 0)::NUMERIC AS total_fines,
  COALESCE(d.total_demos, 0)::INTEGER AS total_demos,
  COALESCE(r.total_rentals, 0)::INTEGER AS total_rentals,
  -- Momentum score: 0-100 weighted combination
  ROUND(LEAST(100, GREATEST(0,
    (COALESCE(s.total_sales, 0)::FLOAT
      / GREATEST(1, (SELECT MAX(total_sales) FROM sale_stats))::FLOAT) * 25
    + (COALESCE(p.total_permits, 0)::FLOAT
      / GREATEST(1, (SELECT MAX(total_permits) FROM permit_stats))::FLOAT) * 25
    + (1.0 - COALESCE(b.total_blight, 0)::FLOAT
      / GREATEST(1, (SELECT MAX(total_blight) FROM blight_stats))::FLOAT) * 25
    + (COALESCE(s.median_price, 0)::FLOAT
      / GREATEST(1, (SELECT MAX(median_price) FROM sale_stats))::FLOAT) * 25
  ))::NUMERIC, 1) AS score
FROM all_neighborhoods n
LEFT JOIN sale_stats s ON n.neighborhood = s.neighborhood
LEFT JOIN permit_stats p ON n.neighborhood = p.neighborhood
LEFT JOIN blight_stats b ON n.neighborhood = b.neighborhood
LEFT JOIN demo_stats d ON n.neighborhood = d.neighborhood
LEFT JOIN rental_stats r ON n.neighborhood = r.neighborhood;

-- Additional indexes for query performance
CREATE INDEX IF NOT EXISTS idx_sales_address ON sales(address);
CREATE INDEX IF NOT EXISTS idx_sales_grantor ON sales(grantor);
CREATE INDEX IF NOT EXISTS idx_permits_address ON permits(address);
CREATE INDEX IF NOT EXISTS idx_trades_address ON trades(address);
CREATE INDEX IF NOT EXISTS idx_trades_contractor ON trades(contractor_name);
CREATE INDEX IF NOT EXISTS idx_blight_street ON blight(street_number, street_name);
CREATE INDEX IF NOT EXISTS idx_assessment_address ON assessment(address);
CREATE INDEX IF NOT EXISTS idx_rentals_address ON rentals(address);
CREATE INDEX IF NOT EXISTS idx_presale_address ON presale(address);
CREATE INDEX IF NOT EXISTS idx_vacant_address ON vacant(address);
CREATE INDEX IF NOT EXISTS idx_dlba_owned_address ON dlba_owned(address);
CREATE INDEX IF NOT EXISTS idx_demos_address ON demos(address);
CREATE INDEX IF NOT EXISTS idx_dlba_auction_address ON dlba_auction(address);
CREATE INDEX IF NOT EXISTS idx_sales_lat_lng ON sales(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_blight_lat_lng ON blight(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_permits_lat_lng ON permits(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_trades_lat_lng ON trades(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_crime_lat_lng ON crime(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_demos_lat_lng ON demos(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_rentals_lat_lng ON rentals(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_dlba_owned_lat_lng ON dlba_owned(latitude, longitude);
CREATE INDEX IF NOT EXISTS idx_vacant_lat_lng ON vacant(latitude, longitude);

-- Grant read access to anon role for views
GRANT SELECT ON investor_profiles TO anon;
GRANT SELECT ON contractor_profiles TO anon;
GRANT SELECT ON neighborhood_stats TO anon;
