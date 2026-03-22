# Detroit Data Intelligence Platform V2
## Capabilities Overview

**URL:** https://detroit-data-intel-v2.vercel.app  
**Built by:** Framework Real Estate Solutions  
**Last Updated:** March 20, 2026

---

## Database: 2,058,396 Records Across 12 Tables

| Dataset | Records | Source |
|---|---|---|
| Property Sales | 505,852 | data.detroitmi.gov |
| Blight Tickets | 872,697 | data.detroitmi.gov |
| Assessment Roll 2026 | 388,147 | data.detroitmi.gov |
| Trades (Mechanical/Electrical/Plumbing) | 112,096 | data.detroitmi.gov |
| DLBA Owned Properties | 59,310 | data.detroitmi.gov |
| Building Permits | 43,830 | data.detroitmi.gov |
| Rental Registrations | 38,179 | data.detroitmi.gov |
| Demolitions | 16,089 | data.detroitmi.gov |
| Presale Inspections | 15,060 | data.detroitmi.gov |
| DLBA Auction Sales | 5,418 | data.detroitmi.gov |
| Vacant Properties | 1,417 | data.detroitmi.gov |
| Contractor Directory | 301 | Built from trades/permits |

All data sourced from Detroit's open data portal and loaded into Supabase PostgreSQL with full-text search indexes.

---

## Interactive Map — 11 Data Layers

Toggle any combination of layers with time filtering:

| Layer | Color | Records | Description |
|---|---|---|---|
| Sales | Blue | 505K | All property transactions since 2011 |
| Permits | Green | 43K | Building permits with contractor, cost, description |
| Trades | Purple | 112K | Mechanical, electrical, plumbing permits |
| Blight | Red | 872K | Code violation tickets with fines and disposition |
| DLBA | Amber | 59K | Detroit Land Bank Authority owned properties |
| Demos | Gray | 16K | Demolition permits |
| Rentals | Cyan | 38K | Registered rental properties |
| Crime | Dark Red | — | Incident data (2024-2026) |
| Vacant | Orange | 1.4K | Vacant property registry |
| New Builds | Light Cyan | — | New construction permits |
| Foreclosures | Rose | 33K+ | Foreclosure sales + bank REO dispositions |

### Map Features

- **Time Range Filter:** 6 months, 1 year, 2 years, 5 years, or all time
- **Address Search Bar:** Type any Detroit address to zoom in (geocodes from our sales database with Nominatim fallback)
- **Heatmap Mode:** Toggle between cluster markers and density heatmap visualization
- **Multi-Item Popups:** When multiple records share an address, clicking shows a scrollable list of all items
- **Rich Popups:** Full record detail per layer — prices, dates, parties, permit info, violations

---

## Investors Tab — 245,127 Unique Buyers

Track every property buyer in Detroit's sales history.

### List View
- **Excel-style filtering:** Sort by total purchases, total spend, average price, recency
- **Date range filter:** Isolate investors active in specific time periods
- **Min/max purchase count:** Find everyone from 2-property flippers to institutional buyers
- **Paginated** with full-text search across all 245K investors

### Investor Detail (click any investor)
- **Profile Summary:** Total purchases, total spend, sales count, revenue, flip count, neighborhoods active
- **Map View:** Green dots = purchases, blue dots = sales — see their geographic strategy
- **Flip Detection:** Automatically matches buy→sell on same address, calculates profit and hold time
- **Neighborhood Breakdown:** Where they concentrate purchases
- **Deed Type Analysis:** Arms-length vs foreclosure vs government vs family transfers
- **Full Transaction History:** Paginated purchase and sale records with complete detail

### Example: Hantz Woodlands LLC
- 1,692 purchases across Detroit
- 150 sales, 59 detected flips
- Top flip: Fischer St — $891K profit
- Primary strategy: Bulk vacant lot acquisition from city ($0 purchases)

---

## Areas Tab — 203 Neighborhoods Scored

Every Detroit neighborhood analyzed and ranked.

### Scoring System
- **Opportunity Score** based on weighted factors (user-adjustable):
  - Sales Volume (default 25%)
  - Median Sale Price (default 25%)
  - Permit Activity (default 20%)
  - Blight Rate — inverse (default 15%)
  - Rental Density (default 10%)
  - Demolition Rate — inverse (default 5%)
- **Score Weight Toggles:** Adjust weights to match your investment strategy
- **Time Range Filter:** Score based on last year vs all time

### Neighborhood Detail
- Overview with recent sales, permit activity, top contractors, blight summary
- Drill into Sales, Permits, Blight, Trades sections (all paginated)
- Cross-link to contractor detail for any active contractor in the area

---

## Contractors Tab — 301 Contractors

Full directory of contractors active in Detroit, built from permit and trade data.

### Search
- **PostgreSQL Full-Text Search** with weighted ranking (name > specialty > description > neighborhood)
- Filter by specialty, zip code, proximity
- 124 contractors with verified phone numbers
- 81 with verified websites

### Specialties Covered
- HVAC/Heating
- Electrical
- Plumbing
- Roofing
- Foundation/Structural
- Solar/Energy
- General Construction
- Fire Protection
- Elevator

### Contractor Detail
- **Map View:** All permit locations plotted — see exactly where they work
- Permit history with dates, descriptions, costs
- Neighborhoods served and zip code coverage
- Contact info: phone, website, business address

---

## AI Chat — Claude Sonnet Powered

Natural language queries across all 2M+ records.

### Query Types Supported
- **Contractor Search:** "Find a plumber near 48214" → returns ranked contractors with contact info
- **Investor Queries:** "Who are the top buyers in Corktown?" → returns investors sorted by activity
- **Neighborhood Analysis:** "What neighborhoods are growing?" → compares 6-month windows
- **Address Lookup:** "2404 Pennsylvania" → full property profile across all datasets
- **Growth Analysis:** "Compare East Village to Corktown" → side-by-side metrics
- **Custom Queries:** Complex questions routed to Claude Sonnet for intelligent analysis

### How It Works
1. Keyword-first classification for fast common queries
2. AI fallback (Claude Sonnet) for complex/ambiguous questions
3. Executes against live Supabase data
4. Returns formatted analysis with source data

---

## Additional Capabilities

### Lending Tab
- HMDA mortgage data analysis
- Lender activity tracking
- Loan type classification (conventional, FHA, VA, etc.)

### Pipeline Tab
- Motivated seller scoring algorithm
- Identifies properties with distress signals
- Ranks by likelihood of discounted sale

### Sources Tab
- Data provenance for every table
- Row counts and freshness indicators
- Download methodology documentation

### Feedback System
- In-app feedback button on every page
- Persisted to Supabase for tracking
- Categorized by page and type (bug/feature)

---

## Infrastructure

| Component | Details |
|---|---|
| Database | Supabase PostgreSQL (Pro tier, 2M+ rows) |
| Hosting | Vercel (serverless functions + static) |
| AI Model | Claude Sonnet (claude-sonnet-4-20250514) |
| API Endpoints | 30+ serverless functions |
| Search | PostgreSQL Full-Text Search with weighted tsvector |
| Caching | Vercel Edge (5-min TTL on heavy endpoints) |
| Health Monitoring | 16 automated checks, weekly cron |
| Data Refresh | Monthly automated pipeline (1st of each month) |

---

## Investment Signal Layers

The platform enables multiple investment strategies:

### 1. Follow Smart Money
Track what institutional investors are buying. Filter by purchase count, date range, and neighborhood to identify where experienced buyers are concentrating.

### 2. Pre-REO Pipeline
Cross-reference assessment roll owners (bank names) with foreclosure sales to identify bank-owned properties before they hit MLS. Currently 440+ bank-owned properties identified.

### 3. Neighborhood Momentum
Use the Areas tab with time filtering to spot neighborhoods with rising sales volume, increasing median prices, and growing permit activity.

### 4. New Construction Signals
The New Builds map layer shows where developers are pulling construction permits — a leading indicator of neighborhood investment.

### 5. Distress Signals
Combine blight tickets, foreclosures, and demolitions to identify areas with motivated sellers and below-market opportunities.

### 6. Contractor Intelligence
Find vetted contractors by specialty and location, verified against actual permit history in Detroit.

---

*Detroit Data Intelligence Platform V2 — Built on 2M+ public records from data.detroitmi.gov*  
*Framework Real Estate Solutions © 2026*
