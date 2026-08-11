const { handleCors, checkAuth, sendJson, sendError, intParam } = require('./_helpers');
const { supabase } = require('./_supabase');

/**
 * GET /api/contractors — Ranked contractor list
 *
 * Reads the pre-aggregated `contractor_directory` table (built from the full
 * permits + trades corpus). Never sample raw permit/trade rows and group in
 * memory — `.limit(5000)` on ~43k permits / ~125k trades hard-caps and
 * mis-ranks the list (top firms alone exceed 5k permits).
 *
 * Query params:
 *   search|q   — name ILIKE filter
 *   specialty  — match directory.specialties (text[])
 *   neighborhood — match directory.neighborhoods (text[])
 *   sort       — total_permits (default) | name | recent_permits
 *   page, limit
 */
module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 50), 200);
    const offset = (page - 1) * limit;
    const search = String(req.query.search || req.query.q || '').trim();
    const specialty = String(req.query.specialty || '').trim();
    const neighborhood = String(req.query.neighborhood || '').trim();
    const sort = String(req.query.sort || 'total_permits').trim();

    let query = supabase
      .from('contractor_directory')
      .select(
        // Columns known on contractor_directory (see chat.js schema + resolve_* scripts).
        'name, total_permits, recent_permits, specialties, permit_types, neighborhoods, last_permit_date, phone, website, business_address',
        { count: 'exact' }
      )
      .gt('total_permits', 0);

    if (search) {
      query = query.ilike('name', `%${search}%`);
    }
    if (specialty) {
      // Directory stores specialty labels in text[]; overlaps matches any selected tag.
      query = query.overlaps('specialties', [specialty]);
    }
    if (neighborhood) {
      query = query.overlaps('neighborhoods', [neighborhood]);
    }

    if (sort === 'name') {
      query = query.order('name', { ascending: true });
    } else if (sort === 'recent_permits') {
      query = query.order('recent_permits', { ascending: false });
    } else {
      query = query.order('total_permits', { ascending: false });
    }

    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) {
      console.error('Contractors directory query error:', error);
      return sendError(res, 'Failed to load contractors: ' + error.message);
    }

    const contractors = (data || []).map((c) => {
      const specialties = Array.isArray(c.specialties) ? c.specialties : [];
      const neighborhoods = Array.isArray(c.neighborhoods) ? c.neighborhoods : [];
      const permitTypes = Array.isArray(c.permit_types) ? c.permit_types : [];
      return {
        name: c.name,
        total_permits: c.total_permits || 0,
        recent_permits: c.recent_permits || 0,
        top_specialty: specialties[0] || permitTypes[0] || null,
        top_neighborhood: neighborhoods[0] || null,
        neighborhood_count: neighborhoods.length,
        neighborhoods,
        specialties,
        most_recent: c.last_permit_date || null,
        contact_address: c.business_address || null,
        phone: c.phone || null,
        website: c.website || null,
      };
    });

    sendJson(res, {
      data: contractors,
      meta: { total: count || 0, page, limit },
    });
  } catch (err) {
    console.error('Error in /api/contractors:', err);
    sendError(res, 'Internal server error');
  }
};
