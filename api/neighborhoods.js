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

    // Calculate cutoff date
    let cutoffDate = null;
    if (timeRange !== 'all') {
      const months = { '1y': 12, '2y': 24 }[timeRange] || 0;
      if (months > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        cutoffDate = d.toISOString().split('T')[0];
      }
    }

    // Build queries with optional date filtering
    let salesQuery = supabase.from('sales').select('neighborhood, sale_price').not('neighborhood', 'is', null).limit(50000);
    let blightQuery = supabase.from('blight').select('neighborhood').not('neighborhood', 'is', null).limit(50000);
    let permitsQuery = supabase.from('permits').select('neighborhood').not('neighborhood', 'is', null).limit(50000);
    let demosQuery = supabase.from('demos').select('neighborhood').not('neighborhood', 'is', null).limit(20000);
    let rentalsQuery = supabase.from('rentals').select('neighborhood').not('neighborhood', 'is', null).limit(40000);
    let dlbaQuery = supabase.from('dlba_owned').select('neighborhood').not('neighborhood', 'is', null).limit(60000);

    if (cutoffDate) {
      salesQuery = salesQuery.gte('sale_date', cutoffDate);
      blightQuery = blightQuery.gte('ticket_issued_date', cutoffDate);
      permitsQuery = permitsQuery.gte('permit_issued', cutoffDate);
      demosQuery = demosQuery.gte('permit_issued', cutoffDate);
    }

    const [salesRes, blightRes, permitsRes, demosRes, rentalsRes, dlbaRes] = await Promise.all([
      salesQuery, blightQuery, permitsQuery, demosQuery, rentalsQuery, dlbaQuery,
    ]);

    const nbStats = {};
    const ensure = (nb) => {
      if (!nbStats[nb]) nbStats[nb] = {
        neighborhood: nb, total_sales: 0, prices: [], total_blight: 0,
        total_permits: 0, total_rentals: 0, total_demos: 0, total_dlba: 0,
      };
    };

    for (const s of (salesRes.data || [])) {
      if (!s.neighborhood) continue;
      ensure(s.neighborhood);
      nbStats[s.neighborhood].total_sales++;
      if (s.sale_price != null) nbStats[s.neighborhood].prices.push(s.sale_price);
    }
    for (const b of (blightRes.data || [])) {
      if (!b.neighborhood) continue;
      ensure(b.neighborhood);
      nbStats[b.neighborhood].total_blight++;
    }
    for (const p of (permitsRes.data || [])) {
      if (!p.neighborhood) continue;
      ensure(p.neighborhood);
      nbStats[p.neighborhood].total_permits++;
    }
    for (const d of (demosRes.data || [])) {
      if (!d.neighborhood) continue;
      ensure(d.neighborhood);
      nbStats[d.neighborhood].total_demos++;
    }
    for (const r of (rentalsRes.data || [])) {
      if (!r.neighborhood) continue;
      ensure(r.neighborhood);
      nbStats[r.neighborhood].total_rentals++;
    }
    for (const dl of (dlbaRes.data || [])) {
      if (!dl.neighborhood) continue;
      ensure(dl.neighborhood);
      nbStats[dl.neighborhood].total_dlba++;
    }

    const neighborhoods = Object.values(nbStats).map(nb => {
      const sorted = nb.prices.slice().sort((a, b) => a - b);
      const medianPrice = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;

      return {
        neighborhood: nb.neighborhood,
        name: nb.neighborhood,
        sales_count: nb.total_sales,
        median_price: medianPrice,
        permits_count: nb.total_permits,
        blight_count: nb.total_blight,
        rentals_count: nb.total_rentals,
        demos_count: nb.total_demos,
        total_dlba: nb.total_dlba,
      };
    });

    // Calculate percentile-based components
    percentileRanks(neighborhoods, 'sales_count');
    percentileRanks(neighborhoods, 'median_price');
    percentileRanks(neighborhoods, 'permits_count');
    percentileRanks(neighborhoods, 'blight_count');
    percentileRanks(neighborhoods, 'rentals_count');
    percentileRanks(neighborhoods, 'demos_count');

    // Calculate default score and attach score_components
    const scored = neighborhoods.map(nb => {
      const sc = {
        sales_volume_pct: nb.pct_sales_count || 0,
        median_price_pct: nb.pct_median_price || 0,
        permit_activity_pct: nb.pct_permits_count || 0,
        blight_pct: nb.pct_blight_count || 0,
        rental_pct: nb.pct_rentals_count || 0,
        demo_pct: nb.pct_demos_count || 0,
      };

      // Default score: weighted sum with blight and demos inverted
      const score = Math.round(
        sc.sales_volume_pct * 25 +
        sc.median_price_pct * 25 +
        sc.permit_activity_pct * 20 +
        (1 - sc.blight_pct) * 15 +
        sc.rental_pct * 10 +
        (1 - sc.demo_pct) * 5
      );

      // Clean up temp pct_ fields
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

    const result = { data: scored, meta: { total: scored.length } };
    cacheMap[cacheKey] = { data: result, time: now };
    sendJson(res, result);
  } catch (err) {
    console.error('Error in /api/neighborhoods:', err);
    sendError(res, 'Internal server error');
  }
};
