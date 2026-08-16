const { handleCors, checkAuth, sendJson, sendError } = require('./_helpers');
const { supabase } = require('./_supabase');

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

  try {
    const { bounds, layers, layer, limit: limitParam, time_range } = req.query;
    const maxPoints = Math.min(parseInt(limitParam) || 2000, 5000);

    if (!bounds) return sendError(res, 'bounds parameter required (sw_lat,sw_lng,ne_lat,ne_lng)', 400);

    const parts = bounds.split(',').map(Number);
    if (parts.length !== 4 || parts.some(isNaN)) return sendError(res, 'Invalid bounds format', 400);

    const [sw_lat, sw_lng, ne_lat, ne_lng] = parts;
    const activeLayers = (layers || layer || 'sales').split(',');

    // Time range filter
    let cutoffDate = null;
    if (time_range && time_range !== 'all') {
      const months = { '6m': 6, '1y': 12, '2y': 24, '5y': 60 }[time_range] || 0;
      if (months > 0) {
        const d = new Date();
        d.setMonth(d.getMonth() - months);
        cutoffDate = d.toISOString().split('T')[0];
      }
    }

    const results = {};

    const queryTable = async (table, selectCols, latCol = 'latitude', lngCol = 'longitude', dateCol = null) => {
      let query = supabase.from(table)
        .select(selectCols)
        .gte(latCol, sw_lat).lte(latCol, ne_lat)
        .gte(lngCol, sw_lng).lte(lngCol, ne_lng)
        .not(latCol, 'is', null);
      if (dateCol && cutoffDate) {
        query = query.gte(dateCol, cutoffDate);
      }
      const { data } = await query.limit(maxPoints);
      return data || [];
    };

    if (activeLayers.includes('sales')) {
      results.sales = (await queryTable('sales', 'sales_id, address, sale_price, sale_date, grantee, neighborhood, latitude, longitude', 'latitude', 'longitude', 'sale_date'))
        .map(s => ({ id: s.sales_id, addr: s.address, pr: s.sale_price, dt: s.sale_date, ge: s.grantee, nb: s.neighborhood, lat: s.latitude, lng: s.longitude, type: 'sale' }));
    }
    if (activeLayers.includes('permits')) {
      results.permits = (await queryTable('permits', 'permit_no, address, permit_type, permit_issued, permit_status, description, estimated_cost, contractor_name, bld_type_use, neighborhood, council_district, latitude, longitude', 'latitude', 'longitude', 'permit_issued'))
        .map(p => ({ id: p.permit_no, addr: p.address, type_detail: p.permit_type, dt: p.permit_issued, status: p.permit_status, desc: p.description, cost: p.estimated_cost, contractor: p.contractor_name, owner: p.bld_type_use, nb: p.neighborhood, cd: p.council_district, lat: p.latitude, lng: p.longitude, type: 'permit' }));
    }
    if (activeLayers.includes('trades')) {
      results.trades = (await queryTable('trades', 'permit_no, address, permit_type, permit_issued, description, contractor_name, neighborhood, council_district, latitude, longitude', 'latitude', 'longitude', 'permit_issued'))
        .map(t => ({ id: t.permit_no, addr: t.address, type_detail: t.permit_type, dt: t.permit_issued, desc: t.description, contractor: t.contractor_name, nb: t.neighborhood, cd: t.council_district, lat: t.latitude, lng: t.longitude, type: 'trade' }));
    }
    if (activeLayers.includes('blight')) {
      results.blight = (await queryTable('blight', 'ticket_id, street_number, street_name, violation_description, fine_amount, balance_due, ticket_issued_date, neighborhood, latitude, longitude', 'latitude', 'longitude', 'ticket_issued_date'))
        .map(b => ({ id: b.ticket_id, addr: `${b.street_number || ''} ${b.street_name || ''}`.trim(), desc: b.violation_description, fine: b.fine_amount, balance: b.balance_due, dt: b.ticket_issued_date, nb: b.neighborhood, lat: b.latitude, lng: b.longitude, type: 'blight' }));
    }
    if (activeLayers.includes('demos')) {
      results.demos = (await queryTable('demos', 'permit_no, address, permit_issued, permit_status, bld_type_use, contractor_name, neighborhood, council_district, latitude, longitude', 'latitude', 'longitude', 'permit_issued'))
        .map(d => ({ id: d.permit_no, addr: d.address, dt: d.permit_issued, desc: d.permit_status, owner: d.bld_type_use, contractor: d.contractor_name, nb: d.neighborhood, cd: d.council_district, lat: d.latitude, lng: d.longitude, type: 'demo' }));
    }
    if (activeLayers.includes('rentals')) {
      results.rentals = (await queryTable('rentals', 'certificate_number, address, rental_type, owner_name, neighborhood, latitude, longitude'))
        .map(r => ({ id: r.certificate_number, addr: r.address, rental_type: r.rental_type, owner: r.owner_name, nb: r.neighborhood, lat: r.latitude, lng: r.longitude, type: 'rental' }));
    }
    if (activeLayers.includes('dlba')) {
      results.dlba = (await queryTable('dlba_owned', 'parcel_id, address, neighborhood, property_class, latitude, longitude'))
        .map(d => ({ id: d.parcel_id, addr: d.address, nb: d.neighborhood, class: d.property_class, lat: d.latitude, lng: d.longitude, type: 'dlba' }));
    }
    if (activeLayers.includes('crime')) {
      results.crime = (await queryTable('crime', 'crime_id, address, offense_category, offense_description, incident_timestamp, neighborhood, latitude, longitude', 'latitude', 'longitude', 'incident_timestamp'))
        .map(c => ({ id: c.crime_id, addr: c.address, type_detail: c.offense_category, desc: c.offense_description, dt: c.incident_timestamp, nb: c.neighborhood, lat: c.latitude, lng: c.longitude, type: 'crime' }));
    }
    if (activeLayers.includes('vacant')) {
      results.vacant = (await queryTable('vacant', 'task_id, address, owner_name, neighborhood, latitude, longitude'))
        .map(v => ({ id: v.task_id, addr: v.address, owner: v.owner_name, nb: v.neighborhood, lat: v.latitude, lng: v.longitude, type: 'vacant' }));
    }
    if (activeLayers.includes('newbuilds')) {
      // New construction permits: permit_type='New' OR description contains 'Construct New'
      let nbQuery = supabase.from('permits')
        .select('permit_no, address, permit_type, permit_issued, permit_status, description, estimated_cost, contractor_name, bld_type_use, neighborhood, council_district, latitude, longitude')
        .gte('latitude', sw_lat).lte('latitude', ne_lat)
        .gte('longitude', sw_lng).lte('longitude', ne_lng)
        .not('latitude', 'is', null)
        .or('permit_type.eq.New,description.ilike.%construct new%,description.ilike.%new construction%,description.ilike.%new build%');
      if (cutoffDate) nbQuery = nbQuery.gte('permit_issued', cutoffDate);
      const { data: nbData } = await nbQuery.limit(maxPoints);
      results.newbuilds = (nbData || []).map(p => ({
        id: p.permit_no, addr: p.address, type_detail: p.permit_type, dt: p.permit_issued,
        status: p.permit_status, desc: p.description, cost: p.estimated_cost,
        contractor: p.contractor_name, owner: p.bld_type_use, nb: p.neighborhood,
        cd: p.council_district, lat: p.latitude, lng: p.longitude, type: 'newbuild'
      }));
    }

    if (activeLayers.includes('density')) {
      // Census tract population density — no time filter (static data)
      let dQuery = supabase.from('census_tracts')
        .select('geoid, tract_name, population, housing_units, median_income, median_home_value, area_sqmi, pop_density_sqmi, latitude, longitude')
        .gte('latitude', sw_lat).lte('latitude', ne_lat)
        .gte('longitude', sw_lng).lte('longitude', ne_lng)
        .gt('population', 0);
      const { data: dData } = await dQuery.order('pop_density_sqmi', { ascending: false }).limit(500);
      results.density = (dData || []).map(t => ({
        id: t.geoid, name: t.tract_name, pop: t.population, hu: t.housing_units,
        inc: t.median_income, hv: t.median_home_value, area: t.area_sqmi,
        density: t.pop_density_sqmi, lat: t.latitude, lng: t.longitude, type: 'density'
      }));
    }
    if (activeLayers.includes('leadreplace')) {
      // DWSD Lead Service Line Replacement program
      let lrQuery = supabase.from('trades')
        .select('permit_no, address, permit_type, permit_issued, description, contractor_name, neighborhood, council_district, latitude, longitude')
        .gte('latitude', sw_lat).lte('latitude', ne_lat)
        .gte('longitude', sw_lng).lte('longitude', ne_lng)
        .not('latitude', 'is', null)
        .or('description.ilike.%DWSD%LEAD%,description.ilike.%DWSD%LSLR%,description.ilike.%LEAD SERVICE%REPLACEMENT%');
      if (cutoffDate) lrQuery = lrQuery.gte('permit_issued', cutoffDate);
      const { data: lrData } = await lrQuery.order('permit_issued', { ascending: false }).limit(maxPoints);
      results.leadreplace = (lrData || []).map(t => ({
        id: t.permit_no, addr: t.address, type_detail: t.permit_type, dt: t.permit_issued,
        desc: t.description, contractor: t.contractor_name, nb: t.neighborhood,
        cd: t.council_district, lat: t.latitude, lng: t.longitude, type: 'leadreplace'
      }));
    }
    if (activeLayers.includes('foreclosures')) {
      // Foreclosure & REO sales — properties that went through forced sale
      const fcTerms = ['10-FORECLOSURE', '11-FROM LENDING INSTITUTION EXPOSED', '12-FROM LENDING INSTITUTION NOT EXPOSED', '06-COURT JUDGEMENT'];
      let fcQuery = supabase.from('sales')
        .select('sales_id, address, sale_price, sale_date, grantee, grantor, terms_of_sale, neighborhood, parcel_id, latitude, longitude')
        .gte('latitude', sw_lat).lte('latitude', ne_lat)
        .gte('longitude', sw_lng).lte('longitude', ne_lng)
        .not('latitude', 'is', null)
        .in('terms_of_sale', fcTerms);
      if (cutoffDate) fcQuery = fcQuery.gte('sale_date', cutoffDate);
      const { data: fcData } = await fcQuery.order('sale_date', { ascending: false }).limit(maxPoints);
      results.foreclosures = (fcData || []).map(s => ({
        id: s.sales_id, addr: s.address, pr: s.sale_price, dt: s.sale_date,
        ge: s.grantee, gr: s.grantor, tos: s.terms_of_sale,
        nb: s.neighborhood, pid: s.parcel_id,
        lat: s.latitude, lng: s.longitude, type: 'foreclosure'
      }));
    }

    const totalPoints = Object.values(results).reduce((sum, arr) => sum + arr.length, 0);

    const isSingle = activeLayers.length === 1;
    const responseData = isSingle ? (results[activeLayers[0]] || []) : results;

    sendJson(res, {
      data: responseData,
      points: isSingle ? responseData : undefined,
      meta: { total: totalPoints, bounds: { sw_lat, sw_lng, ne_lat, ne_lng }, layers: activeLayers },
    });
  } catch (err) {
    console.error('Error in /api/map-tiles:', err);
    sendError(res, 'Internal server error');
  }
};
