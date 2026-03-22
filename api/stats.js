const { handleCors, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

let cache = null;
let cacheTime = 0;

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const now = Date.now();
    if (cache && (now - cacheTime) < 60000) return sendJson(res, cache);

    const tables = ['sales', 'blight', 'assessment', 'permits', 'trades', 'rentals', 'dlba_owned', 'dlba_auction', 'presale', 'demos', 'vacant'];
    const counts = {};
    let total = 0;

    const [, investorCount] = await Promise.all([
      Promise.all(tables.map(async (t) => {
        const { count } = await supabase.from(t).select('*', { count: 'exact', head: true });
        counts[t] = count || 0;
        total += counts[t];
      })),
      supabase.rpc('count_investors', { p_min_purchases: 2 }).then(r => r.data).catch(() => null),
    ]);

    const result = {
      data: {
        total_records: total,
        total_sales: counts.sales || 0,
        total_blight: counts.blight || 0,
        total_permits: (counts.permits || 0) + (counts.trades || 0),
        investors: investorCount || 0,
        pipeline: counts.sales || 0,
        neighborhoods: 190,
        tables: counts,
        database_source: 'Supabase (live)',
        last_checked: new Date().toISOString(),
      },
    };

    cache = result;
    cacheTime = now;
    sendJson(res, result);
  } catch (err) {
    console.error('Error in /api/stats:', err);
    sendError(res, 'Internal server error');
  }
};
