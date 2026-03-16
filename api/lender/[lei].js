const { handleCors, sendError } = require('../_helpers');

let loansData = null;
let lendersData = null;

function loadData() {
  if (!loansData) {
    loansData = require('../_data/hmda_loans.json');
    lendersData = require('../_data/lending.json');
  }
}

// Helper: get field from slim or full format
function amt(l) { return l.amt || l.loan_amount || 0; }
function rate(l) { return l.rate || l.interest_rate || 0; }
function ltype(l) { return l.lt || l.loan_type || ''; }
function lpurpose(l) { return l.lp || l.loan_purpose || ''; }
function isBiz(l) { return l.biz === true || l.is_business === true; }
function tract(l) { return l.ct || l.census_tract || ''; }
function occ(l) { return l.occ || l.occupancy || ''; }
function mAddr(l) { return l.addr || l.matched_address || ''; }
function mBuyer(l) { return l.buyer || l.matched_grantee || ''; }
function mSeller(l) { return l.seller || l.matched_grantor || ''; }
function mNb(l) { return l.nb || l.matched_neighborhood || ''; }
function mDate(l) { return l.dt || l.matched_date || ''; }
function yr(l) { return l.yr || l.year || l.activity_year || ''; }
function units(l) { return l.units || l.total_units || '1'; }

// Expand slim loan to full for API response
function expandLoan(l) {
  return {
    lei: l.lei,
    year: yr(l),
    loan_type: ltype(l),
    loan_purpose: lpurpose(l),
    loan_amount: amt(l),
    interest_rate: rate(l) || null,
    total_units: units(l),
    occupancy: occ(l),
    is_business: isBiz(l),
    matched_address: mAddr(l),
    matched_grantee: mBuyer(l),
    matched_grantor: mSeller(l),
    matched_neighborhood: mNb(l),
    matched_date: mDate(l),
  };
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;
  
  try {
    loadData();
    const { lei } = req.query;
    
    if (!lei) {
      return sendError(res, 'LEI parameter required', 400);
    }

    const lender = lendersData.find(l => l.lei === lei);
    if (!lender) {
      return sendError(res, 'Lender not found', 404);
    }

    const lenderLoans = loansData.filter(l => l.lei === lei);
    
    // Build summary by neighborhood
    const hoodSummary = {};
    lenderLoans.forEach(loan => {
      const hood = mNb(loan) || `Tract ${tract(loan).slice(-6)}`;
      if (!hoodSummary[hood]) {
        hoodSummary[hood] = { count: 0, total_amount: 0, rates: [], types: {} };
      }
      hoodSummary[hood].count++;
      hoodSummary[hood].total_amount += amt(loan);
      if (rate(loan) > 0) hoodSummary[hood].rates.push(rate(loan));
      const lt = ltype(loan) || 'Unknown';
      hoodSummary[hood].types[lt] = (hoodSummary[hood].types[lt] || 0) + 1;
    });

    Object.values(hoodSummary).forEach(s => {
      s.avg_rate = s.rates.length > 0 ? +(s.rates.reduce((a,b) => a+b, 0) / s.rates.length).toFixed(3) : 0;
      delete s.rates;
    });

    const neighborhoods = Object.entries(hoodSummary)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    // Paginated loans
    const { page: pageParam, limit: limitParam, type, purpose, sub60k, business } = req.query;
    const page = parseInt(pageParam) || 1;
    const limit = Math.min(parseInt(limitParam) || 50, 200);

    let filteredLoans = [...lenderLoans];
    
    if (type) filteredLoans = filteredLoans.filter(l => ltype(l) === type);
    if (purpose) filteredLoans = filteredLoans.filter(l => lpurpose(l) === purpose);
    if (sub60k === 'true') filteredLoans = filteredLoans.filter(l => amt(l) > 0 && amt(l) <= 60000);
    if (business === 'true') filteredLoans = filteredLoans.filter(l => isBiz(l));

    // Sort by year desc, then amount desc
    filteredLoans.sort((a, b) => (yr(b) || 0) - (yr(a) || 0) || amt(b) - amt(a));

    const total = filteredLoans.length;
    const start = (page - 1) * limit;
    const paginatedLoans = filteredLoans.slice(start, start + limit).map(expandLoan);

    res.status(200).json({
      data: {
        profile: {
          ...lender,
          total_business_loans: lenderLoans.filter(l => isBiz(l)).length,
          business_sub_60k: lenderLoans.filter(l => isBiz(l) && amt(l) > 0 && amt(l) <= 60000).length,
        },
        neighborhoods,
        loans: paginatedLoans,
      },
      meta: { total, page, limit, pages: Math.ceil(total / limit) }
    });
  } catch (err) {
    console.error('Error in /api/lender/[lei]:', err);
    sendError(res, 'Internal server error');
  }
};
