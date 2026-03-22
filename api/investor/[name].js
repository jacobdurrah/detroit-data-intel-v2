const { handleCors, sendJson, sendError } = require('../_helpers');
const { supabase } = require('../_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { name } = req.query;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decoded = decodeURIComponent(name);
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    const section = req.query.section || 'purchases';
    const offset = (page - 1) * limit;

    // Get true counts + stats via aggregate queries in parallel
    const [
      purchaseCountRes, saleCountRes,
      purchaseStatsRes, saleStatsRes,
      purchaseHoodsRes, saleHoodsRes,
      pageDataRes, deedTypesRes
    ] = await Promise.all([
      // Total counts
      supabase.from('sales').select('*', { count: 'exact', head: true }).ilike('grantee', `%${decoded}%`),
      supabase.from('sales').select('*', { count: 'exact', head: true }).ilike('grantor', `%${decoded}%`),
      // Purchase stats (first/last page for date range + price stats from first 5000)
      supabase.from('sales').select('sale_price, sale_date, neighborhood')
        .ilike('grantee', `%${decoded}%`).order('sale_date', { ascending: true }).limit(5000),
      // Sale stats
      supabase.from('sales').select('sale_price, sale_date, neighborhood')
        .ilike('grantor', `%${decoded}%`).order('sale_date', { ascending: true }).limit(5000),
      // Neighborhood breakdown (purchases)
      supabase.from('sales').select('neighborhood').ilike('grantee', `%${decoded}%`).not('neighborhood', 'is', null).limit(5000),
      // Neighborhood breakdown (sales)
      supabase.from('sales').select('neighborhood').ilike('grantor', `%${decoded}%`).not('neighborhood', 'is', null).limit(5000),
      // Current page of records
      section === 'sales'
        ? supabase.from('sales').select('*').ilike('grantor', `%${decoded}%`).order('sale_date', { ascending: false }).range(offset, offset + limit - 1)
        : supabase.from('sales').select('*').ilike('grantee', `%${decoded}%`).order('sale_date', { ascending: false }).range(offset, offset + limit - 1),
      // Deed types
      supabase.from('sales').select('terms_of_sale').ilike('grantee', `%${decoded}%`).not('terms_of_sale', 'is', null).limit(5000),
    ]);

    const totalPurchases = purchaseCountRes.count || 0;
    const totalSales = saleCountRes.count || 0;

    if (totalPurchases === 0 && totalSales === 0) {
      return sendError(res, 'Investor not found', 404);
    }

    // Compute stats from full dataset
    const pData = purchaseStatsRes.data || [];
    const sData = saleStatsRes.data || [];
    let totalSpend = 0, totalRevenue = 0;
    const purchasePrices = [], salePrices = [];

    for (const r of pData) {
      totalSpend += (r.sale_price || 0);
      purchasePrices.push(r.sale_price || 0);
    }
    for (const r of sData) {
      totalRevenue += (r.sale_price || 0);
      salePrices.push(r.sale_price || 0);
    }

    // Neighborhood aggregation
    const countNeighborhoods = (data) => {
      const map = {};
      for (const r of data) {
        const nb = r.neighborhood || 'Unknown';
        map[nb] = (map[nb] || 0) + 1;
      }
      return Object.entries(map).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count }));
    };

    const purchaseHoods = countNeighborhoods(purchaseHoodsRes.data || []);
    const saleHoods = countNeighborhoods(saleHoodsRes.data || []);

    // Deed types
    const deedTypes = {};
    for (const r of (deedTypesRes.data || [])) {
      const t = r.terms_of_sale || 'Unknown';
      deedTypes[t] = (deedTypes[t] || 0) + 1;
    }

    // Flip detection: get purchased addresses and find matches in sales
    const purchasedAddrs = new Map();
    for (const r of pData) {
      if (r.sale_date) {
        // Keep earliest purchase per address
        if (!purchasedAddrs.has(r.neighborhood + '|' + r.sale_price)) {
          // Use neighborhood+price as rough key since we don't have address in stats query
        }
      }
    }

    // For flips, we need addresses — do a targeted query
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

    // Map page records
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
          avg_purchase_price: pData.length > 0 ? Math.round(totalSpend / pData.length) : 0,
          min_purchase: purchasePrices.length > 0 ? Math.min(...purchasePrices) : 0,
          max_purchase: purchasePrices.length > 0 ? Math.max(...purchasePrices) : 0,
          total_sales: totalSales,
          total_revenue: totalRevenue,
          avg_sale_price: sData.length > 0 ? Math.round(totalRevenue / sData.length) : 0,
          first_purchase: pData.length > 0 ? pData[0].sale_date : null,
          last_purchase: pData.length > 0 ? pData[pData.length - 1].sale_date : null,
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
