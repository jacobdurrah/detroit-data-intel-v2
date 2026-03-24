const { handleCors, checkAuth, sendJson, sendError, intParam } = require('./_helpers');
const { supabase } = require('./_supabase');

/**
 * Find a Contractor API — powered by PostgreSQL Full-Text Search
 * 
 * Query params:
 *   q         - Natural language search (e.g., "furnace install", "plumbing repair")
 *   zip       - ZIP code filter (e.g., "48214")
 *   lat/lng   - Coordinates for proximity ranking
 *   radius    - Radius in miles (default 5)
 *   limit     - Max results (default 20)
 *   page      - Page number
 *   near      - Address string (geocoded to lat/lng via zip lookup)
 */

// Detroit zip code approximate centers
const ZIP_COORDS = {
  "48201": [42.346, -83.062], "48202": [42.375, -83.075], "48203": [42.411, -83.118],
  "48204": [42.370, -83.130], "48205": [42.437, -82.980], "48206": [42.381, -83.098],
  "48207": [42.347, -83.016], "48208": [42.344, -83.092], "48209": [42.304, -83.112],
  "48210": [42.332, -83.132], "48211": [42.383, -83.054], "48212": [42.410, -83.035],
  "48213": [42.398, -82.981], "48214": [42.370, -82.980], "48215": [42.385, -82.930],
  "48216": [42.325, -83.075], "48217": [42.276, -83.155], "48219": [42.420, -83.245],
  "48221": [42.425, -83.150], "48223": [42.390, -83.242], "48224": [42.413, -82.936],
  "48225": [42.430, -82.970], "48226": [42.332, -83.048], "48227": [42.395, -83.192],
  "48228": [42.358, -83.210], "48234": [42.438, -83.055], "48235": [42.418, -83.178],
  "48236": [42.425, -82.900], "48238": [42.393, -83.155], "48239": [42.380, -83.245],
  "48240": [42.400, -83.262],
};

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const q = req.query.q || '';
    const zip = req.query.zip || '';
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 20), 100);
    const radius = parseFloat(req.query.radius) || 5;

    // Determine geo center from zip or explicit lat/lng
    let lat = parseFloat(req.query.lat) || null;
    let lng = parseFloat(req.query.lng) || null;

    if (!lat && zip && ZIP_COORDS[zip]) {
      [lat, lng] = ZIP_COORDS[zip];
    }

    // Use the PostgreSQL FTS RPC
    const { data, error } = await supabase.rpc('search_contractors', {
      p_query: q || 'contractor',
      p_zip: zip || null,
      p_lat: lat,
      p_lng: lng,
      p_radius_miles: radius,
      p_limit: limit,
      p_offset: (page - 1) * limit,
    });

    if (error) {
      console.error('Contractor FTS error:', error);
      return sendError(res, 'Search failed: ' + error.message);
    }

    const results = (data || []).map(c => ({
      id: c.id,
      name: c.name,
      specialties: c.specialties || [],
      permit_types: c.permit_types || [],
      total_permits: c.total_permits,
      recent_permits: c.recent_permits,
      neighborhoods: c.neighborhoods || [],
      zip_codes: c.zip_codes || [],
      distance_miles: c.distance_miles ? Math.round(c.distance_miles * 10) / 10 : null,
      phone: c.phone,
      website: c.website,
      rating: c.rating,
      business_address: c.business_address,
      sample_work: c.sample_descriptions || [],
      last_active: c.last_permit_date,
      relevance: Math.round((c.rank || 0) * 1000) / 1000,
    }));

    sendJson(res, {
      data: results,
      meta: {
        total: results.length,
        page, limit,
        query: q,
        zip: zip || null,
        geo: lat ? { lat, lng, radius } : null,
        engine: 'postgres_fts',
      },
    });
  } catch (err) {
    console.error('Error in /api/find-contractor:', err);
    sendError(res, 'Internal server error');
  }
};
