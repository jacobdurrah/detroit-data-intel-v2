const { handleCors, sendJson, sendError, intParam } = require('./_helpers');

let allLoans = null;
let lenderNames = {};

function loadData() {
  if (allLoans) return;
  allLoans = require('./_data/hmda_loans.json');
  if (!Array.isArray(allLoans) && allLoans.data) allLoans = allLoans.data;
  
  const lending = require('./_data/lending.json');
  const lenders = Array.isArray(lending) ? lending : (lending.data || []);
  lenders.forEach(l => {
    if (l.lei) lenderNames[l.lei] = l.name;
  });
}

// Field accessors for both old (full) and new (abbreviated) field names
function getAmt(l) { return l.la || l.amt || l.loan_amount || 0; }
function getRate(l) { return l.ir || l.rate || l.interest_rate || null; }
function getType(l) { return l.lt || l.loan_type || ''; }
function getPurpose(l) { return l.lp || l.loan_purpose || ''; }
function getOcc(l) { return l.occ || l.occupancy || ''; }
function getUnits(l) { return l.tu || l.units || l.total_units || '1'; }
function getBiz(l) { return l.biz || l.is_business || false; }
function getTract(l) { return l.ct || l.census_tract || ''; }
function getYear(l) { return l.yr || l.year || l.activity_year || null; }
function getAddr(l) { return l.addr || l.matched_address || ''; }
function getBuyer(l) { return l.ge || l.matched_grantee || ''; }
function getSeller(l) { return l.gr || l.matched_grantor || ''; }
function getHood(l) { return l.nb || l.matched_neighborhood || ''; }
function getDate(l) { return l.dt || l.matched_date || ''; }
function getPV(l) { return l.pv || l.property_value || null; }

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
    const loanType = (req.query.loan_type || '').toUpperCase();
    const purpose = (req.query.purpose || '').toLowerCase();
    const investment = req.query.investment === 'true' || req.query.investment === '1';
    const yearFilter = intParam(req.query.year, 0);

    let filtered = allLoans;

    if (llc) filtered = filtered.filter(l => getBiz(l));
    if (sub60k) filtered = filtered.filter(l => getAmt(l) > 0 && getAmt(l) <= 60000);
    if (investment) filtered = filtered.filter(l => getOcc(l) === 'Investment');
    if (loanType) filtered = filtered.filter(l => getType(l).toUpperCase() === loanType);
    if (purpose) filtered = filtered.filter(l => getPurpose(l).toLowerCase().includes(purpose));
    if (minAmount > 0) filtered = filtered.filter(l => getAmt(l) >= minAmount);
    if (maxAmount > 0) filtered = filtered.filter(l => getAmt(l) <= maxAmount);
    if (yearFilter > 0) filtered = filtered.filter(l => getYear(l) === yearFilter);
    
    if (neighborhood) {
      filtered = filtered.filter(l => getHood(l).toLowerCase().includes(neighborhood));
    }
    
    if (lender) {
      filtered = filtered.filter(l => {
        const lName = lenderNames[l.lei] || l.ln || l.lei || '';
        return lName.toLowerCase().includes(lender);
      });
    }

    if (search) {
      filtered = filtered.filter(l =>
        getAddr(l).toLowerCase().includes(search) ||
        getBuyer(l).toLowerCase().includes(search) ||
        getSeller(l).toLowerCase().includes(search) ||
        getHood(l).toLowerCase().includes(search) ||
        (lenderNames[l.lei] || l.ln || l.lei || '').toLowerCase().includes(search)
      );
    }

    // Sort
    switch (sort) {
      case 'year_desc':
        filtered.sort((a, b) => (getYear(b) || 0) - (getYear(a) || 0) || getDate(b).localeCompare(getDate(a)));
        break;
      case 'year_asc':
        filtered.sort((a, b) => (getYear(a) || 9999) - (getYear(b) || 9999) || getDate(a).localeCompare(getDate(b)));
        break;
      case 'date_desc':
        filtered.sort((a, b) => (getDate(b) || '0').localeCompare(getDate(a) || '0'));
        break;
      case 'date_asc':
        filtered.sort((a, b) => (getDate(a) || '9').localeCompare(getDate(b) || '9'));
        break;
      case 'amount_desc':
        filtered.sort((a, b) => getAmt(b) - getAmt(a));
        break;
      case 'amount_asc':
        filtered.sort((a, b) => getAmt(a) - getAmt(b));
        break;
      case 'rate_asc':
        filtered.sort((a, b) => (getRate(a) || 999) - (getRate(b) || 999));
        break;
      case 'rate_desc':
        filtered.sort((a, b) => (getRate(b) || 0) - (getRate(a) || 0));
        break;
      default:
        filtered.sort((a, b) => (getYear(b) || 0) - (getYear(a) || 0));
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const paginatedLoans = filtered.slice(start, start + limit).map(l => ({
      loan_amount: getAmt(l),
      interest_rate: getRate(l),
      loan_type: getType(l),
      loan_purpose: getPurpose(l),
      occupancy: getOcc(l),
      total_units: getUnits(l),
      is_business: getBiz(l),
      year: getYear(l),
      census_tract: getTract(l),
      property_value: getPV(l),
      matched_address: getAddr(l),
      matched_grantee: getBuyer(l),
      matched_grantor: getSeller(l),
      matched_neighborhood: getHood(l),
      matched_date: getDate(l),
      lender_name: lenderNames[l.lei] || l.ln || l.lei || 'Unknown',
      lei: l.lei,
    }));

    // Stats
    const rateLoans = filtered.filter(l => getRate(l) > 0);
    const stats = {
      total_loans: total,
      total_volume: filtered.reduce((s, l) => s + getAmt(l), 0),
      avg_amount: total > 0 ? filtered.reduce((s, l) => s + getAmt(l), 0) / total : 0,
      avg_rate: rateLoans.length > 0 ? rateLoans.reduce((s, l) => s + getRate(l), 0) / rateLoans.length : 0,
      llc_count: filtered.filter(l => getBiz(l)).length,
      sub60k_count: filtered.filter(l => getAmt(l) > 0 && getAmt(l) <= 60000).length,
      with_address: filtered.filter(l => getAddr(l)).length,
    };

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
