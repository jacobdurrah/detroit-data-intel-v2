# Detroit Data Intelligence Platform — V2 Engineering Spec

## Architecture

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────┐
│  Frontend    │────▶│  Vercel API      │────▶│  Supabase   │
│  (Vanilla JS)│     │  (Serverless)    │     │  (Postgres  │
│  Leaflet Map │◀────│  /api/*.js       │◀────│  + PostGIS) │
│  Dark Theme  │     └──────────────────┘     └─────────────┘
└─────────────┘              │
       │                     │
       └── Chat Engine ──────┘
```

## Supabase Config
- URL: (set via SUPABASE_URL env var)
- Anon Key: (set via SUPABASE_ANON_KEY env var)
- Service Key: (set via SUPABASE_SERVICE_KEY env var)

## Vercel Config
- Token: (set via VERCEL_TOKEN env var)
- Project: detroit-data-intel

## Database Schema (Supabase Postgres + PostGIS)

### Enable PostGIS
```sql
CREATE EXTENSION IF NOT EXISTS postgis;
```

### Tables

#### property_sales
```sql
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
```

#### building_permits
```sql
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
```

#### trades_permits
```sql
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
```

#### blight_tickets
```sql
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
```

#### dlba_inventory
```sql
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
```

#### demolitions
```sql
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
```

#### rental_registrations
```sql
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
```

#### vacant_properties
```sql
CREATE TABLE vacant_properties (
  id SERIAL PRIMARY KEY,
  address TEXT,
  issued_date DATE,
  neighborhood TEXT,
  geom GEOMETRY(Point, 4326),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_vacant_geom ON vacant_properties USING GIST(geom);
```

#### crime_incidents
```sql
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
```

#### hmda_lending
```sql
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
```

### Materialized Views (pre-computed analytics)

#### mv_investor_profiles
```sql
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
```

#### mv_neighborhood_scores
```sql
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
```

#### mv_contractor_profiles
```sql
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
```

#### mv_lender_profiles
```sql
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
```

## Project Structure
```
detroit-data-intel-v2/
├── api/                      # Vercel serverless functions
│   ├── sales.js              # GET /api/sales?bounds=...&limit=...&page=...
│   ├── investors.js           # GET /api/investors?tier=...&min_purchases=...
│   ├── investor/[name].js     # GET /api/investor/HANTZ%20WOODLANDS
│   ├── neighborhoods.js       # GET /api/neighborhoods?sort=...
│   ├── contractors.js         # GET /api/contractors?specialty=...&neighborhood=...
│   ├── lending.js             # GET /api/lending?sub60k=true&multifamily=true
│   ├── sellers.js             # GET /api/sellers?min_score=...&neighborhood=...
│   ├── map-tiles.js           # GET /api/map-tiles?layer=sales&bounds=...&zoom=...
│   ├── search.js              # GET /api/search?q=hantz (cross-entity search)
│   └── chat.js                # POST /api/chat {question: "..."}
├── lib/
│   └── supabase.js            # Supabase client init
├── public/
│   ├── index.html
│   ├── css/
│   │   └── style.css          # Mobile-first dark theme
│   └── js/
│       ├── app.js             # Main controller, tab routing, state
│       ├── map.js             # Leaflet with viewport-based loading
│       ├── investors.js       # Investor dashboard with filters
│       ├── neighborhoods.js   # Neighborhood scores
│       ├── contractors.js     # Contractor directory
│       ├── lending.js         # Lending intelligence
│       ├── pipeline.js        # Motivated sellers / deal pipeline
│       └── chat.js            # Chat UI + query engine
├── scripts/
│   ├── import-data.py         # Load cached JSON → Supabase
│   └── refresh-data.py        # Fetch fresh data from Detroit APIs → Supabase
├── tests/
│   ├── playwright.config.js
│   └── detroit-data-intel.spec.js
├── vercel.json
├── package.json
└── .env.local                 # SUPABASE_URL, SUPABASE_SERVICE_KEY, SUPABASE_ANON_KEY
```

## API Design

All endpoints return: `{data: [...], meta: {total, page, limit}}`

### GET /api/sales
Query params: bounds (sw_lat,sw_lng,ne_lat,ne_lng), neighborhood, grantee, grantor, min_price, max_price, date_from, date_to, limit (default 500), page
Returns: sales with lat/lng for map rendering

### GET /api/investors
Query params: tier (institutional|large|medium|small), min_purchases, max_purchases, neighborhood, sort (purchases|spend|recent), limit, page, search
Returns: investor profiles from mv_investor_profiles

### GET /api/investor/[name]
Returns: full profile + purchase history + neighborhoods breakdown + permit cross-reference

### GET /api/neighborhoods
Query params: sort (score|sales|price|permits|blight), limit
Returns: neighborhood scores from mv_neighborhood_scores

### GET /api/contractors
Query params: specialty (Mechanical|Plumbing|Electrical), neighborhood, search, sort, limit, page
Returns: contractor profiles with contact info

### GET /api/lending
Query params: sub60k (bool), investment (bool), multifamily (bool), loan_type (FHA|Conventional|VA), sort, limit
Returns: lender profiles from mv_lender_profiles

### GET /api/sellers
Query params: min_score, neighborhood, limit
Returns: motivated seller scored properties

### GET /api/map-tiles
Query params: layer (sales|permits|trades|blight|dlba|demos|rentals|crime|vacant), bounds, zoom, limit
Returns: points for map rendering, clustered at low zoom

### GET /api/search
Query params: q (search term)
Returns: cross-entity search results (investors, addresses, contractors, neighborhoods)

### POST /api/chat  
Body: {question: "who is hantz woodlands?"}
Returns: {answer: "...", data: [...], mapPoints: [...]}
Server-side query classification + SQL generation

## Frontend Requirements

### Mobile-First Design
- 375px minimum width
- Bottom tab navigation on mobile
- Collapsible filter panels
- Card-based layouts (no tables on mobile)
- Horizontal scroll for wide data on mobile
- Touch-friendly controls (44px min tap targets)

### Map (Leaflet)
- Viewport-based data loading (fetch on move/zoom)
- Marker clustering with counts
- Layer toggles (collapsible panel)
- Popup with real property data on click
- "Show on map" integration from chat and other tabs
- CartoDB dark basemap

### Tab Navigation
1. Map — interactive map with all layers
2. Investors — searchable, filterable, sortable (2000+)
3. Neighborhoods — scored list with comparison
4. Contractors — directory with contact info
5. Lending — lender profiles with filters
6. Pipeline — motivated seller targets

### Chat (floating panel)
- Bottom-right FAB button
- Natural language → API queries
- Results rendered inline with tables
- "Show on map" button for spatial results
- Query suggestions

### Dark Theme
- Background: #0f0f1a
- Surface: #1a1a2e
- Border: #2a2a3e
- Text: #e0e0e0
- Accent: #3b82f6
- Success: #10b981
- Warning: #f59e0b
- Danger: #ef4444

## Data Import

### Source: Existing cached JSON (521MB)
Located at: /Users/agent-x/Projects/detroit-data-intel/data/cache/
Files: sales.json, trades.json, permits.json, blight.json, rentals.json, vacant.json, demos.json, dlba_inventory.json, dlba_own_it_now.json, presale.json, crime.json, crime_2025.json, crime_2026.json

### Import Script (scripts/import-data.py)
1. Read each JSON file
2. Transform fields to match schema
3. Batch INSERT into Supabase (1000 rows per batch, use upsert)
4. Create geometry from lat/lng: ST_SetSRID(ST_MakePoint(lng, lat), 4326)
5. After all imports: REFRESH MATERIALIZED VIEW for all views
6. Print stats (rows imported per table)

### HMDA Import
Use existing deploy/api/lending.json (already processed with lender names)

## Playwright Tests

### Test Suite: tests/detroit-data-intel.spec.js
Run against live Vercel URL.

1. **Page Load** — title visible, stats bar shows non-zero counts
2. **Map Renders** — Leaflet map visible, zoom controls present
3. **Map Data Loads** — markers appear after waiting for API response
4. **Map Popup** — click marker → popup with real data (address, price, not "N/A")
5. **Investors Tab** — loads 20+ investors, names not "Unknown", has tier badges
6. **Investor Filter** — filter by tier "institutional" → fewer results, all institutional
7. **Investor Search** — type "hantz" → filtered results include Hantz
8. **Neighborhoods Tab** — loads neighborhoods with scores > 0
9. **Contractors Tab** — shows contractor names, contact info present
10. **Lending Tab** — shows lender names (United Wholesale, Rocket), rates > 0
11. **Lending Filter** — filter sub-$60K → results have sub_60k_loans > 0
12. **Pipeline Tab** — motivated sellers with scores, addresses
13. **Chat Opens** — click FAB → chat panel opens
14. **Chat Query** — type "who is hantz" → get response with purchase count
15. **Chat Map** — "show properties in corktown" → map button appears, clicking shows markers
16. **Layer Toggles** — toggle blight layer → data appears/disappears
17. **Mobile Responsive** — viewport 375px → tabs visible, no horizontal overflow

### Config: tests/playwright.config.js
- Browser: chromium
- Base URL: from env or https://deploy-five-silk.vercel.app
- Timeout: 30s per test
- Retries: 1

## Deploy Pipeline
1. `npm run import` — load data into Supabase
2. `npm run test` — Playwright tests  
3. `vercel --prod` — deploy to Vercel
4. `npm run test:prod` — smoke test against production

## Environment Variables (Vercel)
- SUPABASE_URL=(set in Vercel project settings)
- SUPABASE_ANON_KEY=(set in Vercel project settings)
- SUPABASE_SERVICE_KEY=(set in Vercel project settings)
