const { handleCors, sendPaginated, sendError, intParam, floatParam, parseBounds, filterByBounds } = require('./_helpers');

let salesData = null;

function loadData() {
  if (!salesData) {
    salesData = require('./_data/sales.json');
  }
  return salesData;
}

/**
 * Expand compact field names to full names for API response
 */
function expandSale(s) {
  return {
    id: s.id,
    parcel_id: s.pid,
    address: s.addr,
    sale_date: s.dt,
    sale_price: s.pr,
    grantor: s.gr,
    grantee: s.ge,
    term_of_sale: s.tos,
    sale_instrument: s.si,
    property_class_code: s.pcc,
    property_class_description: s.pcd,
    neighborhood: s.nb,
    ecf_neighborhood: s.ecf,
    council_district: s.cd,
    zip: s.zip,
    lat: s.lat,
    lng: s.lng,
  };
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const data = loadData();
    const {
      bounds, neighborhood, grantee, grantor,
      min_price, max_price, date_from, date_to,
      limit: limitParam, page: pageParam,
    } = req.query;

    const limit = intParam(limitParam, 500);
    const page = intParam(pageParam, 1);
    const parsedBounds = parseBounds(bounds);

    let filtered = data;

    // Filter by bounding box
    if (parsedBounds) {
      filtered = filterByBounds(filtered, parsedBounds);
    }

    // Filter by neighborhood
    if (neighborhood) {
      const nb = neighborhood.toLowerCase();
      filtered = filtered.filter(s => s.nb && s.nb.toLowerCase() === nb);
    }

    // Filter by grantee
    if (grantee) {
      const ge = grantee.toLowerCase();
      filtered = filtered.filter(s => s.ge && s.ge.toLowerCase().includes(ge));
    }

    // Filter by grantor
    if (grantor) {
      const gr = grantor.toLowerCase();
      filtered = filtered.filter(s => s.gr && s.gr.toLowerCase().includes(gr));
    }

    // Filter by min_price
    const minPrice = floatParam(min_price);
    if (minPrice !== null) {
      filtered = filtered.filter(s => s.pr != null && s.pr >= minPrice);
    }

    // Filter by max_price
    const maxPrice = floatParam(max_price);
    if (maxPrice !== null) {
      filtered = filtered.filter(s => s.pr != null && s.pr <= maxPrice);
    }

    // Filter by date_from
    if (date_from) {
      filtered = filtered.filter(s => s.dt && s.dt >= date_from);
    }

    // Filter by date_to
    if (date_to) {
      filtered = filtered.filter(s => s.dt && s.dt <= date_to);
    }

    // Expand field names for response
    const expanded = filtered.map(expandSale);

    sendPaginated(res, expanded, page, limit);
  } catch (err) {
    console.error('Error in /api/sales:', err);
    sendError(res, 'Internal server error');
  }
};
