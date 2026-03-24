const { handleCors, checkAuth, sendJson, sendError, intParam } = require('./_helpers');
const { supabase } = require('./_supabase');

/**
 * Pipeline / Motivated Sellers endpoint
 * Returns property-level data with investment scores based on signals:
 * - Recent sales at low prices (DLBA, tax foreclosure, distressed)
 * - Blight history
 * - Permit activity (renovation signal)
 * - Multiple ownership changes (flip indicator)
 */
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 20), 100);
    const minScore = intParam(req.query.min_score, 50);
    const nbFilter = req.query.neighborhood || '';

    // Get recent sales with relevant signals
    let salesQuery = supabase.from('sales')
      .select('sales_id, address, sale_date, sale_price, grantor, grantee, neighborhood, parcel_id, latitude, longitude, terms_of_sale')
      .not('address', 'is', null)
      .order('sale_date', { ascending: false })
      .limit(5000);

    if (nbFilter) {
      salesQuery = salesQuery.ilike('neighborhood', `%${nbFilter}%`);
    }

    const { data: sales } = await salesQuery;

    // Get blight counts by parcel for scoring
    const { data: blightCounts } = await supabase.from('blight')
      .select('street_name, neighborhood')
      .not('street_name', 'is', null)
      .limit(50000);

    // Build blight index by street
    const blightByStreet = {};
    for (const b of (blightCounts || [])) {
      const key = (b.street_name || '').toUpperCase();
      blightByStreet[key] = (blightByStreet[key] || 0) + 1;
    }

    // Score each property
    const scored = [];
    const seen = new Set();

    for (const s of (sales || [])) {
      if (!s.address || seen.has(s.address)) continue;
      seen.add(s.address);

      let score = 0;
      const reasons = [];

      // Low price signals (DLBA, foreclosure, distressed)
      const price = s.sale_price || 0;
      if (price > 0 && price <= 5000) { score += 25; reasons.push('Very low sale price (<$5K)'); }
      else if (price > 5000 && price <= 20000) { score += 20; reasons.push('Low sale price (<$20K)'); }
      else if (price > 20000 && price <= 50000) { score += 15; reasons.push('Below-market price (<$50K)'); }
      else if (price > 50000 && price <= 100000) { score += 10; reasons.push('Moderate price'); }

      // Seller type signals
      const grantor = (s.grantor || '').toUpperCase();
      if (grantor.includes('LAND BANK') || grantor.includes('DLBA')) { score += 20; reasons.push('DLBA seller'); }
      else if (grantor.includes('SHERIFF') || grantor.includes('FORECLOS')) { score += 15; reasons.push('Foreclosure sale'); }
      else if (grantor.includes('FANNIE MAE') || grantor.includes('FREDDIE') || grantor.includes('HUD')) { score += 15; reasons.push('Government/GSE seller'); }
      else if (grantor.includes('BANK') || grantor.includes('MORTGAGE') || grantor.includes('TRUST')) { score += 10; reasons.push('Bank/lender seller'); }

      // Terms of sale signals
      const terms = (s.terms_of_sale || '').toUpperCase();
      if (terms.includes('GOVERNMENT')) { score += 10; reasons.push('Government transfer'); }
      else if (terms.includes('FORECLOSURE') || terms.includes('SHERIFF')) { score += 10; reasons.push('Foreclosure terms'); }

      // Blight on this street = opportunity or risk
      const streetName = s.address.replace(/^\d+\s+/, '').toUpperCase();
      const streetBlight = blightByStreet[streetName] || 0;
      if (streetBlight > 20) { score += 5; reasons.push(`High blight area (${streetBlight} tickets on street)`); }

      // Recent sale bonus
      const saleDate = new Date(s.sale_date);
      const daysSinceSale = (Date.now() - saleDate.getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceSale <= 30) { score += 5; reasons.push('Sold in last 30 days'); }
      else if (daysSinceSale <= 90) { score += 3; reasons.push('Sold in last 90 days'); }

      score = Math.min(100, score);

      if (score >= minScore) {
        scored.push({
          address: s.address,
          score,
          price: s.sale_price,
          date: s.sale_date,
          grantor: s.grantor,
          grantee: s.grantee,
          neighborhood: s.neighborhood,
          parcel_id: s.parcel_id,
          lat: s.latitude,
          lng: s.longitude,
          reasons,
        });
      }
    }

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score || new Date(b.date) - new Date(a.date));

    const start = (page - 1) * limit;
    sendJson(res, {
      data: scored.slice(start, start + limit),
      meta: { total: scored.length, page, limit },
    });
  } catch (err) {
    console.error('Error in /api/sellers:', err);
    sendError(res, 'Internal server error');
  }
};
