const { handleCors, checkAuth, sendJson, sendError } = require('../_helpers');
const { supabase } = require('../_supabase');
const { normalizeAddress, parseStreetAddress } = require('../_address');

function emptyResult() {
  return Promise.resolve({ data: [], error: null });
}

function queryBlightByAddress(normalized) {
  // blight stores street_number + street_name separately (no full address column).
  // Matching the full address against either column never hits (e.g. street_name
  // "PENNSYLVANIA" will not ILIKE "%2404 PENNSYLVANIA%").
  const parsed = parseStreetAddress(normalized);
  if (!parsed) return emptyResult();

  return supabase.from('blight').select('*')
    .eq('street_number', parsed.streetNumber)
    .ilike('street_name', parsed.streetName + '%')
    .order('ticket_issued_date', { ascending: false })
    .limit(50);
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const { address } = req.query;
    if (!address) return sendError(res, 'Address parameter is required', 400);

    const raw = decodeURIComponent(address);
    const normalized = normalizeAddress(raw);
    const pattern = `%${normalized}%`;

    // Query all 11 tables in parallel
    const [
      salesRes, blightRes, permitsRes, tradesRes, assessmentRes,
      rentalsRes, presaleRes, demosRes, vacantRes, dlbaOwnedRes, dlbaAuctionRes
    ] = await Promise.all([
      supabase.from('sales').select('*').ilike('address', pattern).order('sale_date', { ascending: false }).limit(50),
      queryBlightByAddress(normalized),
      supabase.from('permits').select('*').ilike('address', pattern).order('permit_issued', { ascending: false }).limit(50),
      supabase.from('trades').select('*').ilike('address', pattern).order('permit_issued', { ascending: false }).limit(50),
      supabase.from('assessment').select('*').ilike('address', pattern).limit(5),
      supabase.from('rentals').select('*').ilike('address', pattern).limit(10),
      supabase.from('presale').select('*').ilike('address', pattern).limit(10),
      supabase.from('demos').select('*').ilike('address', pattern).limit(10),
      supabase.from('vacant').select('*').ilike('address', pattern).limit(10),
      supabase.from('dlba_owned').select('*').ilike('address', pattern).limit(5),
      supabase.from('dlba_auction').select('*').ilike('address', pattern).limit(10),
    ]);

    const sales = salesRes.data || [];
    const blight = blightRes.data || [];
    const permits = permitsRes.data || [];
    const trades = tradesRes.data || [];
    const assessment = assessmentRes.data || [];
    const rentals = rentalsRes.data || [];
    const presale = presaleRes.data || [];
    const demos = demosRes.data || [];
    const vacant = vacantRes.data || [];
    const dlbaOwned = dlbaOwnedRes.data || [];
    const dlbaAuction = dlbaAuctionRes.data || [];

    // Build owner history from sales
    const owners = sales.map(s => ({
      name: s.grantee,
      date: s.sale_date,
      price: s.sale_price,
      from: s.grantor,
    }));

    // Assessment data
    const assess = assessment[0] || null;

    // Motivated seller signals
    const signals = [];
    if (blight.length > 0) signals.push(`${blight.length} blight ticket${blight.length > 1 ? 's' : ''}`);
    const totalFines = blight.reduce((sum, b) => sum + (parseFloat(b.fine_amount) || 0), 0);
    const totalBalance = blight.reduce((sum, b) => sum + (parseFloat(b.balance_due) || 0), 0);
    if (totalFines > 0) signals.push(`$${totalFines.toLocaleString()} in fines`);
    if (totalBalance > 0) signals.push(`$${totalBalance.toLocaleString()} balance due`);
    if (sales.length > 0 && sales[0].sale_price < 60000) signals.push(`Low sale price ($${(sales[0].sale_price || 0).toLocaleString()})`);
    if (sales.length > 1) signals.push(`${sales.length} ownership changes`);
    if (permits.length === 0 && trades.length === 0) signals.push('No permit activity');
    if (dlbaOwned.length > 0) signals.push('DLBA-owned property');
    if (vacant.length > 0) signals.push('Registered vacant');
    if (demos.length > 0) signals.push(`${demos.length} demolition permit${demos.length > 1 ? 's' : ''}`);
    if (presale.length > 0) {
      const failed = presale.filter(p => p.status === 'FAIL' || p.rating === 'FAIL');
      if (failed.length > 0) signals.push(`Failed presale inspection`);
    }

    // Get location from first available record
    const firstRecord = sales[0] || permits[0] || assessment[0] || blight[0] || {};

    sendJson(res, {
      data: {
        address: raw,
        neighborhood: firstRecord.neighborhood || assess?.neighborhood || null,
        lat: firstRecord.latitude || assess?.latitude || null,
        lng: firstRecord.longitude || assess?.longitude || null,
        parcel_id: firstRecord.parcel_id || assess?.parcel_id || null,
        assessment: assess ? {
          assessed_value: assess.total_assessed_value,
          taxable_value: assess.total_taxable_value,
          land_value: assess.land_value,
          improvement_value: assess.improvement_value,
          year_built: assess.year_built,
          bedrooms: assess.bedrooms,
          full_baths: assess.full_baths,
          half_baths: assess.half_baths,
          bldg_class: assess.bldg_class,
          total_floor_area: assess.total_floor_area,
          property_class: assess.property_class,
          owner_name: assess.owner_name,
          tax_status: assess.tax_status,
        } : null,
        rental: rentals.length > 0 ? rentals : null,
        presale: presale.length > 0 ? presale : null,
        dlba_owned: dlbaOwned.length > 0,
        dlba_auction: dlbaAuction.length > 0 ? dlbaAuction : null,
        vacant: vacant.length > 0 ? vacant : null,
        demolitions: demos.length > 0 ? demos : null,
        sales: sales.map(s => ({
          id: s.sales_id, addr: s.address, dt: s.sale_date, pr: s.sale_price,
          ge: s.grantee, gr: s.grantor, nb: s.neighborhood, pid: s.parcel_id,
          terms: s.terms_of_sale, lat: s.latitude, lng: s.longitude,
        })),
        permits: permits.map(p => ({
          id: p.permit_no, addr: p.address, dt: p.permit_issued, type: p.permit_type,
          desc: p.description, cost: p.estimated_cost, contractor: p.contractor_name,
          nb: p.neighborhood, pid: p.parcel_id, lat: p.latitude, lng: p.longitude,
        })),
        trades: trades.map(t => ({
          id: t.permit_no, addr: t.address, dt: t.permit_issued, type: t.permit_type,
          desc: t.description, contractor: t.contractor_name,
          nb: t.neighborhood, pid: t.parcel_id, lat: t.latitude, lng: t.longitude,
        })),
        blight: blight.map(b => ({
          id: b.ticket_id, addr: `${b.street_number || ''} ${b.street_name || ''}`.trim(),
          dt: b.ticket_issued_date, code: b.violation_code, desc: b.violation_description,
          fine: b.fine_amount, judgment: b.judgment_amount, balance: b.balance_due,
          status: b.payment_status, disposition: b.disposition,
          nb: b.neighborhood, lat: b.latitude, lng: b.longitude,
        })),
        owners,
        signals,
        summary: {
          total_sales: sales.length,
          total_permits: permits.length,
          total_trades: trades.length,
          total_blight: blight.length,
          total_fines: totalFines,
          total_balance_due: totalBalance,
          last_sale_date: sales[0]?.sale_date || null,
          last_sale_price: sales[0]?.sale_price || null,
          current_owner: owners[0]?.name || assess?.owner_name || null,
          assessed_value: assess?.total_assessed_value || null,
          year_built: assess?.year_built || null,
        },
      },
    });
  } catch (err) {
    console.error('Error in /api/property/[address]:', err);
    sendError(res, 'Internal server error');
  }
};
