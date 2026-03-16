const { handleCors, sendJson, sendError, intParam } = require('./_helpers');

let allLoans = null;
let lenderNames = {};

function loadData() {
  if (allLoans) return;
  allLoans = require('./_data/hmda_loans.json');
  if (!Array.isArray(allLoans) && allLoans.data) allLoans = allLoans.data;
  
  // Build LEI→name map from lending data
  const lending = require('./_data/lending.json');
  const lenders = Array.isArray(lending) ? lending : (lending.data || []);
  lenders.forEach(l => {
    if (l.lei) lenderNames[l.lei] = l.name;
    else lenderNames[l.name] = l.name; // name is the LEI if no lei field
  });
}

module.exports = async (req, res) => {
  if (handleCors(req, res)) return;

  try {
    loadData();
    
    const page = intParam(req.query.page, 1);
    const limit = Math.min(intParam(req.query.limit, 50), 200);
    const sort = req.query.sort || 'date_desc';
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

    let filtered = allLoans;

    // Filters
    if (llc) filtered = filtered.filter(l => l.is_business === true);
    if (sub60k) filtered = filtered.filter(l => l.loan_amount > 0 && l.loan_amount <= 60000);
    if (investment) filtered = filtered.filter(l => l.occupancy === 'Investment');
    if (loanType) filtered = filtered.filter(l => (l.loan_type || '').toUpperCase() === loanType);
    if (purpose) filtered = filtered.filter(l => (l.loan_purpose || '').toLowerCase().includes(purpose));
    if (minAmount > 0) filtered = filtered.filter(l => l.loan_amount >= minAmount);
    if (maxAmount > 0) filtered = filtered.filter(l => l.loan_amount <= maxAmount);
    
    if (neighborhood) {
      filtered = filtered.filter(l => (l.matched_neighborhood || '').toLowerCase().includes(neighborhood));
    }
    
    if (lender) {
      filtered = filtered.filter(l => {
        const lName = lenderNames[l.lei] || l.lei || '';
        return lName.toLowerCase().includes(lender);
      });
    }

    if (search) {
      filtered = filtered.filter(l =>
        (l.matched_address || '').toLowerCase().includes(search) ||
        (l.matched_grantee || '').toLowerCase().includes(search) ||
        (l.matched_grantor || '').toLowerCase().includes(search) ||
        (l.matched_neighborhood || '').toLowerCase().includes(search) ||
        (lenderNames[l.lei] || l.lei || '').toLowerCase().includes(search)
      );
    }

    // Sort
    switch (sort) {
      case 'date_desc':
        filtered.sort((a, b) => (b.matched_date || '0').localeCompare(a.matched_date || '0'));
        break;
      case 'date_asc':
        filtered.sort((a, b) => (a.matched_date || '9').localeCompare(b.matched_date || '9'));
        break;
      case 'amount_desc':
        filtered.sort((a, b) => (b.loan_amount || 0) - (a.loan_amount || 0));
        break;
      case 'amount_asc':
        filtered.sort((a, b) => (a.loan_amount || 0) - (b.loan_amount || 0));
        break;
      case 'rate_asc':
        filtered.sort((a, b) => (a.interest_rate || 999) - (b.interest_rate || 999));
        break;
      case 'rate_desc':
        filtered.sort((a, b) => (b.interest_rate || 0) - (a.interest_rate || 0));
        break;
      default:
        filtered.sort((a, b) => (b.matched_date || '0').localeCompare(a.matched_date || '0'));
    }

    const total = filtered.length;
    const start = (page - 1) * limit;
    const paginatedLoans = filtered.slice(start, start + limit).map(l => ({
      ...l,
      lender_name: lenderNames[l.lei] || l.lei || 'Unknown',
    }));

    // Aggregate stats for current filter
    const stats = {
      total_loans: total,
      total_volume: filtered.reduce((s, l) => s + (l.loan_amount || 0), 0),
      avg_amount: total > 0 ? filtered.reduce((s, l) => s + (l.loan_amount || 0), 0) / total : 0,
      avg_rate: 0,
      llc_count: filtered.filter(l => l.is_business).length,
      sub60k_count: filtered.filter(l => l.loan_amount > 0 && l.loan_amount <= 60000).length,
      with_address: filtered.filter(l => l.matched_address).length,
    };
    const rateLoans = filtered.filter(l => l.interest_rate > 0);
    stats.avg_rate = rateLoans.length > 0 ? rateLoans.reduce((s, l) => s + l.interest_rate, 0) / rateLoans.length : 0;

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
