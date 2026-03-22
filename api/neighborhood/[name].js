const { handleCors, sendJson, sendError } = require('../_helpers');
const { supabase } = require('../_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { name } = req.query;
    if (!name) return sendError(res, 'Name parameter is required', 400);

    const decoded = decodeURIComponent(name);
    const pattern = `%${decoded}%`;
    const section = req.query.section || null;
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);

    // If a specific section is requested, return paginated section data
    if (section && section !== 'overview') {
      const offset = (page - 1) * limit;
      let query, countQuery;

      if (section === 'sales') {
        query = supabase.from('sales').select('*').ilike('neighborhood', pattern).order('sale_date', { ascending: false }).range(offset, offset + limit - 1);
        countQuery = supabase.from('sales').select('*', { count: 'exact', head: true }).ilike('neighborhood', pattern);
      } else if (section === 'permits') {
        query = supabase.from('permits').select('permit_no, address, permit_type, description, permit_issued, estimated_cost, contractor_name, neighborhood').ilike('neighborhood', pattern).order('permit_issued', { ascending: false }).range(offset, offset + limit - 1);
        countQuery = supabase.from('permits').select('*', { count: 'exact', head: true }).ilike('neighborhood', pattern);
      } else if (section === 'blight') {
        query = supabase.from('blight').select('ticket_id, violation_description, fine_amount, balance_due, payment_status, ticket_issued_date, neighborhood').ilike('neighborhood', pattern).order('ticket_issued_date', { ascending: false }).range(offset, offset + limit - 1);
        countQuery = supabase.from('blight').select('*', { count: 'exact', head: true }).ilike('neighborhood', pattern);
      } else if (section === 'trades') {
        query = supabase.from('trades').select('permit_no, address, permit_type, description, permit_issued, contractor_name, neighborhood').ilike('neighborhood', pattern).order('permit_issued', { ascending: false }).range(offset, offset + limit - 1);
        countQuery = supabase.from('trades').select('*', { count: 'exact', head: true }).ilike('neighborhood', pattern);
      } else {
        return sendError(res, 'Invalid section', 400);
      }

      const [{ data: records, error }, { count: total }] = await Promise.all([query, countQuery]);
      if (error) {
        console.error('Section query error:', error);
        return sendError(res, 'Failed to query section');
      }

      const formatRecord = (r, sec) => {
        if (sec === 'sales') return { addr: r.address, dt: r.sale_date, pr: Number(r.sale_price) || 0, gr: r.grantor, ge: r.grantee, tos: r.terms_of_sale, si: r.sale_instrument, pcd: r.property_class_description, nb: r.neighborhood, pid: r.parcel_id, zip: r.zip_code };
        if (sec === 'permits') return { id: r.permit_no, addr: r.address, dt: r.permit_issued, type: r.permit_type, desc: r.description, cost: Number(r.estimated_cost) || 0 };
        if (sec === 'blight') return { id: r.ticket_id, addr: r.address || '', dt: r.ticket_issued_date, desc: r.violation_description, disp: r.disposition || '', fine: Number(r.fine_amount) || 0 };
        if (sec === 'trades') return { id: r.permit_no, addr: r.address, dt: r.permit_issued, type: r.permit_type, desc: r.description, own: r.owner_name || '', biz: r.contractor_name || '', con: r.contractor_name || '' };
        return r;
      };

      return sendJson(res, {
        data: { records: (records || []).map(r => formatRecord(r, section)) },
        meta: { section, page, limit, total: total || 0, pages: Math.ceil((total || 0) / limit) }
      });
    }

    const [salesRes, blightRes, permitsRes, tradesRes, assessRes, rentalsRes, demosRes, dlbaRes] = await Promise.all([
      supabase.from('sales').select('*').ilike('neighborhood', pattern).order('sale_date', { ascending: false }).limit(100),
      supabase.from('blight').select('ticket_id, violation_description, fine_amount, balance_due, payment_status, ticket_issued_date').ilike('neighborhood', pattern).order('ticket_issued_date', { ascending: false }).limit(100),
      supabase.from('permits').select('permit_no, address, permit_type, description, permit_issued, estimated_cost, contractor_name').ilike('neighborhood', pattern).order('permit_issued', { ascending: false }).limit(50),
      supabase.from('trades').select('permit_no, address, permit_type, description, permit_issued, contractor_name').ilike('neighborhood', pattern).order('permit_issued', { ascending: false }).limit(50),
      supabase.from('assessment').select('parcel_id, address, total_assessed_value, total_taxable_value, year_built, owner_name, property_class').ilike('neighborhood', pattern).limit(200),
      supabase.from('rentals').select('*').ilike('neighborhood', pattern).limit(50),
      supabase.from('demos').select('*').ilike('neighborhood', pattern).limit(50),
      supabase.from('dlba_owned').select('*').ilike('neighborhood', pattern).limit(100),
    ]);

    const sales = salesRes.data || [];
    const blight = blightRes.data || [];
    const permits = permitsRes.data || [];
    const trades = tradesRes.data || [];
    const assess = assessRes.data || [];
    const rentals = rentalsRes.data || [];
    const demos = demosRes.data || [];
    const dlba = dlbaRes.data || [];

    // Top investors in this neighborhood
    const buyerCounts = {};
    for (const s of sales) {
      if (s.grantee) buyerCounts[s.grantee] = (buyerCounts[s.grantee] || 0) + 1;
    }
    const topInvestors = Object.entries(buyerCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([name, count]) => ({ name, purchases: count }));

    // Assessment stats
    const values = assess.map(a => a.total_assessed_value).filter(Boolean);
    const medianValue = values.length > 0 ? values.sort((a,b) => a-b)[Math.floor(values.length/2)] : 0;

    // Price stats
    const prices = sales.map(s => s.sale_price).filter(Boolean);
    const medianPrice = prices.length > 0 ? prices.sort((a,b) => a-b)[Math.floor(prices.length/2)] : 0;

    // Top contractors
    const contractorCounts = {};
    for (const p of [...permits, ...trades]) {
      if (p.contractor_name) contractorCounts[p.contractor_name] = (contractorCounts[p.contractor_name] || 0) + 1;
    }
    const topContractors = Object.entries(contractorCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, permits: count }));

    sendJson(res, {
      data: {
        neighborhood: decoded,
        profile: {
          name: decoded,
          total_sales: sales.length,
          median_price: medianPrice,
          total_blight: blight.length,
          total_permits: permits.length + trades.length,
          total_rentals: rentals.length,
          total_demolitions: demos.length,
          total_dlba_owned: dlba.length,
          total_parcels: assess.length,
          median_assessed_value: medianValue,
        },
        top_investors: topInvestors,
        top_contractors: topContractors,
        sales: {
          total: sales.length,
          median_price: medianPrice,
          total_volume: prices.reduce((a, b) => a + b, 0),
          recent: sales.slice(0, 5).map(s => ({
            id: s.sales_id, addr: s.address, dt: s.sale_date, pr: Number(s.sale_price) || 0,
            ge: s.grantee, gr: s.grantor, lat: s.latitude, lng: s.longitude,
          })),
        },
        permits: {
          total: permits.length,
          types: (() => { const t = {}; permits.forEach(p => { if (p.permit_type) t[p.permit_type] = (t[p.permit_type] || 0) + 1; }); return t; })(),
        },
        trades: {
          total: trades.length,
          top_contractors: topContractors.map(c => ({ name: c.name, count: c.permits })),
        },
        blight: {
          total: blight.length,
          total_fines: blight.reduce((sum, b) => sum + (Number(b.fine_amount) || 0), 0),
          recent: blight.slice(0, 5).map(b => ({
            id: b.ticket_id, addr: '', desc: b.violation_description, fine: Number(b.fine_amount) || 0,
            disp: b.payment_status, dt: b.ticket_issued_date,
          })),
        },
      },
    });
  } catch (err) {
    console.error('Error in /api/neighborhood/[name]:', err);
    sendError(res, 'Internal server error');
  }
};
