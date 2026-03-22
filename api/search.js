const { handleCors, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

const LIMIT = 10;

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { q, type } = req.query;
    if (!q || q.trim().length === 0) return sendError(res, 'q parameter is required', 400);

    const query = q.trim();
    const pattern = `%${query}%`;
    const searchType = (type || 'all').toLowerCase();

    const results = { investors: [], properties: [], contractors: [], neighborhoods: [] };

    // Search properties by address
    if (searchType === 'all' || searchType === 'property') {
      const { data } = await supabase.from('sales')
        .select('sales_id, address, sale_price, sale_date, grantee, grantor, neighborhood, latitude, longitude, parcel_id')
        .or(`address.ilike.${pattern},grantee.ilike.${pattern},grantor.ilike.${pattern}`)
        .order('sale_date', { ascending: false })
        .limit(LIMIT);
      results.properties = (data || []).map(s => ({
        id: s.sales_id, address: s.address, sale_price: s.sale_price,
        sale_date: s.sale_date, grantee: s.grantee, grantor: s.grantor,
        neighborhood: s.neighborhood, lat: s.latitude, lng: s.longitude,
      }));
    }

    // Search investors (top buyers)
    if (searchType === 'all' || searchType === 'investor') {
      const { data } = await supabase.rpc('search_investors', { search_term: query });
      if (data) {
        results.investors = data.slice(0, LIMIT);
      } else {
        // Fallback: simple grantee search
        const { data: sales } = await supabase.from('sales')
          .select('grantee, sale_price, neighborhood')
          .ilike('grantee', pattern)
          .limit(100);
        if (sales) {
          const grouped = {};
          for (const s of sales) {
            const name = s.grantee;
            if (!grouped[name]) grouped[name] = { name, total_purchases: 0, neighborhoods: new Set() };
            grouped[name].total_purchases++;
            if (s.neighborhood) grouped[name].neighborhoods.add(s.neighborhood);
          }
          results.investors = Object.values(grouped)
            .map(g => ({ ...g, top_neighborhood: [...g.neighborhoods][0], neighborhoods: undefined }))
            .sort((a, b) => b.total_purchases - a.total_purchases)
            .slice(0, LIMIT);
        }
      }
    }

    // Search contractors
    if (searchType === 'all' || searchType === 'contractor') {
      const { data: permits } = await supabase.from('permits')
        .select('contractor_name, permit_type, neighborhood')
        .ilike('contractor_name', pattern)
        .limit(100);
      const { data: tradeData } = await supabase.from('trades')
        .select('contractor_name, permit_type, neighborhood')
        .ilike('contractor_name', pattern)
        .limit(100);
      
      const all = [...(permits || []), ...(tradeData || [])];
      const grouped = {};
      for (const p of all) {
        const name = p.contractor_name;
        if (!name) continue;
        if (!grouped[name]) grouped[name] = { name, total_permits: 0, types: {}, neighborhoods: {} };
        grouped[name].total_permits++;
        if (p.permit_type) grouped[name].types[p.permit_type] = (grouped[name].types[p.permit_type] || 0) + 1;
        if (p.neighborhood) grouped[name].neighborhoods[p.neighborhood] = (grouped[name].neighborhoods[p.neighborhood] || 0) + 1;
      }
      results.contractors = Object.values(grouped)
        .map(g => ({
          name: g.name,
          total_permits: g.total_permits,
          top_specialty: Object.entries(g.types).sort((a,b) => b[1]-a[1])[0]?.[0] || null,
          top_neighborhood: Object.entries(g.neighborhoods).sort((a,b) => b[1]-a[1])[0]?.[0] || null,
        }))
        .sort((a, b) => b.total_permits - a.total_permits)
        .slice(0, LIMIT);
    }

    // Search neighborhoods
    if (searchType === 'all' || searchType === 'neighborhood') {
      const { data } = await supabase.from('assessment')
        .select('neighborhood')
        .ilike('neighborhood', pattern)
        .limit(100);
      if (data) {
        const unique = [...new Set(data.map(d => d.neighborhood).filter(Boolean))];
        results.neighborhoods = unique.slice(0, LIMIT).map(n => ({ neighborhood: n }));
      }
    }

    sendJson(res, {
      data: results,
      meta: {
        query: q.trim(),
        total: results.investors.length + results.properties.length +
               results.contractors.length + results.neighborhoods.length,
      },
    });
  } catch (err) {
    console.error('Error in /api/search:', err);
    sendError(res, 'Internal server error');
  }
};
