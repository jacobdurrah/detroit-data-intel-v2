const { handleCors, sendJson, sendError, intParam } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 50), 200);
    const { neighborhood, min_price, max_price, start_date, end_date, grantee, bounds, sort } = req.query;

    let query = supabase.from('sales')
      .select('sales_id, address, sale_date, sale_price, grantor, grantee, neighborhood, ecf_neighborhood, parcel_id, zip_code, terms_of_sale, property_class_desc, latitude, longitude', { count: 'exact' });

    if (neighborhood) query = query.ilike('neighborhood', `%${neighborhood}%`);
    if (min_price) query = query.gte('sale_price', parseFloat(min_price));
    if (max_price) query = query.lte('sale_price', parseFloat(max_price));
    if (start_date) query = query.gte('sale_date', start_date);
    if (end_date) query = query.lte('sale_date', end_date);
    if (grantee) query = query.ilike('grantee', `%${grantee}%`);

    if (bounds) {
      const parts = bounds.split(',').map(Number);
      if (parts.length === 4 && parts.every(n => !isNaN(n))) {
        query = query
          .gte('latitude', parts[0]).lte('latitude', parts[2])
          .gte('longitude', parts[1]).lte('longitude', parts[3]);
      }
    }

    const sortField = sort === 'price_asc' ? 'sale_price' : sort === 'price_desc' ? 'sale_price' : 'sale_date';
    const ascending = sort === 'price_asc' || sort === 'date_asc';
    query = query.order(sortField, { ascending }).range((page - 1) * limit, page * limit - 1);

    const { data, count, error } = await query;
    if (error) return sendError(res, error.message);

    sendJson(res, {
      data: (data || []).map(s => ({
        id: s.sales_id, addr: s.address, dt: s.sale_date, pr: s.sale_price,
        gr: s.grantor, ge: s.grantee, nb: s.neighborhood, ecf: s.ecf_neighborhood,
        pid: s.parcel_id, zip: s.zip_code, terms: s.terms_of_sale,
        class: s.property_class_desc, lat: s.latitude, lng: s.longitude,
      })),
      meta: { total: count, page, limit },
    });
  } catch (err) {
    console.error('Error in /api/sales:', err);
    sendError(res, 'Internal server error');
  }
};
