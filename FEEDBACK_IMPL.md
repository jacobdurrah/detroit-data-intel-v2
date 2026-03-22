# Feedback Implementation Plan

Execute ALL 7 items below. Each section has exact file paths, what to change, and expected behavior.

## Project Structure
- `public/css/style.css` — all styles
- `public/index.html` — main HTML shell with tab content areas
- `public/js/app.js` — shared utilities (App.api, App.switchTab, etc.)
- `public/js/investors.js` — InvestorsModule
- `public/js/map.js` — MapModule
- `public/js/neighborhoods.js` — NeighborhoodsModule
- `public/js/contractors.js` — ContractorsModule
- API endpoints in `api/` directory (Vercel serverless functions)

## Supabase Connection
- URL: https://vgtwkgckvryxbgujnqro.supabase.co
- Anon Key: sb_publishable_Pg-Yg38bpP3BlW2IIt5ldw_Y_148pyt
- Client: `api/_supabase.js` already configured

---

## 1. DESKTOP LAYOUT FIX (Bug — Priority 1)

**Problem:** Investor page doesn't fill screen on desktop. Data table shows in a small portion.

**Files:** `public/css/style.css`, `public/js/investors.js`

**CSS Changes in style.css:**
- The `.data-table-wrap` has `display: none` by default and only shows on 1024px+ with `.table-mode`. But the investor table is rendered inline with `style="display:block"` which overrides.
- The real issue: the table container doesn't get full width/height on desktop.
- Fix the `@media (min-width: 1024px)` section:
  - `.tab-content.active` should use `display: flex; flex-direction: column; height: 100%;`
  - `.tab-panel` should have `flex: 1; min-height: 0;`
  - `.data-table-wrap` on desktop should be `flex: 1; min-height: 0;`
  - The investor card list on desktop should also have full width
  - Remove any max-width constraints from `.detail-view` on desktop

**JS Changes in investors.js:**
- In `renderTable()`, ensure the table wrapper fills the available space
- The container should scroll independently

**Expected result:** On desktop (>1024px), the investor table fills the full viewport width between stats bar and tab bar.

---

## 2. INVESTOR PAGE CACHING (Quick Win — Priority 2)

**Files:** `api/investors.js`

**Changes:**
- Add `Cache-Control: public, s-maxage=300, stale-while-revalidate=600` header to the response
- This caches the response at Vercel's edge for 5 minutes
- Apply only to the default first-page request (no search term, default sort)

**Expected result:** First page load of investors is instant after initial cache population.

---

## 3. ALL-INVESTORS SORTABLE VIEW (Feature — Priority 3)

This already exists! The current investor list IS paginated and sortable. But ensure:

**Files:** `public/js/investors.js`, `public/index.html`

**Changes:**
- Add sort options if not present: "Total Purchases", "Total Spend", "Average Price", "Most Recent", "Most Neighborhoods"
- Verify the sort dropdown works on both mobile cards and desktop table views
- Make sure pagination shows total count ("Showing 1-20 of 71,021")

---

## 4. INVESTOR DETAIL MAP VIEW (Feature — Priority 4)

**Files:** `public/js/investors.js`, `public/css/style.css`

**Changes to investors.js:**
- In `renderInvestorDetail()`, add a "Map View" / "List View" toggle above the purchases/sales section
- When "Map View" is selected:
  - Create a Leaflet map div (id="investor-detail-map", height 400px)
  - Plot ALL purchase records as GREEN circle markers
  - Plot ALL sale records as BLUE circle markers
  - Use `L.featureGroup()` to fit bounds
  - Each marker gets a popup with address, price, date
  - Add a simple legend: 🟢 Purchase / 🔵 Sale
- The map uses the same Leaflet + CartoDB dark tiles already loaded
- Purchases have `lat` and `lng` fields from the sales table

**CSS additions:**
```css
#investor-detail-map {
  width: 100%;
  height: 400px;
  border-radius: 10px;
  border: 1px solid var(--border);
  margin: 12px 0;
}
.map-legend {
  display: flex;
  gap: 16px;
  padding: 8px 12px;
  font-size: 13px;
  color: var(--text-muted);
}
.legend-item {
  display: flex;
  align-items: center;
  gap: 6px;
}
.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}
```

**Data:** The investor detail API (`api/investor/[name].js`) already returns purchases and sales with lat/lng. If some records don't have coords, just skip them on the map.

---

## 5. MAP TIME RANGE FILTER (Feature — Priority 5)

**Problem:** Map has layer toggles already but no time filtering. User wants to see "all sales in the last year" or "permits in the last 2 years".

**Files:** `public/js/map.js`, `public/index.html`, `public/css/style.css`, `api/map-tiles.js`

**Frontend changes (map.js):**
- Add a time range selector to the layer panel (below the layer checkboxes):
  ```html
  <div class="time-filter">
    <label>Time Range</label>
    <select id="map-time-range">
      <option value="all">All Time</option>
      <option value="6m">Last 6 Months</option>
      <option value="1y" selected>Last Year</option>
      <option value="2y">Last 2 Years</option>
      <option value="5y">Last 5 Years</option>
    </select>
  </div>
  ```
- When time range changes, reload all active layers with the time parameter
- Pass `time_range` parameter to the API calls: `App.api('map-tiles', { layer, bounds, zoom, time_range })`

**Backend changes (api/map-tiles.js):**
- Accept `time_range` query parameter
- Convert to date filter:
  - `6m` → last 6 months
  - `1y` → last 12 months
  - `2y` → last 24 months
  - `5y` → last 60 months
  - `all` → no date filter
- Apply to the date column for each table:
  - sales: `sale_date`
  - permits: `permit_issued`
  - trades: `permit_issued`
  - blight: `ticket_issued_date`
  - demos: `permit_issued`
  - dlba: no date (show all)
  - rentals: no date (show all)
  - crime: `incident_timestamp`

**CSS additions:**
```css
.time-filter {
  padding: 8px;
  border-top: 1px solid var(--border);
  margin-top: 4px;
}
.time-filter label {
  display: block;
  font-size: 11px;
  color: var(--text-muted);
  margin-bottom: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.time-filter select {
  width: 100%;
  padding: 6px 8px;
  background: var(--input-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 13px;
}
```

---

## 6. CONTRACTOR DETAIL MAP VIEW (Feature — Priority 6)

**Files:** `public/js/contractors.js`

**Changes:**
- Same pattern as investor map (#4 above)
- In the contractor detail view, add a map showing all permit locations
- Use CYAN color for permit markers (matches contractor theme)
- Each marker popup shows: address, permit type, date, description
- Contractor permits have lat/lng in the trades/permits tables

**Note:** The contractor detail already loads permit records. Just need to plot them on a map.

---

## 7. AREAS PAGE OVERHAUL (Feature — Priority 7)

**Files:** `public/js/neighborhoods.js`, `api/neighborhoods.js`, `public/index.html`, `public/css/style.css`

**Problem:** Many neighborhoods show 0 sales. Score is opaque. No time filtering.

### Frontend Changes (neighborhoods.js):

**A. Add time range filter:**
```html
<select id="neighborhood-time-range">
  <option value="all">All Time</option>
  <option value="1y" selected>Last Year</option>
  <option value="2y">Last 2 Years</option>
</select>
```
Pass `time_range` to the API.

**B. Add score weight toggles:**
- Below the filter bar, add a collapsible "Score Weights" panel
- Sliders or checkboxes for each factor:
  - Sales Volume (0-100, default 25)
  - Median Price (0-100, default 25)
  - Permit Activity (0-100, default 20)
  - Blight (inverse — more blight = lower score) (0-100, default 15)
  - Rentals (0-100, default 10)
  - Demos (inverse) (0-100, default 5)
- When weights change, recalculate scores client-side from the raw data
- Show which factors contribute to the score as a breakdown bar under each neighborhood card

**C. Filter out empty neighborhoods:**
- Don't show neighborhoods with < 5 total data points (sales + permits + blight)
- Add a "Show empty" toggle to override

### Backend Changes (api/neighborhoods.js):

**A. Accept `time_range` parameter**
- Filter queries to only include data within the time range
- Return raw component values (not just pre-computed score) so client can reweight:
  ```json
  {
    "name": "Corktown",
    "sales_count": 45,
    "median_price": 125000,
    "permits_count": 23,
    "blight_count": 12,
    "rentals_count": 8,
    "demos_count": 2,
    "score": 72,
    "score_components": {
      "sales_volume_pct": 0.85,
      "median_price_pct": 0.72,
      "permit_activity_pct": 0.65,
      "blight_pct": 0.30,
      "rental_pct": 0.45,
      "demo_pct": 0.10
    }
  }
  ```

**B. Return percentile-based components**
- For each metric, calculate where each neighborhood ranks as a percentile (0-1)
- Client multiplies percentile × user weight to get final score

---

## DEPLOYMENT

After all changes:
```bash
cd /Users/agent-x/Projects/detroit-data-intel-v2
git add -A
git commit -m "Implement all 7 feedback items: desktop layout, caching, investor/contractor maps, time filters, areas overhaul"
npx vercel --token $VERCEL_TOKEN --yes --prod
```

Verify at https://detroit-data-intel-v2.vercel.app
