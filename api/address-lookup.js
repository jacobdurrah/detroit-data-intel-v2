const { handleCors, checkAuth, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

/**
 * GET /api/address-lookup?q=15852 Wabash
 * 
 * Looks up an address and returns the street_id (block) it belongs to.
 * Parses the number + street name from the query.
 */
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const q = (req.query.q || '').trim().toUpperCase();
    if (!q) return sendError(res, 'Query required', 400);

    // Parse address: "15852 Wabash" → number=15852, street="WABASH"
    const match = q.match(/^(\d+)\s+(.+)/);
    
    if (match) {
      // Address search — find exact or closest match
      const streetNum = parseInt(match[1]);
      const streetName = match[2].replace(/\s+(ST|AVE|DR|BLVD|RD|CT|PL|LN|WAY|CIR|TER|PKWY)\.?$/i, '').trim();

      // Try exact match first
      const { data: exact } = await supabase.from('address_street_map')
        .select('street_id, street_number, street_name, neighborhood, zip_code, parcel_id')
        .eq('street_number', streetNum)
        .ilike('street_name', streetName + '%')
        .limit(5);

      if (exact && exact.length > 0) {
        // Get unique street_ids with their street info
        const streetIds = [...new Set(exact.map(a => a.street_id))];
        const { data: streets } = await supabase.from('streets')
          .select('street_id, street_name, full_street_name, from_addr_left, to_addr_left, from_addr_right, to_addr_right')
          .in('street_id', streetIds);

        const results = (streets || []).map(st => {
          const addr = exact.find(a => a.street_id === st.street_id);
          return {
            street_id: st.street_id,
            full_street_name: st.full_street_name,
            address_range: (st.from_addr_left || st.from_addr_right || '?') + '–' + (st.to_addr_left || st.to_addr_right || '?'),
            neighborhood: addr ? addr.neighborhood : null,
            zip_code: addr ? addr.zip_code : null,
            parcel_id: addr ? addr.parcel_id : null,
            matched_address: streetNum + ' ' + (addr ? addr.street_name : streetName)
          };
        });

        return sendJson(res, { data: results, type: 'address' });
      }

      // No exact match — try fuzzy street name match
      const { data: fuzzy } = await supabase.from('address_street_map')
        .select('street_id, street_name, neighborhood')
        .ilike('street_name', streetName + '%')
        .limit(1);

      if (fuzzy && fuzzy.length > 0) {
        // Find the block that contains this address number
        const { data: blocks } = await supabase.from('streets')
          .select('street_id, street_name, full_street_name, from_addr_left, to_addr_left, from_addr_right, to_addr_right')
          .ilike('street_name', streetName + '%')
          .or(`and(from_addr_left.lte.${streetNum},to_addr_left.gte.${streetNum}),and(from_addr_right.lte.${streetNum},to_addr_right.gte.${streetNum})`)
          .limit(5);

        if (blocks && blocks.length > 0) {
          const results = blocks.map(st => ({
            street_id: st.street_id,
            full_street_name: st.full_street_name,
            address_range: (st.from_addr_left || st.from_addr_right || '?') + '–' + (st.to_addr_left || st.to_addr_right || '?'),
            neighborhood: fuzzy[0].neighborhood,
            matched_address: streetNum + ' ' + streetName
          }));
          return sendJson(res, { data: results, type: 'address' });
        }
      }
    }

    // Fallback: treat as street name search
    const { data: streets } = await supabase.from('streets')
      .select('street_id, street_name, full_street_name, from_addr_left, to_addr_left')
      .ilike('street_name', '%' + q + '%')
      .order('street_name')
      .limit(10);

    const results = (streets || []).map(st => ({
      street_id: st.street_id,
      full_street_name: st.full_street_name,
      address_range: (st.from_addr_left || '?') + '–' + (st.to_addr_left || '?')
    }));

    sendJson(res, { data: results, type: 'street' });
  } catch (err) {
    console.error('Address lookup error:', err);
    sendError(res, 'Lookup failed');
  }
};
