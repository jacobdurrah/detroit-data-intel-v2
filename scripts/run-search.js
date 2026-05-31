/**
 * Daily Property Intelligence Report Generator
 * Fetches active MLS listings, filters through the dusty turnkey funnel,
 * enriches top picks with descriptions, grades each, stores as report.
 * 
 * Run: node scripts/run-search.js
 * Cron: daily at 7:30 AM ET
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://vgtwkgckvryxbgujnqro.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_KEY;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
// Use ET date so report date matches Jacob's local time
const TODAY = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/Detroit' })).toISOString().slice(0, 10);

/* ---- Persistent seen-addresses hash map ---- */
const SEEN_FILE = path.join(__dirname, '..', 'data', 'seen-addresses.json');

function loadSeenAddresses() {
  try {
    var raw = fs.readFileSync(SEEN_FILE, 'utf-8');
    var data = JSON.parse(raw);
    // Expire entries older than 30 days
    var cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    var fresh = {};
    Object.keys(data).forEach(addr => {
      if (data[addr] >= cutoff) fresh[addr] = data[addr];
    });
    return fresh;
  } catch (e) {
    return {};
  }
}

function saveSeenAddresses(map) {
  var dir = path.dirname(SEEN_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(SEEN_FILE, JSON.stringify(map, null, 0));
}

function v(obj) { return obj && typeof obj === 'object' && 'value' in obj ? obj.value : obj; }

/* ---- Strategy ---- */
const STRATEGY = {
  name: 'Dusty Turnkey',
  purchase_range: [50000, 120000],
  property_types: ['SFH', 'Duplex', 'Triplex', 'Quad'],
  ideal_layout: '3bd 1-2ba, plumbing on first floor, single story preferred',
  arv_target: 'Appreciation upside (ugly house on thriving block)',
  total_cash_in: '~$50K (down + polish + contingency)',
  refi_timeline: '6 months, min $30K cashout',
  required: 'Mechanicals + roof updated within 5 years',
};

/* ---- Target Neighborhoods ---- */
const TIER_1 = [
  { name: 'East English Village', zips: ['48224'], median: 192500 },
  { name: 'Islandview', zips: ['48207'], median: 162000 },
  { name: 'Grandmont-Rosedale', zips: ['48227', '48235', '48219'], median: 160000 },
  { name: 'Rosedale Park', zips: ['48223', '48219'], median: 204950 },
  { name: 'Bagley', zips: ['48221', '48235'], median: 215000 },
  { name: 'University District', zips: ['48221'], median: 180000 },
  { name: 'Sherwood Forest', zips: ['48221'], median: 220000 },
  { name: 'Martin Park', zips: ['48235'], median: 150000 },
  { name: 'Morningside', zips: ['48224'], median: 145000 },
  { name: 'Indian Village', zips: ['48207'], median: 250000 },
  { name: 'Boston-Edison', zips: ['48202'], median: 200000 },
  { name: 'West Village', zips: ['48207'], median: 180000 },
  { name: 'Finney', zips: ['48224', '48205'], median: 120000 },
];

const TIER_2 = [
  { name: 'Brightmoor (select blocks)', zips: ['48223'], median: 80000 },
  { name: 'Fitzgerald', zips: ['48235'], median: 100000 },
  { name: 'Core City', zips: ['48208'], median: 90000 },
  { name: 'North End', zips: ['48202'], median: 85000 },
  { name: 'Crary-St Marys', zips: ['48227'], median: 90000 },
  { name: 'Cerveny / NW Detroit', zips: ['48219', '48235'], median: 110000 },
  { name: 'Conner', zips: ['48215', '48213'], median: 95000 },
  { name: 'Greenfield-Grand River', zips: ['48227'], median: 100000 },
  { name: 'Corktown', zips: ['48216'], median: 180000 },
  { name: 'Woodbridge', zips: ['48208'], median: 120000 },
  { name: 'Bethune', zips: ['48227'], median: 85000 },
  { name: 'Grandmont', zips: ['48227', '48219'], median: 160000 },
];

const ALL_NEIGHBORHOODS = [...TIER_1, ...TIER_2];
const TARGET_ZIPS = new Set();
ALL_NEIGHBORHOODS.forEach(n => n.zips.forEach(z => TARGET_ZIPS.add(z)));

/* ---- Fetch active listings from Redfin ---- */

async function fetchRedfin() {
  console.log('Fetching active Detroit listings from Redfin...');
  var url = 'https://www.redfin.com/stingray/api/gis?al=1&market=michigan&num_homes=1000&region_id=5665&region_type=6&status=9&uipt=1,2,3,4&v=8';
  
  var res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      'Referer': 'https://www.redfin.com/city/5665/MI/Detroit',
    }
  });

  if (!res.ok) throw new Error('Redfin returned ' + res.status);
  var text = await res.text();
  if (text.startsWith('{}&&')) text = text.substring(4);
  if (text.includes('<!DOCTYPE')) throw new Error('Redfin CAPTCHA');
  
  var data = JSON.parse(text);
  var homes = (data.payload && data.payload.homes) || [];
  console.log('  Raw listings: ' + homes.length);
  
  var seen = {};
  var rows = [];
  
  homes.forEach(function(h) {
    var street = String(v(h.streetLine) || '');
    var city = h.city || 'Detroit';
    var state = h.state || 'MI';
    var zip = String(v(h.postalCode) || '').split(' ')[0];
    var addr = [street, city, state, zip].filter(Boolean).join(', ');
    if (!addr || addr.length < 10 || seen[addr]) return;
    seen[addr] = true;
    
    // Extract photo URL from the listing data
    var photoUrl = null;
    if (h.url) {
      // Use the thumbnail URL format that works
      var homeId = h.url.match(/home\/(\d+)/);
      if (homeId) {
        photoUrl = 'https://ssl.cdn-redfin.com/photo/' + (h.dataSourceId || '144') + '/bigphoto/' + 
          (homeId[1].slice(-3)) + '/genMid.' + homeId[1] + '_0.jpg';
      }
    }
    
    var listing = {
      address: addr,
      street: street,
      city: city,
      state: state,
      zip: zip,
      list_price: Number(v(h.price)) || null,
      beds: Number(v(h.beds)) || null,
      baths: Number(v(h.baths)) || null,
      sqft: Number(v(h.sqFt)) || null,
      year_built: Number(v(h.yearBuilt)) || null,
      lot_size: v(h.lotSize) ? Number(v(h.lotSize)) : null,
      listing_url: h.url ? 'https://www.redfin.com' + h.url : null,
      photo_url: photoUrl,
      neighborhood_redfin: v(h.location) || null,
      dom: Number(v(h.dom)) || null,
      property_type: v(h.uipt) || 'single_family',
      status_display: v(h.mlsStatus) || 'Active',
      price_per_sqft: null,
      mls_id: v(h.mlsId) || null,
      key_facts: (h.keyFacts || []).map(kf => (kf.label || '') + ': ' + (kf.value || '')).join('. '),
    };
    
    if (listing.list_price && listing.sqft && listing.sqft > 0) {
      listing.price_per_sqft = Math.round(listing.list_price / listing.sqft);
    }
    
    rows.push(listing);
  });
  
  return rows;
}

/* ---- Enrich with Redfin page description ---- */

async function enrichDescription(listing) {
  if (!listing.listing_url) return listing;
  try {
    var res = await fetch(listing.listing_url + '?utm_source=myredfin&utm_medium=api', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
    });
    var html = await res.text();
    
    // Extract description
    var descMatch = html.match(/"text":"([^"]{50,2000})"/);
    if (descMatch) {
      listing.description = descMatch[1].replace(/\\n/g, ' ').replace(/\\"/g, '"');
    }
    
    // Extract photo URL from listing page
    var photoMatch = html.match(/"url":"(https:\/\/ssl\.cdn-redfin\.com\/photo\/[^"]+)"/);
    if (photoMatch) {
      listing.photo_url = photoMatch[1].replace(/\\u002F/g, '/');
    }
    
  } catch(e) {
    // Silently skip — we have key_facts from API as fallback
  }
  return listing;
}

/* ---- Analyze a listing ---- */

function analyzeListing(listing, feedback) {
  var desc = ((listing.description || '') + ' ' + (listing.key_facts || '')).toLowerCase();
  var analysis = {
    mechanicals: { furnace: false, roof: false, water_heater: false, electrical: false, plumbing: false },
    positives: [],
    concerns: [],
    grade: 'C',
    score: 50,
    score_breakdown: {},
    deal_math: {},
    neighborhood_match: null,
    tier: null,
    estimated_arv: null,
  };
  
  // Match neighborhood
  for (var n of TIER_1) {
    if (n.zips.includes(listing.zip)) {
      if (!analysis.neighborhood_match || n.median > analysis.neighborhood_match.median) {
        analysis.neighborhood_match = n;
        analysis.tier = 1;
        analysis.estimated_arv = n.median;
      }
    }
  }
  if (!analysis.neighborhood_match) {
    for (var n2 of TIER_2) {
      if (n2.zips.includes(listing.zip)) {
        if (!analysis.neighborhood_match || n2.median > analysis.neighborhood_match.median) {
          analysis.neighborhood_match = n2;
          analysis.tier = 2;
          analysis.estimated_arv = n2.median;
        }
      }
    }
  }
  
  // Mechanical detection
  if (/new\s+(furnace|hvac|heating)|furnace.*(replaced|installed|new|20[12]\d)|high[\s-]?efficiency/i.test(desc)) {
    analysis.mechanicals.furnace = true;
    analysis.positives.push('✅ Updated furnace/HVAC');
  }
  if (/new\s+(roof|shingles)|roof.*(replaced|new|20[12]\d)|tear[\s-]?off|architectural\s+shingle/i.test(desc)) {
    analysis.mechanicals.roof = true;
    analysis.positives.push('✅ Updated roof');
  }
  if (/new\s+(water\s*heater|hot\s*water)|tankless|water\s*heater.*(replaced|new|20[12]\d)/i.test(desc)) {
    analysis.mechanicals.water_heater = true;
    analysis.positives.push('✅ New water heater');
  }
  if (/updated?\s*(electrical|wiring|panel)|new\s*(electrical|panel|breaker)|200[\s-]?amp|100[\s-]?amp|romex/i.test(desc)) {
    analysis.mechanicals.electrical = true;
    analysis.positives.push('✅ Updated electrical');
  }
  if (/updated?\s*plumbing|new\s*plumbing|pex|copper\s*(pipes|plumb)/i.test(desc)) {
    analysis.mechanicals.plumbing = true;
    analysis.positives.push('✅ Updated plumbing');
  }
  
  // Additional positives
  if (/brick/i.test(desc)) analysis.positives.push('✅ Brick exterior');
  if (/garage/i.test(desc)) analysis.positives.push('✅ Garage');
  if (/finished\s*basement|basement.*(finished|complete)/i.test(desc)) analysis.positives.push('✅ Finished basement');
  if (/hardwood|wood\s*floor/i.test(desc)) analysis.positives.push('✅ Hardwood floors');
  if (/updated\s*kitchen|new\s*kitchen|renovated\s*kitchen/i.test(desc)) analysis.positives.push('✅ Updated kitchen');
  if (/updated\s*bath|new\s*bath|renovated\s*bath/i.test(desc)) analysis.positives.push('✅ Updated bathroom(s)');
  if (/vinyl\s*window|new\s*window/i.test(desc)) analysis.positives.push('✅ New windows');
  if (/turnkey|move[\s-]?in\s*ready|pride\s*of\s*ownership/i.test(desc)) analysis.positives.push('✅ Turnkey / move-in ready');
  
  // Concerns
  if (/as[\s-]?is/i.test(desc)) analysis.concerns.push('⚠️ As-is sale');
  if (/cash\s*only/i.test(desc)) analysis.concerns.push('⚠️ Cash only');
  if (/bank[\s-]?owned|reo|foreclos/i.test(desc)) analysis.concerns.push('⚠️ Bank owned / REO');
  if (/section\s*8|tenant|leased|occupied/i.test(desc)) analysis.concerns.push('⚠️ Tenant in place');
  if (/estate\s*sale|probate/i.test(desc)) analysis.concerns.push('⚠️ Estate sale');
  if (/mold|water\s*damage|foundation\s*(issue|crack|problem)/i.test(desc)) analysis.concerns.push('🚫 Possible structural/water issue');
  if (/fire\s*(damage|claim)/i.test(desc)) analysis.concerns.push('🚫 Fire damage');
  if (/gut\s*(rehab|renovation)|gutted|studs/i.test(desc)) analysis.concerns.push('🚫 Major rehab needed');
  
  // Score
  var score = 50;
  var bd = {};
  
  // Mechanical score (max 25)
  var mechCount = Object.values(analysis.mechanicals).filter(Boolean).length;
  var mechScore = Math.min(mechCount * 6, 25);
  score += mechScore;
  bd.mechanicals = mechScore;
  
  // Roof (max 15)
  if (analysis.mechanicals.roof) { score += 15; bd.roof = 15; }
  
  // Neighborhood (max 20)
  if (analysis.tier === 1) { score += 20; bd.neighborhood = 20; }
  else if (analysis.tier === 2) { score += 12; bd.neighborhood = 12; }
  
  // Price to value (max 20)
  if (listing.list_price && analysis.estimated_arv) {
    var ratio = listing.list_price / analysis.estimated_arv;
    var pvScore = ratio <= 0.35 ? 20 : ratio <= 0.5 ? 16 : ratio <= 0.65 ? 12 : ratio <= 0.8 ? 6 : 0;
    score += pvScore;
    bd.price_to_value = pvScore;
  }
  
  // Layout bonus
  if (listing.beds >= 3 && listing.baths >= 1.5) { score += 5; bd.layout = 5; }
  if (listing.sqft >= 1200) { score += 3; bd.size = 3; }
  
  // Cosmetic positives
  if (analysis.positives.length > 4) { score += 5; bd.extras = 5; }
  
  // Concerns penalty
  if (analysis.concerns.some(c => c.startsWith('🚫'))) { score -= 20; bd.dealbreaker = -20; }
  if (analysis.concerns.some(c => c.includes('Cash only'))) { score -= 5; bd.cash_only = -5; }
  
  // Apply feedback adjustments
  if (feedback.adjustments) {
    var adj = feedback.adjustments;
    if (listing.zip && adj['zip_boost_' + listing.zip]) {
      var zb = adj['zip_boost_' + listing.zip];
      score += zb; bd.learned_zip = zb;
    }
    if (listing.zip && adj['zip_penalty_' + listing.zip]) {
      var zp = adj['zip_penalty_' + listing.zip];
      score += zp; bd.learned_zip_penalty = zp;
    }
  }
  
  analysis.score = Math.max(0, Math.min(100, score));
  analysis.score_breakdown = bd;
  
  // Grade
  if (analysis.score >= 85) analysis.grade = 'A';
  else if (analysis.score >= 75) analysis.grade = 'A-';
  else if (analysis.score >= 65) analysis.grade = 'B+';
  else if (analysis.score >= 55) analysis.grade = 'B';
  else if (analysis.score >= 45) analysis.grade = 'B-';
  else if (analysis.score >= 35) analysis.grade = 'C+';
  else analysis.grade = 'C';
  
  // Deal math
  if (listing.list_price) {
    var downPayment = Math.round(listing.list_price * 0.2);
    var mortgageAmount = listing.list_price - downPayment;
    var totalIn = downPayment + 10000 + 20000; // polish + contingency
    analysis.deal_math = {
      purchase: listing.list_price,
      down_payment: downPayment,
      mortgage: mortgageAmount,
      polish_budget: 10000,
      contingency: 20000,
      total_cash_in: totalIn,
      estimated_arv: analysis.estimated_arv,
      equity_at_arv: analysis.estimated_arv ? analysis.estimated_arv - mortgageAmount : null,
      refi_cashout: analysis.estimated_arv ? Math.round((analysis.estimated_arv * 0.75) - mortgageAmount) : null,
      price_per_sqft: listing.price_per_sqft,
    };
    
    // Monthly rent estimate (1% rule rough)
    if (analysis.estimated_arv) {
      analysis.deal_math.est_monthly_rent = Math.round(analysis.estimated_arv * 0.008);
    }
  }
  
  return analysis;
}

/* ---- Feedback Learning ---- */

async function learnFromFeedback() {
  var { data: feedback } = await supabase
    .from('search_feedback')
    .select('feedback, reason, search_id, user_name, property_searches(list_price, neighborhood, zip)')
    .order('created_at', { ascending: false })
    .limit(500);
  
  if (!feedback || feedback.length === 0) {
    console.log('  No feedback yet — using default preferences');
    return { entries: [], adjustments: {}, patterns: { likes: [], dislikes: [], learned_rules: [] } };
  }
  
  console.log('  Learning from ' + feedback.length + ' feedback entries...');
  
  var adjustments = {};
  var patterns = { likes: [], dislikes: [], learned_rules: [] };
  
  feedback.forEach(function(f) {
    var prop = f.property_searches;
    if (!prop) return;
    
    if (prop.zip) {
      var key = (f.feedback === 'up' ? 'zip_boost_' : 'zip_penalty_') + prop.zip;
      adjustments[key] = (adjustments[key] || 0) + (f.feedback === 'up' ? 3 : -3);
    }
    
    if (f.reason) {
      if (f.feedback === 'up') patterns.likes.push(f.reason);
      else patterns.dislikes.push(f.reason);
    }
  });
  
  // Cap adjustments
  Object.keys(adjustments).forEach(k => {
    if (adjustments[k] > 0) adjustments[k] = Math.min(adjustments[k], 15);
    else adjustments[k] = Math.max(adjustments[k], -15);
  });
  
  return { entries: feedback, adjustments, patterns };
}

/* ---- Neighborhood Median Update ---- */

async function updateMedians() {
  console.log('Updating neighborhood medians from recent sales...');
  var oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  var cutoff = oneYearAgo.toISOString().slice(0, 10);
  
  var allSales = [];
  var page = 0;
  var hasMore = true;
  while (hasMore && page < 20) {
    var { data: batch } = await supabase.from('sales').select('neighborhood, sale_price, zip')
      .gte('sale_date', cutoff).gt('sale_price', 10000)
      .range(page * 1000, (page + 1) * 1000 - 1);
    if (batch && batch.length > 0) { allSales = allSales.concat(batch); hasMore = batch.length === 1000; page++; }
    else hasMore = false;
  }
  
  // Compute medians by zip (more reliable than neighborhood name matching)
  var zipSales = {};
  allSales.forEach(s => {
    var price = Number(s.sale_price);
    if (price > 0 && s.zip) {
      if (!zipSales[s.zip]) zipSales[s.zip] = [];
      zipSales[s.zip].push(price);
    }
  });
  
  var zipMedians = {};
  Object.keys(zipSales).forEach(zip => {
    var prices = zipSales[zip].sort((a, b) => a - b);
    if (prices.length >= 5) {
      var mid = Math.floor(prices.length / 2);
      zipMedians[zip] = prices.length % 2 ? prices[mid] : Math.round((prices[mid - 1] + prices[mid]) / 2);
    }
  });
  
  console.log('  Medians for ' + Object.keys(zipMedians).length + ' zip codes');
  
  // Update neighborhood medians with real data
  ALL_NEIGHBORHOODS.forEach(n => {
    var realMedians = n.zips.map(z => zipMedians[z]).filter(Boolean);
    if (realMedians.length > 0) {
      n.median = Math.round(realMedians.reduce((a, b) => a + b) / realMedians.length);
    }
  });
  
  return zipMedians;
}

/* ---- Permit check from Supabase ---- */

async function checkPermits(addresses) {
  if (!addresses.length) return {};
  
  // Normalize addresses for matching
  var permits = {};
  for (var i = 0; i < addresses.length; i += 20) {
    var batch = addresses.slice(i, i + 20);
    // Try matching by street number + street name
    for (var addr of batch) {
      var parts = addr.split(',')[0].trim(); // Just the street address
      var { data } = await supabase.from('permits')
        .select('permit_type, description, status')
        .ilike('address', '%' + parts + '%')
        .limit(5);
      if (data && data.length > 0) {
        permits[addr] = data.map(p => ({
          type: p.permit_type,
          desc: p.description,
          status: p.status
        }));
      }
    }
  }
  return permits;
}

/* ---- Main Pipeline ---- */

async function run() {
  console.log('=== Dusty Turnkey Intelligence Report — ' + TODAY + ' ===\n');
  
  // 1. Fetch all listings
  var allListings = await fetchRedfin();
  console.log('Total listings: ' + allListings.length);
  
  // 2. Dedup FIRST — skip everything we've already seen (O(1) hashmap)
  var seenMap = loadSeenAddresses();
  var seenCount = Object.keys(seenMap).length;
  var newListings = allListings.filter(l => !seenMap[l.address]);
  console.log('Seen: ' + seenCount + ' | New: ' + newListings.length + ' of ' + allListings.length);
  
  // 3. Filter new listings to target neighborhoods
  var inTarget = newListings.filter(l => TARGET_ZIPS.has(l.zip));
  console.log('In target neighborhoods: ' + inTarget.length);
  
  // 4. Filter by price range
  var inRange = inTarget.filter(l => l.list_price >= STRATEGY.purchase_range[0] && l.list_price <= STRATEGY.purchase_range[1]);
  console.log('In price range ($' + STRATEGY.purchase_range[0].toLocaleString() + '-$' + STRATEGY.purchase_range[1].toLocaleString() + '): ' + inRange.length);
  
  // 5. Learn from feedback
  var feedback = await learnFromFeedback();
  
  // 6. Update medians
  await updateMedians();
  
  // 7. Analyze fresh in-range listings only
  var analyzed = inRange.map(l => ({ listing: l, analysis: analyzeListing(l, feedback) }));
  
  // Sort by score
  analyzed.sort((a, b) => b.analysis.score - a.analysis.score);
  
  // 8. Take top 20 for enrichment
  var topPicks = analyzed.slice(0, 20);
  console.log('\nEnriching top ' + topPicks.length + ' picks with descriptions...');
  
  for (var i = 0; i < topPicks.length; i++) {
    topPicks[i].listing = await enrichDescription(topPicks[i].listing);
    // Re-analyze with description
    topPicks[i].analysis = analyzeListing(topPicks[i].listing, feedback);
    if (i % 5 === 4) console.log('  Enriched ' + (i + 1) + '/' + topPicks.length);
    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }
  
  // Re-sort after enrichment
  topPicks.sort((a, b) => b.analysis.score - a.analysis.score);
  
  // 8. Check permits for top 10
  console.log('Checking permits...');
  var top10Addresses = topPicks.slice(0, 10).map(p => p.listing.street);
  var permitData = await checkPermits(top10Addresses);
  topPicks.slice(0, 10).forEach(p => {
    if (permitData[p.listing.street]) {
      p.permits = permitData[p.listing.street];
      p.analysis.positives.push('📋 ' + permitData[p.listing.street].length + ' permit(s) on file');
    }
  });
  
  // 9. Build the report
  var report = {
    date: TODAY,
    strategy: STRATEGY,
    market_intel: ALL_NEIGHBORHOODS.filter(n => n.median > 0).map(n => ({
      name: n.name,
      median: n.median,
      tier: TIER_1.includes(n) ? 1 : 2,
    })),
    funnel: {
      wide_net: allListings.length,
      new_only: newListings.length,
      target_neighborhoods: inTarget.length,
      price_range: inRange.length,
      photo_review: topPicks.length,
      graded: topPicks.filter(p => p.analysis.score >= 60).length,
    },
    feedback_summary: {
      total_feedback: feedback.entries.length,
      likes: feedback.patterns.likes.slice(0, 10),
      dislikes: feedback.patterns.dislikes.slice(0, 10),
      learned_rules: feedback.patterns.learned_rules,
    },
    properties: topPicks.map(p => ({
      address: p.listing.address,
      street: p.listing.street,
      city: p.listing.city,
      zip: p.listing.zip,
      list_price: p.listing.list_price,
      beds: p.listing.beds,
      baths: p.listing.baths,
      sqft: p.listing.sqft,
      year_built: p.listing.year_built,
      lot_size: p.listing.lot_size,
      price_per_sqft: p.listing.price_per_sqft,
      listing_url: p.listing.listing_url,
      photo_url: p.listing.photo_url,
      description: p.listing.description || p.listing.key_facts,
      dom: p.listing.dom,
      mls_id: p.listing.mls_id,
      status_display: p.listing.status_display,
      neighborhood: p.analysis.neighborhood_match ? p.analysis.neighborhood_match.name : p.listing.neighborhood_redfin,
      tier: p.analysis.tier,
      grade: p.analysis.grade,
      score: p.analysis.score,
      score_breakdown: p.analysis.score_breakdown,
      mechanicals: p.analysis.mechanicals,
      positives: p.analysis.positives,
      concerns: p.analysis.concerns,
      deal_math: p.analysis.deal_math,
      estimated_arv: p.analysis.estimated_arv,
      permits: p.permits || [],
    })),
  };
  
  // 10. Store in Supabase
  // Store each property in property_searches
  var storeErrors = [];
  for (var j = 0; j < report.properties.length; j++) {
    var prop = report.properties[j];
    var row = {
      search_date: TODAY,
      address: prop.address,
      zip: prop.zip,
      neighborhood: prop.neighborhood,
      list_price: prop.list_price,
      beds: prop.beds,
      baths: prop.baths,
      sqft: prop.sqft,
      year_built: prop.year_built,
      lot_size: prop.lot_size ? String(prop.lot_size) : null,
      listing_url: prop.listing_url,
      photo_urls: prop.photo_url ? [prop.photo_url] : [],
      description_raw: prop.description,
      source: 'redfin',
      score: prop.score,
      score_breakdown: prop.score_breakdown,
      highlights: prop.mechanicals,
      status: 'new',
      property_type: 'single_family',
      estimated_arv: prop.estimated_arv,
    };
    
    var { error } = await supabase.from('property_searches')
      .upsert(row, { onConflict: 'address,search_date', ignoreDuplicates: true });
    if (error) {
      console.log('  Store error for ' + prop.address + ': ' + error.message);
      storeErrors.push(prop.address + ': ' + error.message);
    }
  }
  
  // Store the full report as a property_report
  var { error: reportError } = await supabase.from('property_reports').insert({
    address: 'DAILY_REPORT_' + TODAY,
    report_type: 'dd',
    score: report.properties.length > 0 ? report.properties[0].score : 0,
    summary: 'Dusty Turnkey Report — ' + TODAY + ' — ' + report.properties.length + ' properties graded',
    report_data: report,
  });
  if (reportError) {
    console.log('Report store error: ' + reportError.message);
    storeErrors.push('daily report: ' + reportError.message);
  }

  if (storeErrors.length) {
    console.error('Persistence failed; not saving seen addresses. Listings will be retried on the next run.');
    throw new Error('Supabase persistence failed for ' + storeErrors.length + ' write(s)');
  }

  // Persist the seen hashmap only after Supabase writes succeed.
  var now = Date.now();
  allListings.forEach(l => { seenMap[l.address] = now; });
  saveSeenAddresses(seenMap);
  console.log('Seen addresses saved: ' + Object.keys(seenMap).length + ' total');
  
  // 11. Print summary
  console.log('\n=== REPORT SUMMARY ===');
  console.log('Funnel: ' + report.funnel.wide_net + ' → ' + report.funnel.target_neighborhoods + ' → ' + report.funnel.price_range + ' → Top ' + report.properties.length);
  console.log('\nTop Picks:');
  report.properties.slice(0, 10).forEach((p, i) => {
    var mechList = Object.entries(p.mechanicals).filter(([k, v]) => v).map(([k]) => k).join(', ');
    console.log((i + 1) + '. [' + p.grade + ' ' + p.score + '] ' + p.address + ' — $' + (p.list_price || 0).toLocaleString());
    console.log('   ' + (p.beds || '?') + 'bd/' + (p.baths || '?') + 'ba | ' + (p.sqft || '?') + 'sqft | $' + (p.price_per_sqft || '?') + '/sqft | ' + (p.neighborhood || 'Unknown'));
    if (mechList) console.log('   Mechanicals: ' + mechList);
    if (p.estimated_arv) console.log('   ARV: $' + p.estimated_arv.toLocaleString() + ' | Upside: $' + ((p.estimated_arv - p.list_price) || 0).toLocaleString());
    if (p.listing_url) console.log('   ' + p.listing_url);
  });
  
  console.log('\nReport stored. View at https://detroit-data-intel-v2.vercel.app/');
  return report;
}

run().catch(err => {
  console.error('Failed:', err.message);
  process.exit(1);
});
