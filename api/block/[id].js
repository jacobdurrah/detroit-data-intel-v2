const { handleCors, checkAuth, sendJson, sendError, intParam } = require('../_helpers');
const { supabase } = require('../_supabase');

/**
 * GET /api/block/:id — Full block profile
 * 
 * Returns: street info, all parcels, sales history, blight, permits, block score
 * 
 * The :id is the street_id from the streets table.
 * Can also accept a street name + address range via query params.
 */
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const { id } = req.query;
    if (!id) return sendError(res, 'Block ID (street_id) is required', 400);
    
    const streetId = parseInt(id);
    if (isNaN(streetId)) return sendError(res, 'Invalid street_id', 400);

    // 1. Get street info
    const { data: street } = await supabase.from('streets')
      .select('*')
      .eq('street_id', streetId)
      .single();
    
    if (!street) return sendError(res, 'Block not found', 404);

    // 2. Get all addresses on this block
    const { data: addresses } = await supabase.from('address_street_map')
      .select('address_id, parcel_id, street_number, street_name, street_type, unit_type, unit_number, zip_code, neighborhood, latitude, longitude')
      .eq('street_id', streetId)
      .order('street_number');

    const parcelIds = [...new Set((addresses || []).map(a => a.parcel_id).filter(Boolean))];

    // 3. Get sales history for this block
    const { data: sales } = await supabase.from('sales')
      .select('sales_id, address, sale_date, sale_price, grantor, grantee, terms_of_sale, property_class_desc, neighborhood, latitude, longitude')
      .eq('street_id', streetId)
      .order('sale_date', { ascending: false })
      .limit(200);

    // 4. Get blight tickets for addresses on this block
    const streetName = street.street_name;
    const minAddr = Math.min(
      street.from_addr_left || 99999, street.from_addr_right || 99999
    );
    const maxAddr = Math.max(
      street.to_addr_left || 0, street.to_addr_right || 0
    );
    
    const { data: blight } = await supabase.from('blight')
      .select('ticket_id, street_number, street_name, ticket_issued_date, violation_description, fine_amount, balance_due, disposition, compliance_status')
      .ilike('street_name', streetName)
      .gte('street_number', minAddr)
      .lte('street_number', maxAddr)
      .order('ticket_issued_date', { ascending: false })
      .limit(200);

    // 5. Get permits for this block
    const { data: permits } = await supabase.from('permits')
      .select('permit_no, address, permit_type, permit_issued, description, estimated_cost, contractor_name')
      .eq('street_id', streetId)
      .order('permit_issued', { ascending: false })
      .limit(100);

    // Note: permits may not have street_id yet, fallback to address matching
    let permitData = permits || [];
    if (permitData.length === 0 && addresses && addresses.length > 0) {
      // Try matching by address pattern
      const addrNumbers = addresses.map(a => a.street_number).filter(Boolean);
      if (addrNumbers.length > 0 && streetName) {
        const { data: permitsFallback } = await supabase.from('permits')
          .select('permit_no, address, permit_type, permit_issued, description, estimated_cost, contractor_name')
          .ilike('address', `%${streetName}%`)
          .order('permit_issued', { ascending: false })
          .limit(100);
        permitData = (permitsFallback || []).filter(p => {
          const num = parseInt(p.address);
          return num >= minAddr && num <= maxAddr;
        });
      }
    }

    // 6. Compute block score
    const salesData = sales || [];
    const blightData = blight || [];
    const addrCount = (addresses || []).length;
    
    const now = new Date();
    const oneYearAgo = new Date(now - 365 * 24 * 60 * 60 * 1000);
    const recentSales = salesData.filter(s => new Date(s.sale_date) >= oneYearAgo);
    const armsLengthSales = salesData.filter(s => s.terms_of_sale && s.terms_of_sale.includes('ARM'));
    const recentArmsLength = armsLengthSales.filter(s => new Date(s.sale_date) >= oneYearAgo);
    const recentBlight = blightData.filter(b => new Date(b.ticket_issued_date) >= oneYearAgo);
    
    // Price analysis
    const allPrices = salesData.filter(s => s.sale_price > 0).map(s => s.sale_price);
    const recentPrices = recentSales.filter(s => s.sale_price > 0).map(s => s.sale_price);
    const alPrices = armsLengthSales.filter(s => s.sale_price > 0).map(s => s.sale_price);
    
    const avg = arr => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const median = arr => {
      if (!arr.length) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    };

    // Unique buyers/sellers
    const uniqueBuyers = new Set(salesData.map(s => s.grantee).filter(Boolean));
    const uniqueSellers = new Set(salesData.map(s => s.grantor).filter(Boolean));
    const llcBuyers = [...uniqueBuyers].filter(b => /LLC|INC|CORP|TRUST|AUTHORITY/i.test(b));
    
    // Neighborhoods (from addresses)
    const neighborhoods = [...new Set((addresses || []).map(a => a.neighborhood).filter(Boolean))];
    const zips = [...new Set((addresses || []).map(a => a.zip_code).filter(Boolean))];

    const score = {
      addresses: addrCount,
      unique_parcels: parcelIds.length,
      neighborhoods,
      zip_codes: zips,
      
      // Sales metrics
      total_sales: salesData.length,
      recent_sales_12mo: recentSales.length,
      arms_length_sales: armsLengthSales.length,
      recent_arms_length_12mo: recentArmsLength.length,
      
      // Price metrics
      avg_sale_price: Math.round(avg(allPrices)),
      median_sale_price: Math.round(median(allPrices)),
      avg_al_price: Math.round(avg(alPrices)),
      median_al_price: Math.round(median(alPrices)),
      recent_avg_price: Math.round(avg(recentPrices)),
      
      // Buyer analysis
      unique_buyers: uniqueBuyers.size,
      unique_sellers: uniqueSellers.size,
      llc_buyers: llcBuyers.length,
      investor_pct: uniqueBuyers.size > 0 ? Math.round(100 * llcBuyers.length / uniqueBuyers.size) : 0,
      
      // Blight
      total_blight: blightData.length,
      recent_blight_12mo: recentBlight.length,
      total_fines: blightData.reduce((s, b) => s + (b.fine_amount || 0), 0),
      
      // Permits
      total_permits: permitData.length,
      permit_investment: permitData.reduce((s, p) => s + (p.estimated_cost || 0), 0),
    };

    sendJson(res, {
      data: {
        street,
        score,
        addresses: addresses || [],
        sales: salesData,
        blight: blightData,
        permits: permitData,
      }
    });
  } catch (err) {
    console.error('Error in /api/block/[id]:', err);
    sendError(res, 'Internal server error');
  }
};
