const { handleCors, checkAuth, sendJson, sendError } = require('../_helpers');
const { supabase } = require('../_supabase');

/**
 * PostgREST silently caps raw-row scans at max-rows (often 1000), so
 * `.limit(5000)` stats were computed from the oldest ~1000 sales only.
 * Use group-by / column aggregates instead of scanning fact rows.
 */
const STATS_SELECT = [
  'spend:sale_price.sum()',
  'avg_price:sale_price.avg()',
  'min_price:sale_price.min()',
  'max_price:sale_price.max()',
  'first_date:sale_date.min()',
  'last_date:sale_date.max()',
].join(', ');

function firstRow(res) {
  const data = res && res.data;
  if (Array.isArray(data) && data.length) return data[0];
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  return {};
}

function numField(row, keys) {
  for (const k of keys) {
    if (row[k] != null && row[k] !== '') {
      const n = Number(row[k]);
      if (!Number.isNaN(n)) return n;
    }
  }
  return 0;
}

function dateField(row, keys) {
  for (const k of keys) {
    if (row[k]) return row[k];
  }
  return null;
}

function readAggCount(row) {
  return numField(row, ['count', 'total', 'cnt']);
}

function groupCounts(rows, nameKey) {
  return (rows || [])
    .map((r) => ({
      name: r[nameKey] || 'Unknown',
      count: readAggCount(r),
    }))
    .filter((r) => r.count > 0)
    .sort((a, b) => b.count - a.count);
}

function firstQueryError(results) {
  for (const r of results) {
    if (r && r.error) return r.error;
  }
  return null;
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const { name } = req.query;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decoded = decodeURIComponent(name);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const section = req.query.section || 'purchases';
    const offset = (page - 1) * limit;

    const [
      purchaseCountRes, saleCountRes,
      purchaseStatsRes, saleStatsRes,
      purchaseHoodsRes, saleHoodsRes,
      pageDataRes, deedTypesRes,
    ] = await Promise.all([
      supabase.from('sales').select('*', { count: 'exact', head: true }).ilike('grantee', `%${decoded}%`),
      supabase.from('sales').select('*', { count: 'exact', head: true }).ilike('grantor', `%${decoded}%`),
      supabase.from('sales').select(STATS_SELECT).ilike('grantee', `%${decoded}%`),
      supabase.from('sales').select(STATS_SELECT).ilike('grantor', `%${decoded}%`),
      supabase.from('sales').select('neighborhood, count()').ilike('grantee', `%${decoded}%`).not('neighborhood', 'is', null),
      supabase.from('sales').select('neighborhood, count()').ilike('grantor', `%${decoded}%`).not('neighborhood', 'is', null),
      section === 'sales'
        ? supabase.from('sales').select('*').ilike('grantor', `%${decoded}%`).order('sale_date', { ascending: false }).range(offset, offset + limit - 1)
        : supabase.from('sales').select('*').ilike('grantee', `%${decoded}%`).order('sale_date', { ascending: false }).range(offset, offset + limit - 1),
      supabase.from('sales').select('terms_of_sale, count()').ilike('grantee', `%${decoded}%`).not('terms_of_sale', 'is', null),
    ]);

    const queryError = firstQueryError([
      purchaseCountRes, saleCountRes, purchaseStatsRes, saleStatsRes,
      purchaseHoodsRes, saleHoodsRes, pageDataRes, deedTypesRes,
    ]);
    if (queryError) {
      console.error('Investor query error:', queryError);
      return sendError(res, 'Failed to query investor');
    }

    const totalPurchases = purchaseCountRes.count || 0;
    const totalSales = saleCountRes.count || 0;

    if (totalPurchases === 0 && totalSales === 0) {
      return sendError(res, 'Investor not found', 404);
    }

    const pStats = firstRow(purchaseStatsRes);
    const sStats = firstRow(saleStatsRes);
    const totalSpend = Math.round(numField(pStats, ['spend', 'sum', 'sale_price']));
    const totalRevenue = Math.round(numField(sStats, ['spend', 'sum', 'sale_price']));
    const avgPurchase = Math.round(numField(pStats, ['avg_price', 'avg']));
    const avgSale = Math.round(numField(sStats, ['avg_price', 'avg']));
    const minPurchase = Math.round(numField(pStats, ['min_price', 'min']));
    const maxPurchase = Math.round(numField(pStats, ['max_price', 'max']));
    const firstPurchase = dateField(pStats, ['first_date']);
    const lastPurchase = dateField(pStats, ['last_date']);

    const purchaseHoods = groupCounts(purchaseHoodsRes.data, 'neighborhood');
    const saleHoods = groupCounts(saleHoodsRes.data, 'neighborhood');

    const deedTypes = {};
    for (const row of groupCounts(deedTypesRes.data, 'terms_of_sale')) {
      deedTypes[row.name] = row.count;
    }

    // Flip sample: address match across buy/sell. Still windowed (PostgREST
    // max-rows) — hero spend/dates/neighborhoods above are exact aggregates.
    let flips = [];
    if (totalPurchases > 0 && totalSales > 0) {
      const [flipBuys, flipSells] = await Promise.all([
        supabase.from('sales').select('address, sale_price, sale_date, neighborhood')
          .ilike('grantee', `%${decoded}%`).not('address', 'is', null).order('sale_date', { ascending: true }).limit(2000),
        supabase.from('sales').select('address, sale_price, sale_date, neighborhood')
          .ilike('grantor', `%${decoded}%`).not('address', 'is', null).order('sale_date', { ascending: false }).limit(2000),
      ]);

      const buyMap = new Map();
      for (const b of (flipBuys.data || [])) {
        if (b.address && !buyMap.has(b.address)) buyMap.set(b.address, b);
      }
      for (const s of (flipSells.data || [])) {
        if (s.address && buyMap.has(s.address)) {
          const bought = buyMap.get(s.address);
          const profit = (s.sale_price || 0) - (bought.sale_price || 0);
          flips.push({
            address: s.address, neighborhood: s.neighborhood,
            bought_price: bought.sale_price, bought_date: bought.sale_date,
            sold_price: s.sale_price, sold_date: s.sale_date,
            profit,
            hold_days: Math.round((new Date(s.sale_date) - new Date(bought.sale_date)) / (1000 * 60 * 60 * 24)),
          });
        }
      }
      flips.sort((a, b) => (b.profit || 0) - (a.profit || 0));
    }

    const records = (pageDataRes.data || []).map(s => ({
      id: s.sales_id, addr: s.address, dt: s.sale_date, pr: Number(s.sale_price) || 0,
      gr: s.grantor, ge: s.grantee, nb: s.neighborhood, pid: s.parcel_id,
      tos: s.terms_of_sale, si: s.sale_instrument,
      pcd: s.property_class_description, zip: s.zip_code,
      lat: Number(s.latitude) || null, lng: Number(s.longitude) || null,
      role: section === 'sales' ? 'seller' : 'buyer',
    }));

    const totalForSection = section === 'sales' ? totalSales : totalPurchases;

    sendJson(res, {
      data: {
        profile: {
          name: decoded,
          total_purchases: totalPurchases,
          total_spend: totalSpend,
          avg_purchase_price: avgPurchase,
          min_purchase: minPurchase,
          max_purchase: maxPurchase,
          total_sales: totalSales,
          total_revenue: totalRevenue,
          avg_sale_price: avgSale,
          first_purchase: firstPurchase,
          last_purchase: lastPurchase,
          neighborhoods_active: purchaseHoods.length,
          total_flips: flips.length,
          investment_tier: totalPurchases >= 50 ? 'institutional' :
            totalPurchases >= 20 ? 'large' :
            totalPurchases >= 5 ? 'medium' : 'small',
        },
        neighborhoods: purchaseHoods,
        sale_neighborhoods: saleHoods,
        deed_types: deedTypes,
        flips: flips.slice(0, 20),
        [section]: records,
      },
      meta: {
        page, limit,
        pages: Math.ceil(totalForSection / limit),
        total: totalForSection,
        section,
        total_purchases: totalPurchases,
        total_sales: totalSales,
      },
    });
  } catch (err) {
    console.error('Error in /api/investor/[name]:', err);
    sendError(res, 'Internal server error');
  }
};
