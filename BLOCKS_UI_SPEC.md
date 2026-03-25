# Blocks Tab — Frontend Implementation Spec

Build a new "Blocks" tab for block-by-block street analysis. Model after the existing Neighborhoods (Areas) tab pattern.

## APIs Available

### `GET /api/blocks?key=frameworkai`
Search and rank blocks. Returns paginated results.
- `search` — street name (partial match)
- `neighborhood` — filter by neighborhood
- `zip` — filter by zip code
- `min_sales` — minimum total sales
- `sort` — `recent_sales|total_sales|avg_price|block_score` (default: recent_sales)
- `order` — `asc|desc` (default: desc)
- `page`, `limit` (default 20, max 100)

Response shape:
```json
{
  "data": [{
    "street_id": 3343,
    "street_name": "MARLOWE",
    "full_street_name": "Marlowe St",
    "from_addr_left": 19901,
    "to_addr_left": 20099,
    "center_lat": 42.436,
    "center_lng": -83.191,
    "neighborhood": "Schaefer 7/8 Lodge",
    "zip_code": "48235",
    "address_count": 38,
    "total_sales": 56,
    "recent_sales": 3,
    "avg_price": 65884,
    "recent_avg_price": 85000,
    "total_blight": 0,
    "unique_buyers": 48,
    "llc_buyers": 5,
    "block_score": 85.2
  }],
  "meta": { "page": 1, "limit": 20, "total": 35, "pages": 2 }
}
```

### `GET /api/block/:street_id?key=frameworkai`
Full block profile with all data.

Response shape:
```json
{
  "data": {
    "street": { "street_id": 3343, "street_name": "MARLOWE", "full_street_name": "Marlowe St", ... },
    "score": {
      "addresses": 38, "unique_parcels": 38,
      "neighborhoods": ["Schaefer 7/8 Lodge"], "zip_codes": ["48235"],
      "total_sales": 56, "recent_sales_12mo": 3, "arms_length_sales": 20,
      "avg_sale_price": 65884, "median_sale_price": 55000,
      "avg_al_price": 95000, "recent_avg_price": 85000,
      "unique_buyers": 48, "unique_sellers": 35, "llc_buyers": 5, "investor_pct": 10,
      "total_blight": 35, "recent_blight_12mo": 5,
      "total_permits": 4, "permit_investment": 15000
    },
    "addresses": [{ "address_id": 1, "parcel_id": "22040961.", "street_number": 19900, ... }],
    "sales": [{ "sales_id": 1, "address": "19900 MARLOWE", "sale_date": "2024-01-15", "sale_price": 85000, ... }],
    "blight": [{ "ticket_id": "...", "violation_description": "...", ... }],
    "permits": [{ "permit_no": "...", "description": "...", ... }]
  }
}
```

## HTML Changes (public/index.html)

### 1. Add Blocks tab content panel
After the Neighborhoods tab content (`</div>` closing `tab-neighborhoods`), add:

```html
<!-- Blocks Tab -->
<div id="tab-blocks" class="tab-content">
  <div class="tab-panel">
    <div class="filter-bar">
      <input type="text" id="block-search" class="search-input" placeholder="Search streets...">
      <select id="block-neighborhood" class="filter-select">
        <option value="">All Neighborhoods</option>
      </select>
      <input type="text" id="block-zip" class="filter-input" placeholder="ZIP" style="width:80px;">
      <div class="filter-group">
        <label class="filter-label">Min Sales</label>
        <input type="number" id="block-min-sales" class="filter-input" value="1" min="0" style="width:70px;">
      </div>
      <select id="block-sort" class="filter-select">
        <option value="recent_sales">Recent Sales</option>
        <option value="total_sales">Total Sales</option>
        <option value="avg_price">Avg Price</option>
        <option value="block_score">Block Score</option>
      </select>
    </div>
    <div id="blocks-list" class="card-list">
      <div class="loading-state">
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
        <div class="skeleton-card"></div>
      </div>
    </div>
    <div id="blocks-pagination" class="pagination"></div>
  </div>
</div>
```

### 2. Add tab button in nav
After the Areas tab button, add:
```html
<button class="tab-btn" data-tab="blocks" aria-label="Blocks">
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
    <line x1="3" y1="9" x2="21" y2="9"></line>
    <line x1="9" y1="21" x2="9" y2="9"></line>
  </svg>
  <span>Blocks</span>
</button>
```

### 3. Add script tag
Before `</body>`:
```html
<script src="/js/blocks.js"></script>
```

## JavaScript (public/js/blocks.js)

Create `BlocksModule` following the same pattern as `NeighborhoodsModule`:

### List View
- On init: load blocks from `/api/blocks` with default params
- Search input: debounced 300ms, calls loadBlocks()
- Filters change: calls loadBlocks()
- Render each block as a card showing:
  - Street name + address range (e.g. "Marlowe St (19901-20099)")
  - Neighborhood + ZIP
  - Key metrics in a grid: Recent Sales, Total Sales, Avg Price, Block Score
  - Pill badges for neighborhood
  - Click → detail view

### Detail View
- Call `/api/block/:street_id`
- Show header with street name, address range, neighborhood, zip
- Score summary cards row (like investor profile):
  - Addresses, Total Sales, Recent Sales, Avg Price, Investor %, Blight Count
- Map showing all address points on the block (use Leaflet, same pattern as investor detail map)
  - Green dots for addresses with recent sales
  - Gray dots for other addresses
- Sales History table (paginated, showing date, address, price, buyer, seller, terms)
- Blight section (collapsible, last 20 tickets)
- Permits section (collapsible, last 20)
- Back button → returns to list view

### Pagination
Same pattern as investors — show "1-20 of 1,234" with prev/next buttons.

## CSS additions (public/css/style.css)

Use existing styles. The block cards should use the `.card-list` pattern.
Add if needed:
```css
.block-score-badge {
  background: var(--accent);
  color: white;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
  font-weight: 700;
}
.block-metrics {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 8px;
}
.block-metric {
  text-align: center;
  padding: 8px;
  background: var(--bg);
  border-radius: 6px;
}
.block-metric .metric-value {
  font-size: 18px;
  font-weight: 700;
  color: var(--text);
}
.block-metric .metric-label {
  font-size: 11px;
  color: var(--muted);
  margin-top: 2px;
}
```

## Key Constraints
- All API calls must include the `key` parameter (already handled by `App.api()`)
- Use `App.formatNumber()`, `App.formatCurrency()`, `App.formatDate()`, `App.escapeHtml()` 
- Mobile-first: metrics grid should be 2 columns on mobile, 4 on desktop
- Dark theme — use CSS variables (--bg, --surface, --text, --muted, --accent, --border)
- The block detail map should use the same dark basemap tiles as the main map
- Remember to register the module in app.js `initTabModule` function

## After Implementation
```bash
cd /Users/agent-x/Projects/detroit-data-intel-v2
git add -A
git commit -m "Add Blocks tab — block-by-block street analysis with scores, maps, sales/blight/permit detail"
npx vercel --token "$VERCEL_TOKEN" --yes --prod
```

When finished:
```
openclaw system event --text "Done: Blocks tab frontend built and deployed" --mode now
```
