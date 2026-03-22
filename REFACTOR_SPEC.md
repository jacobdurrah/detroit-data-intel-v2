# Refactor Spec: Switch All API Endpoints from JSON Files to Supabase

## Overview
Currently all API endpoints load data from local JSON files (`api/_data/*.json`) with limited records (5K-60K paginated from ArcGIS). We now have **2M+ rows in Supabase** across 11 tables. Every endpoint must switch to querying Supabase directly.

## Supabase Connection
```javascript
// api/_supabase.js - shared client
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://vgtwkgckvryxbgujnqro.supabase.co',
  process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_ANON_KEY
);
module.exports = { supabase };
```

## Database Tables (all in public schema)
| Table | Rows | Primary Key | Key Columns |
|-------|------|-------------|-------------|
| sales | 505,852 | sales_id | address, sale_date, sale_price, grantor, grantee, neighborhood, parcel_id, ecf_neighborhood, zip_code, lat/lng |
| blight | 872,697 | ticket_id | violator_name, street_number, street_name, violation_description, fine_amount, judgment_amount, balance_due, payment_status, neighborhood |
| assessment | 388,147 | parcel_id | address, property_class, total_assessed_value, total_taxable_value, land_value, improvement_value, year_built, bedrooms, owner_name, neighborhood, zip_code |
| permits | 43,830 | permit_no | address, permit_issued, permit_type, description, estimated_cost, contractor_name, parcel_id, neighborhood |
| trades | 112,096 | permit_no | address, permit_issued, permit_type, description, contractor_name, parcel_id, neighborhood |
| rentals | 38,179 | certificate_number | address, parcel_id, rental_type, owner_name, neighborhood |
| dlba_owned | 59,310 | parcel_id | address, neighborhood, property_class |
| dlba_auction | 5,418 | object_id | address, sale_date, sale_price, buyer, parcel_id, neighborhood |
| presale | 15,060 | case_id | address, status, rating, parcel_id, neighborhood |
| demos | 16,089 | permit_no | address, permit_issued, contractor_name, parcel_id, neighborhood |
| vacant | 1,417 | task_id | address, date_issued, owner_name, parcel_id, neighborhood |

Also existing tables from prior work:
- `loans` (HMDA data - 26K+ records already loaded previously)
- `lenders` (lending summary)

## Endpoints to Refactor

### 1. `api/property/[address].js` — CRITICAL
Cross-reference ALL datasets by address. Currently only searches sales, permits, trades, blight from JSON.
- Query ALL 11 tables by address (case-insensitive ILIKE match)
- Also query assessment table by address for assessed value, year built, owner
- Return unified property profile with all data
- Add assessment data to response (assessed_value, taxable_value, year_built, bedrooms, owner)
- Add rental registration data if exists
- Add presale inspection data if exists
- Add vacancy data if exists
- Add DLBA ownership status if parcel is DLBA-owned
- Keep the motivated seller signals logic but enhance with new data

### 2. `api/search.js` — Full-text search across all datasets
- Search investors, properties, contractors, neighborhoods via Supabase
- Use `ilike` for text search across address, name fields
- Support `?q=search_term&type=all|property|investor|contractor|neighborhood`

### 3. `api/chat.js` — AI-powered data queries
- Replace all local JSON data loading with Supabase queries
- The AI should generate Supabase queries to answer questions
- Use Anthropic Claude Haiku (claude-3-5-haiku-20241022) for fast, cheap classification
- Keep existing chat logic but swap data source
- When user asks about an address, query all tables
- When user asks about a neighborhood, aggregate from all tables
- When user asks about an investor/buyer, search sales.grantee

### 4. `api/sales.js` — Property sales with pagination
- Query `sales` table directly with filters (neighborhood, date range, price range)
- Support pagination via Supabase .range()
- Support bounds filtering for map view

### 5. `api/investors.js` — Top buyers aggregated from sales
- Query: `SELECT grantee, count(*), sum(sale_price), avg(sale_price), min(sale_date), max(sale_date) FROM sales GROUP BY grantee ORDER BY count DESC`
- Support filtering by neighborhood, date range

### 6. `api/investor/[name].js` — Individual investor detail
- Query all sales where grantee matches
- Show neighborhoods, timeline, properties

### 7. `api/neighborhoods.js` — Neighborhood scores
- Aggregate across ALL tables per neighborhood
- Score = weighted combo of sales activity, permits, low blight, assessment growth, rental registrations

### 8. `api/neighborhood/[name].js` — Neighborhood detail
- Query all tables filtered by neighborhood
- Return sales, permits, blight, assessment stats, top investors, etc.

### 9. `api/contractors.js` — Contractor rankings
- Aggregate from permits + trades tables
- Group by contractor_name

### 10. `api/contractor/[name].js` — Contractor detail
- All permits/trades for that contractor

### 11. `api/sources.js` — Data sources page
- Update to show Supabase table counts (live query)
- Show last refresh date
- Remove references to local JSON files

### 12. `api/stats.js` — Dashboard stats
- Live counts from Supabase

### 13. `api/map-tiles.js` — Map data
- Query Supabase with bounding box for markers
- Return lat/lng + type for each record in viewport
- Limit to prevent returning too many points (cluster or sample)

### 14. `api/loans.js` and `api/lending.js` — Keep existing but verify they work

## Environment Variables (already in .env.local)
```
SUPABASE_URL=https://vgtwkgckvryxbgujnqro.supabase.co
SUPABASE_ANON_KEY=sb_publishable_Pg-Yg38bpP3BlW2IIt5ldw_Y_148pyt
SUPABASE_SERVICE_KEY=<your-service-key>
```

## Key Principles
1. **No local JSON files for data** — everything from Supabase
2. **Pagination everywhere** — never return >1000 rows
3. **Use Supabase RPC for complex aggregations** if needed
4. **Error handling** — graceful fallback if Supabase is down
5. **Keep CORS and existing helper patterns**
6. **Response format should be backward-compatible** so the frontend doesn't break

## Do NOT Change
- Frontend HTML/CSS/JS (just the API layer)
- The `_helpers.js` utility functions (add to them if needed)
- The loans/lending endpoints (they already work)
- The feedback endpoint

## Testing
After refactoring, verify:
1. `GET /api/property/2408%20PENNSYLVANIA` returns data from all tables
2. `GET /api/search?q=framework` returns matching results
3. `GET /api/neighborhoods` returns aggregated scores
4. `GET /api/sources` shows live Supabase counts
5. `GET /api/stats` shows total records
