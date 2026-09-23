const { handleCors, checkAuth, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

let cacheMap = {};
const CACHE_TTL = 10 * 60 * 1000;

function percentileRanks(arr, key) {
  var items = arr.map(function (n, i) { return { val: n[key] || 0, idx: i }; });
  items.sort(function (a, b) { return a.val - b.val; });
  var len = items.length;
  for (var i = 0; i < len; i++) {
    arr[items[i].idx]['pct_' + key] = len > 1 ? i / (len - 1) : 0;
  }
}

function cutoffForTimeRange(timeRange) {
  if (!timeRange || timeRange === 'all') return null;
  const months = { '1y': 12, '2y': 24 }[timeRange] || 0;
  if (months <= 0) return null;
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().split('T')[0];
}

/**
 * PostgREST aggregate rows look like { neighborhood, count, avg_price }.
 * Normalize count/avg field names across SDK response shapes.
 */
function readAggCount(row) {
  if (row == null) return 0;
  const n = row.count ?? row.total ?? row.cnt;
  return Number(n) || 0;
}

function readAggAvgPrice(row) {
  if (row == null) return 0;
  const n = row.avg_price ?? row.avg ?? row.sale_price;
  return Number(n) || 0;
}

/**
 * Exact per-neighborhood aggregates via PostgREST group-by selects.
 * Avoids silent truncation from PostgREST max-rows (often 1000) which made
 * `.limit(50000)` raw-row scans return ~1000 rows total citywide.
 */
async function fetchExactNeighborhoodAggregates(cutoffDate) {
  let salesQuery = supabase
    .from('sales')
    .select('neighborhood, count(), avg_price:sale_price.avg()')
    .not('neighborhood', 'is', null);
  let blightQuery = supabase
    .from('blight')
    .select('neighborhood, count()')
    .not('neighborhood', 'is', null);
  let permitsQuery = supabase
    .from('permits')
    .select('neighborhood, count()')
    .not('neighborhood', 'is', null);
  let demosQuery = supabase
    .from('demos')
    .select('neighborhood, count()')
    .not('neighborhood', 'is', null);
  let rentalsQuery = supabase
    .from('rentals')
    .select('neighborhood, count()')
    .not('neighborhood', 'is', null);
  let dlbaQuery = supabase
    .from('dlba_owned')
    .select('neighborhood, count()')
    .not('neighborhood', 'is', null);

  if (cutoffDate) {
    salesQuery = salesQuery.gte('sale_date', cutoffDate);
    blightQuery = blightQuery.gte('ticket_issued_date', cutoffDate);
    permitsQuery = permitsQuery.gte('permit_issued', cutoffDate);
    demosQuery = demosQuery.gte('permit_issued', cutoffDate);
  }

  const [salesRes, blightRes, permitsRes, demosRes, rentalsRes, dlbaRes] = await Promise.all([
    salesQuery,
    blightQuery,
    permitsQuery,
    demosQuery,
    rentalsQuery,
    dlbaQuery,
  ]);

  const errors = [salesRes, blightRes, permitsRes, demosRes, rentalsRes, dlbaRes]
    .map((r) => r.error)
    .filter(Boolean);
  if (errors.length) {
    const err = new Error(errors.map((e) => e.message || String(e)).join('; '));
    err.aggregateErrors = errors;
    throw err;
  }

  const nbStats = {};
  const ensure = (nb) => {
    if (!nbStats[nb]) {
      nbStats[nb] = {
        neighborhood: nb,
        total_sales: 0,
        median_price: 0,
        total_blight: 0,
        total_permits: 0,
        total_rentals: 0,
        total_demos: 0,
        total_dlba: 0,
      };
    }
  };

  for (const row of salesRes.data || []) {
    if (!row.neighborhood) continue;
    ensure(row.neighborhood);
    nbStats[row.neighborhood].total_sales = readAggCount(row);
    // PostgREST has no percentile aggregate; avg is the best exact citywide
    // price signal available without scanning every sale row.
    nbStats[row.neighborhood].median_price = Math.round(readAggAvgPrice(row));
  }
  for (const row of blightRes.data || []) {
    if (!row.neighborhood) continue;
    ensure(row.neighborhood);
    nbStats[row.neighborhood].total_blight = readAggCount(row);
  }
  for (const row of permitsRes.data || []) {
    if (!row.neighborhood) continue;
    ensure(row.neighborhood);
    nbStats[row.neighborhood].total_permits = readAggCount(row);
  }
  for (const row of demosRes.data || []) {
    if (!row.neighborhood) continue;
    ensure(row.neighborhood);
    nbStats[row.neighborhood].total_demos = readAggCount(row);
  }
  for (const row of rentalsRes.data || []) {
    if (!row.neighborhood) continue;
    ensure(row.neighborhood);
    nbStats[row.neighborhood].total_rentals = readAggCount(row);
  }
  for (const row of dlbaRes.data || []) {
    if (!row.neighborhood) continue;
    ensure(row.neighborhood);
    nbStats[row.neighborhood].total_dlba = readAggCount(row);
  }

  return nbStats;
}

/**
 * All-time path via neighborhood_stats view (true median + exact counts).
 * Returns null if the view is unavailable so callers can fall back.
 */
async function fetchFromNeighborhoodStatsView() {
  const { data, error } = await supabase
    .from('neighborhood_stats')
    .select(
      'neighborhood, total_sales, median_price, total_permits, total_blight, total_demos, total_rentals'
    )
    .limit(1000);

  if (error) return null;
  if (!data || !data.length) return null;

  const nbStats = {};
  for (const row of data) {
    if (!row.neighborhood) continue;
    nbStats[row.neighborhood] = {
      neighborhood: row.neighborhood,
      total_sales: Number(row.total_sales) || 0,
      median_price: Math.round(Number(row.median_price) || 0),
      total_blight: Number(row.total_blight) || 0,
      total_permits: Number(row.total_permits) || 0,
      total_rentals: Number(row.total_rentals) || 0,
      total_demos: Number(row.total_demos) || 0,
      total_dlba: 0,
    };
  }
  return nbStats;
}

function scoreNeighborhoods(nbStats) {
  const neighborhoods = Object.values(nbStats).map((nb) => ({
    neighborhood: nb.neighborhood,
    name: nb.neighborhood,
    sales_count: nb.total_sales,
    median_price: nb.median_price,
    permits_count: nb.total_permits,
    blight_count: nb.total_blight,
    rentals_count: nb.total_rentals,
    demos_count: nb.total_demos,
    total_dlba: nb.total_dlba,
  }));

  percentileRanks(neighborhoods, 'sales_count');
  percentileRanks(neighborhoods, 'median_price');
  percentileRanks(neighborhoods, 'permits_count');
  percentileRanks(neighborhoods, 'blight_count');
  percentileRanks(neighborhoods, 'rentals_count');
  percentileRanks(neighborhoods, 'demos_count');

  return neighborhoods.map((nb) => {
    const sc = {
      sales_volume_pct: nb.pct_sales_count || 0,
      median_price_pct: nb.pct_median_price || 0,
      permit_activity_pct: nb.pct_permits_count || 0,
      blight_pct: nb.pct_blight_count || 0,
      rental_pct: nb.pct_rentals_count || 0,
      demo_pct: nb.pct_demos_count || 0,
    };

    const score = Math.round(
      sc.sales_volume_pct * 25 +
        sc.median_price_pct * 25 +
        sc.permit_activity_pct * 20 +
        (1 - sc.blight_pct) * 15 +
        sc.rental_pct * 10 +
        (1 - sc.demo_pct) * 5
    );

    delete nb.pct_sales_count;
    delete nb.pct_median_price;
    delete nb.pct_permits_count;
    delete nb.pct_blight_count;
    delete nb.pct_rentals_count;
    delete nb.pct_demos_count;

    return {
      ...nb,
      score,
      score_components: sc,
    };
  }).sort((a, b) => b.score - a.score);
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const timeRange = req.query.time_range || 'all';
    const cacheKey = 'nb_' + timeRange;
    const now = Date.now();

    if (cacheMap[cacheKey] && (now - cacheMap[cacheKey].time) < CACHE_TTL) {
      return sendJson(res, cacheMap[cacheKey].data);
    }

    const cutoffDate = cutoffForTimeRange(timeRange);
    let nbStats = null;
    let source = 'aggregates';

    // Prefer the SQL view for all-time (true median). Fall back to aggregates.
    if (!cutoffDate) {
      nbStats = await fetchFromNeighborhoodStatsView();
      if (nbStats) source = 'neighborhood_stats';
    }

    if (!nbStats) {
      nbStats = await fetchExactNeighborhoodAggregates(cutoffDate);
      source = 'aggregates';
    }

    const scored = scoreNeighborhoods(nbStats);
    const result = {
      data: scored,
      meta: {
        total: scored.length,
        time_range: timeRange,
        source,
      },
    };
    cacheMap[cacheKey] = { data: result, time: now };
    sendJson(res, result);
  } catch (err) {
    console.error('Error in /api/neighborhoods:', err);
    sendError(res, 'Internal server error');
  }
};

// Exported for unit tests
module.exports._test = {
  cutoffForTimeRange,
  readAggCount,
  readAggAvgPrice,
  scoreNeighborhoods,
  percentileRanks,
};
