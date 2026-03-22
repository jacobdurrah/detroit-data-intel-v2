# Feedback Round 2 — Implementation Spec

Execute ALL items below. This is bugs + UX improvements from user feedback.

## Supabase Connection
- URL: https://vgtwkgckvryxbgujnqro.supabase.co
- Anon Key: sb_publishable_Pg-Yg38bpP3BlW2IIt5ldw_Y_148pyt
- Client: `api/_supabase.js`

## Architecture Notes
- Vanilla JS frontend, no framework
- Vercel serverless API endpoints in `api/`
- Leaflet for maps (already loaded globally)
- L.markerClusterGroup for clustering (already loaded)
- Need to add leaflet-heat plugin for heatmap mode

---

## BUG FIX #1: Areas section tabs not loading data (Feedback #11)

**File:** `api/neighborhoods.js`

**Problem:** The API ignores the `section` query parameter. When the frontend calls `/api/neighborhood/Corktown?section=sales&page=1&limit=20`, it returns the full overview instead of paginated section records.

**Fix:** Check for `section` query param. When present, return ONLY that section's data with pagination:

```javascript
if (section && section !== 'overview') {
  // Query just that table for this neighborhood with pagination
  const offset = (page - 1) * limit;
  let query, countQuery;
  
  if (section === 'sales') {
    query = supabase.from('sales').select('*').ilike('neighborhood', `%${name}%`).order('sale_date', {ascending: false}).range(offset, offset + limit - 1);
    countQuery = supabase.from('sales').select('*', {count: 'exact', head: true}).ilike('neighborhood', `%${name}%`);
  } else if (section === 'permits') {
    // similar for permits table
  } else if (section === 'blight') {
    // similar for blight table  
  } else if (section === 'trades') {
    // similar for trades table
  }
  
  const [{data: records}, {count: total}] = await Promise.all([query, countQuery]);
  
  return sendJson(res, {
    data: { records: records.map(r => formatRecord(r, section)) },
    meta: { section, page, limit, total, pages: Math.ceil(total / limit) }
  });
}
```

Map records to the slim format the frontend expects:
- sales: `{addr, dt, pr, gr, ge, tos, si, pcd, nb, pid, zip}`
- permits: `{id, addr, dt, type, desc, cost, cur, prop, zoning}`
- blight: `{id, addr, dt, desc, disp, fine}`
- trades: `{id, addr, dt, type, desc, own, biz, con}`

---

## BUG FIX #2: Contractor map points not showing (Feedback #12)

**File:** `public/js/contractors.js`, and possibly `api/find-contractor.js` or a new endpoint

**Problem:** The contractor detail doesn't include lat/lng for permit locations. The `contractor_directory` table has neighborhoods and zip codes but no individual permit coordinates.

**Fix:** When showing a contractor's map, query the TRADES table (or PERMITS table) for that contractor's permits, which DO have lat/lng:

In `contractors.js`, when building the map:
```javascript
// Fetch contractor's permit locations
const tradesData = await App.api('map-tiles', {
  layer: 'trades', 
  bounds: '42.2,-83.3,42.5,-82.9', // full Detroit bounds
  limit: 500
});
// Filter to this contractor's permits
const contractorPoints = tradesData.filter(t => 
  t.contractor && t.contractor.toLowerCase().includes(contractorName.toLowerCase())
);
```

OR better — add a dedicated endpoint parameter. Actually the simplest fix: query trades + permits tables directly filtered by contractor name.

Add to the contractor detail rendering in `contractors.js`:
```javascript
// Fetch permit locations for map
const permitLocations = await App.api('contractor-permits', { name: contractorName });
```

Create `api/contractor-permits.js`:
```javascript
// Returns trades + permits for a specific contractor with lat/lng
const trades = await supabase.from('trades')
  .select('permit_no, address, permit_type, permit_issued, description, latitude, longitude, neighborhood')
  .ilike('contractor_name', `%${name}%`)
  .not('latitude', 'is', null)
  .order('permit_issued', {ascending: false})
  .limit(200);

const permits = await supabase.from('permits')
  .select('permit_no, address, permit_type, permit_issued, description, estimated_cost, latitude, longitude, neighborhood')
  .ilike('contractor_name', `%${name}%`)
  .not('latitude', 'is', null)
  .order('permit_issued', {ascending: false})
  .limit(200);
```

---

## BUG FIX #3: Investor map prices all wrong + missing popup detail (Feedback #14)

**File:** `api/investor/[name].js`, `public/js/investors.js`

**Problem:** Investor purchases show `pr=0` for most records. The sale_price field mapping is broken.

**Root cause:** The investor detail API likely uses abbreviated field names and maps `sale_price` → `pr`, but some records have `amt_sale_price` as the column name in the DB.

**Fix in `api/investor/[name].js`:**
Check the actual column name in the sales table. The column is `sale_price` (verified in previous queries). Make sure the select includes it and the mapping works:

```javascript
.select('sales_id, address, sale_price, sale_date, grantee, grantor, terms_of_sale, sale_instrument, property_class_description, neighborhood, parcel_id, zip_code, latitude, longitude')
```

Map to:
```javascript
{
  id: s.sales_id, addr: s.address, pr: s.sale_price,
  dt: s.sale_date, ge: s.grantee, gr: s.grantor,
  tos: s.terms_of_sale, si: s.sale_instrument,
  pcd: s.property_class_description, nb: s.neighborhood,
  pid: s.parcel_id, zip: s.zip_code,
  lat: s.latitude, lng: s.longitude
}
```

**Fix in `public/js/investors.js` — map popup:**
When rendering map markers, the popup should show ALL fields:
```javascript
var popup = '<div class="popup-content">';
popup += '<div class="popup-address">' + App.escapeHtml(record.addr || '') + '</div>';
popup += '<div class="popup-fields">';
popup += '<div class="popup-field"><span class="popup-label">Price</span><span class="popup-value">' + App.formatCurrencyFull(record.pr) + '</span></div>';
popup += '<div class="popup-field"><span class="popup-label">Date</span><span class="popup-value">' + App.formatDate(record.dt) + '</span></div>';
popup += '<div class="popup-field"><span class="popup-label">Seller</span><span class="popup-value">' + App.escapeHtml(record.gr || '') + '</span></div>';
popup += '<div class="popup-field"><span class="popup-label">Buyer</span><span class="popup-value">' + App.escapeHtml(record.ge || '') + '</span></div>';
popup += '<div class="popup-field"><span class="popup-label">Terms</span><span class="popup-value">' + App.escapeHtml(record.tos || '') + '</span></div>';
popup += '<div class="popup-field"><span class="popup-label">Parcel</span><span class="popup-value">' + App.escapeHtml(record.pid || '') + '</span></div>';
popup += '</div></div>';
```

---

## FEATURE #4: Remove investor tiers, Excel-style filtering (Feedback #13)

**File:** `public/js/investors.js`, `public/index.html`

**Changes:**
- Remove the tier dropdown from the filter bar
- Replace with:
  - **Date range**: two date inputs (from/to) filtering by last_purchase date
  - **Min purchases**: number input (default 1) — replaces tier logic
  - **Max purchases**: number input (optional)
- Remove tier badges from cards and table rows
- Add sortable column headers on desktop (click to sort asc/desc)
- Show "1-20 of 71,021" in pagination area
- Pass date_from, date_to, min_purchases, max_purchases to the API

**API changes (`api/investors.js`):**
- Accept `date_from`, `date_to`, `min_purchases`, `max_purchases` params
- Apply to the RPC call or post-filter

---

## FEATURE #5: Map address search bar (Feedback #17)

**File:** `public/js/map.js`, `public/index.html`, `public/css/style.css`

**Add a search bar above the map:**
```html
<div class="map-search">
  <input type="text" id="map-search-input" placeholder="Search address..." class="search-input">
  <button id="map-search-btn">🔍</button>
</div>
```

**Geocoding logic in map.js:**
First, search our own sales table (fastest, most relevant):
```javascript
const data = await App.api('map-tiles', { layer: 'sales', bounds: fullDetroitBounds, limit: 1, search: address });
```

Or better — create a simple geocode endpoint that queries the sales table:
```javascript
// api/geocode.js
const { data } = await supabase.from('sales')
  .select('address, latitude, longitude')
  .ilike('address', `%${query}%`)
  .not('latitude', 'is', null)
  .limit(1);
```

If found, `map.setView([lat, lng], 17)` and add a highlighted marker.

If not found, fall back to Nominatim: `https://nominatim.openstreetmap.org/search?q=${address}+Detroit+MI&format=json`

**CSS:**
```css
.map-search {
  position: absolute;
  top: 10px;
  left: 10px;
  z-index: 800;
  display: flex;
  gap: 4px;
}
.map-search input {
  width: 240px;
  height: 40px;
  padding: 0 12px;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text);
  font-size: 14px;
}
.map-search button {
  width: 40px;
  height: 40px;
  background: var(--accent);
  border: none;
  border-radius: var(--radius-sm);
  color: white;
  cursor: pointer;
  font-size: 16px;
}
```

---

## FEATURE #6: Heatmap/density mode for map (Feedback #9, #10)

**File:** `public/js/map.js`, `public/index.html`

**Add leaflet-heat plugin:**
In index.html, add before map.js:
```html
<script src="https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js"></script>
```

**Add toggle button in the layer panel:**
```html
<div class="view-toggle" style="margin-top:8px;">
  <button class="toggle-btn active" id="map-mode-cluster">Clusters</button>
  <button class="toggle-btn" id="map-mode-heat">Heatmap</button>
</div>
```

**In map.js:**
- Track `mapMode = 'cluster' | 'heat'`
- When `heat`: instead of marker clusters, create `L.heatLayer(points, { radius: 25, blur: 15, maxZoom: 15, gradient: {0.4: 'blue', 0.6: 'lime', 0.8: 'orange', 1.0: 'red'} })`
- When switching modes, remove all cluster groups and add heat layer (or vice versa)
- For "all time" with heat mode, increase the point limit to 10000 (heatmap handles density better than clusters)

---

## FEATURE #7: Multi-item popup at same coordinates (Feedback #15/16)

**File:** `public/js/map.js`

The marker cluster plugin already has `spiderfyOnMaxZoom` enabled. But at lower zoom levels, clicking a cluster just zooms in.

**Better solution:** When a cluster is clicked and it contains items at the exact same coordinates (can't spiderfy), show a scrollable popup listing all items:

```javascript
cluster.on('clusterclick', function(e) {
  var markers = e.layer.getAllChildMarkers();
  // Check if all markers are at same location
  var allSame = markers.every(m => 
    m.getLatLng().lat === markers[0].getLatLng().lat && 
    m.getLatLng().lng === markers[0].getLatLng().lng
  );
  if (allSame && markers.length <= 20) {
    // Build combined popup
    var html = '<div style="max-height:300px;overflow-y:auto;">';
    markers.forEach(m => { html += m.getPopup().getContent(); html += '<hr>'; });
    html += '</div>';
    L.popup().setLatLng(e.latlng).setContent(html).openOn(map);
  }
});
```

---

## DEPLOYMENT

After all changes:
```bash
cd /Users/agent-x/Projects/detroit-data-intel-v2
git add -A
git commit -m "Feedback round 2: fix areas/contractor/investor bugs, add Excel filtering, map search, heatmap, multi-popup"
npx vercel --token $VERCEL_TOKEN --yes --prod
```

When completely finished, run:
```
openclaw system event --text "Done: Feedback round 2 — fixed 3 bugs (areas tabs, contractor map, investor map prices), added Excel-style investor filtering, map address search, heatmap mode, multi-item popups" --mode now
```
