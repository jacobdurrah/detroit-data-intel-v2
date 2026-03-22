const { handleCors, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

/**
 * Health Check API — verifies all data tables and features are working.
 * Used by cron monitoring and tests.
 * 
 * GET /api/health         → full health check
 * GET /api/health?quick=1 → quick (DB connectivity only)
 */

const EXPECTED_TABLES = {
  sales: { minRows: 400000, keyCol: 'sales_id' },
  blight: { minRows: 800000, keyCol: 'ticket_id' },
  assessment: { minRows: 300000, keyCol: 'parcel_id' },
  trades: { minRows: 100000, keyCol: 'permit_no' },
  permits: { minRows: 40000, keyCol: 'permit_no' },
  dlba_owned: { minRows: 50000, keyCol: 'parcel_id' },
  rentals: { minRows: 30000, keyCol: 'certificate_number' },
  demos: { minRows: 15000, keyCol: 'permit_no' },
  presale: { minRows: 10000, keyCol: 'case_id' },
  dlba_auction: { minRows: 4000, keyCol: 'object_id' },
  vacant: { minRows: 1000, keyCol: 'task_id' },
  contractor_directory: { minRows: 250, keyCol: 'id' },
};

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  const quick = req.query.quick === '1';
  const start = Date.now();
  const checks = [];
  let allHealthy = true;

  // 1. DB connectivity
  try {
    const { data, error } = await supabase.from('sales').select('sales_id').limit(1);
    if (error) throw error;
    checks.push({ name: 'db_connectivity', status: 'ok', ms: Date.now() - start });
  } catch (err) {
    checks.push({ name: 'db_connectivity', status: 'fail', error: err.message });
    allHealthy = false;
  }

  if (quick) {
    return sendJson(res, {
      status: allHealthy ? 'healthy' : 'degraded',
      checks,
      ms: Date.now() - start,
    });
  }

  // 2. Table row counts
  for (const [table, expected] of Object.entries(EXPECTED_TABLES)) {
    try {
      const { count, error } = await supabase
        .from(table)
        .select(expected.keyCol, { count: 'exact', head: true });
      
      if (error) throw error;
      
      const ok = count >= expected.minRows;
      if (!ok) allHealthy = false;
      
      checks.push({
        name: `table_${table}`,
        status: ok ? 'ok' : 'warn',
        rows: count,
        minExpected: expected.minRows,
        ...(ok ? {} : { warning: `Expected ≥${expected.minRows}, got ${count}` }),
      });
    } catch (err) {
      checks.push({ name: `table_${table}`, status: 'fail', error: err.message });
      allHealthy = false;
    }
  }

  // 3. FTS index check
  try {
    const { data, error } = await supabase.rpc('search_contractors', {
      p_query: 'furnace',
      p_zip: null,
      p_lat: null,
      p_lng: null,
      p_radius_miles: 10,
      p_limit: 3,
      p_offset: 0,
    });
    if (error) throw error;
    const ok = data && data.length > 0;
    if (!ok) allHealthy = false;
    checks.push({ name: 'fts_contractors', status: ok ? 'ok' : 'warn', results: data?.length || 0 });
  } catch (err) {
    checks.push({ name: 'fts_contractors', status: 'fail', error: err.message });
    allHealthy = false;
  }

  // 4. Investor RPC check
  try {
    const { data, error } = await supabase.rpc('count_investors', {
      p_search: null,
      p_neighborhood: null,
      p_min_purchases: 1,
    });
    if (error) throw error;
    const ok = data > 50000;
    if (!ok) allHealthy = false;
    checks.push({ name: 'rpc_investors', status: ok ? 'ok' : 'warn', count: data });
  } catch (err) {
    checks.push({ name: 'rpc_investors', status: 'fail', error: err.message });
    allHealthy = false;
  }

  // 5. Entity resolution stats
  try {
    const { data, error } = await supabase
      .from('contractor_directory')
      .select('resolution_status')
      .not('resolution_status', 'is', null);
    
    if (error) throw error;
    
    const stats = {};
    for (const r of data || []) {
      stats[r.resolution_status] = (stats[r.resolution_status] || 0) + 1;
    }
    checks.push({ name: 'entity_resolution', status: 'ok', stats });
  } catch (err) {
    checks.push({ name: 'entity_resolution', status: 'fail', error: err.message });
  }

  const totalMs = Date.now() - start;
  
  sendJson(res, {
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date().toISOString(),
    checks,
    summary: {
      total: checks.length,
      ok: checks.filter(c => c.status === 'ok').length,
      warn: checks.filter(c => c.status === 'warn').length,
      fail: checks.filter(c => c.status === 'fail').length,
    },
    ms: totalMs,
  });
};
