const { handleCors, sendJson, sendError, intParam } = require('./_helpers');

let allLoans = null;
let lenderNames = {};

function loadData() {
  if (allLoans) return;
  const raw = require('./_data/hmda_loans.json');
  allLoans = Array.isArray(raw) ? raw : (raw.data || []);
  
  // Build LEI→name map
  const lending = require('./_data/lending.json');
  const lenders = Array.isArray(lending) ? lending : (lending.data || []);
  lenders.forEach(l => {
    lenderNames[l.lei] = l.name;
  });
}

// Map slim fields to full names for API response
function expandLoan(l) {
  return {
    lei: l.lei,
    lender_name: lenderNames[l.lei] || l.lei || 'Unknown',
    year: l.yr,
    loan_type: l.lt,
    loan_purpose: l.lp,
    loan_amount: l.amt,
    interest_rate: l.rate || null,
    property_value: l.pv || null,
    total_units: l.units || '1',
    occupancy: l.occ,
    census_tract: l.ct,
    is_business: l.biz,
    matched_address: l.addr || null,
    matched_grantee: l.buyer || null,
    matched_grantor: l.seller || null,
    matched_neighborhood: l.nb || null,
    matched_date: l.dt || null,
  };
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    loadData();
    
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 50), 200);
    const sort = req.query.sort || 'year_desc';
    const llc = req.query.llc === 'true' || req.query.llc === '1';
    const sub60k = req.query.sub60k === 'true' || req.query.sub60k === '1';
    const search = (req.query.q || '').toLowerCase().trim();
    const neighborhood = (req.query.neighborhood || '').toLowerCase().trim();
    const lender = (req.query.lender || '').toLowerCase().trim();
    const minAmount = intParam(req.query.min_amount, 0);
    const maxAmount = intParam(req.query.max_amount, 0);
    const loanType = (req.query.loan_type || '');
    const purpose = (req.query.purpose || '').toLowerCase();
    const investment = req.query.investment === 'true' || req.query.investment === '1';
    const year = intParam(req.query.year, 0);

    let filtered = allLoans;

    // Filters
    if (llc) filtered = filtered.filter(l => l.biz === true);
    if (sub60k) filtered = filtered.filter(l => l.amt > 0 && l.amt <= 60000);
    if (investment) filtered = filtered.filter(l => l.occ === 'Investment');
    if (loanType) filtered = filtered.filter(l => (l.lt || '').toLowerCase() === loanType.toLowerCase());
    if (purpose) filtered = filtered.filter(l => (l.lp || '').toLowerCase().includes(purpose));
    if (minAmount > 0) filtered = filtered.filter(l => l.amt >= minAmount);
    if (maxAmount > 0) filtered = filtered.filter(l => l.amt <= maxAmount);
    if (year > 0) filtered = filtered.filter(l => l.yr === year);
    
    if (neighborhood) {
      filtered = filtered.filter(l => (l.nb || '').toLowerCase().includes(neighborhood));
    }
    
    if (lender) {
      filtered = filtered.filter(l => {
        const lName = lenderNames[l.lei] || l.lei || '';
        return lName.toLowerCase().includes(lender);
      });
    }

    if (search) {
      filtered = filtered.filter(l =>
        (l.addr || '').toLowerCase().includes(search) ||
        (l.buyer || '').toLowerCase().includes(search) ||
        (l.seller || '').toLowerCase().includes(search) ||
        (l.nb || '').toLowerCase().includes(search) ||
        (lenderNames[l.lei] || l.lei || '').toLowerCase().includes(search)
      );
    }

    // Sort
    switch (sort) {
      case 'year_desc':
        filtered.sort((a, b) => (b.yr || 0) - (a.yr || 0) || (b.dt || '0').localeCompare(a.dt || '0'));
        break;
      case 'year_asc':
        filtered.sort((a, b) => (a.yr || 9999) - (b.yr || 9999));
        break;
      case 'date_desc':
        filtered.sort((a, b) => (b.dt || '0').localeCompare(a.dt || '0'));
        break;
      case 'date_asc':
        filtered.sort((a, b) => (a.dt || '9').localeCompare(b.dt || '9'));
        break;
      case 'amount_desc':
        filtered.sort((a, b) => (b.amt || 0) - (a.amt || 0));
        break;
      case 'amount_asc':
        filtered.sort((a, b) => (a.amt || 0) - (b.amt || 0));
        break;
      case 'rate_asc':
        filtered.sort((a, b) => (a.rate || 999) - (b.rate || 999));
        break;
      case 'rate_desc':
        filtered.sort((a, b) => (b.rate || 0) - (a.rate || 0));
        break;
      default:
        filtered.sort((a, b) => (b.yr || 0) - (a.yr || 0));
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const paginatedLoans = filtered.slice(start, start + limit).map(expandLoan);

    // Aggregate stats
    const stats = {
      total_loans: total,
      total_volume: filtered.reduce((s, l) => s + (l.amt || 0), 0),
      avg_amount: total > 0 ? Math.round(filtered.reduce((s, l) => s + (l.amt || 0), 0) / total) : 0,
      avg_rate: 0,
      llc_count: filtered.filter(l => l.biz).length,
      sub60k_count: filtered.filter(l => l.amt > 0 && l.amt <= 60000).length,
      with_address: filtered.filter(l => l.addr).length,
    };
    const rateLoans = filtered.filter(l => l.rate > 0);
    stats.avg_rate = rateLoans.length > 0 ? Math.round(rateLoans.reduce((s, l) => s + l.rate, 0) / rateLoans.length * 100) / 100 : 0;

    // Year breakdown
    const yearCounts = {};
    filtered.forEach(l => { yearCounts[l.yr] = (yearCounts[l.yr] || 0) + 1; });
    stats.by_year = yearCounts;

    sendJson(res, {
      data: paginatedLoans,
      stats,
      meta: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Error in /api/loans:', err);
    sendError(res, 'Internal server error');
  }
};
