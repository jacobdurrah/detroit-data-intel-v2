const { handleCors, sendError } = require('../_helpers');
const path = require('path');

let loansData = null;
let lendersData = null;

function loadData() {
  if (!loansData) {
    loansData = require('../_data/hmda_loans.json');
    lendersData = require('../_data/lending.json');
  }
}

// Census tract to neighborhood mapping (Detroit tracts)
const TRACT_TO_HOOD = {
  '26163500100': 'Downtown', '26163500200': 'Downtown', '26163501200': 'Corktown',
  '26163512100': 'Midtown', '26163512200': 'Midtown', '26163514100': 'New Center',
  '26163515100': 'North End', '26163516100': 'Palmer Park', '26163517100': 'University District',
  '26163518100': 'Bagley', '26163519100': 'Warrendale', '26163520100': 'Brightmoor',
  '26163521100': 'Rosedale Park', '26163522100': 'Grandmont',
  '26163523100': 'Cody Rouge', '26163524100': 'Cornerstone Village',
  '26163525100': 'East English Village', '26163526100': 'Indian Village',
  '26163527100': 'West Village', '26163528100': 'Jefferson Chalmers',
  '26163529100': 'Morningside', '26163530100': 'Regent Park',
};

module.exports = (req, res) => {
  if (handleCors(req, res)) return;
  
  try {
    loadData();
    const { lei } = req.query;
    
    if (!lei) {
      return sendError(res, 'LEI parameter required', 400);
    }

    // Find lender profile
    const lender = lendersData.find(l => l.lei === lei);
    if (!lender) {
      return sendError(res, 'Lender not found', 404);
    }

    // Get individual loans for this lender
    const lenderLoans = loansData.filter(l => l.lei === lei);
    
    // Build loan summary by tract/neighborhood
    const tractSummary = {};
    lenderLoans.forEach(loan => {
      const tract = loan.census_tract;
      const hood = TRACT_TO_HOOD[tract] || `Tract ${tract.slice(-6)}`;
      if (!tractSummary[hood]) {
        tractSummary[hood] = { count: 0, total_amount: 0, avg_rate: 0, rates: [], types: {} };
      }
      tractSummary[hood].count++;
      tractSummary[hood].total_amount += loan.loan_amount;
      if (loan.interest_rate > 0) tractSummary[hood].rates.push(loan.interest_rate);
      const lt = loan.loan_type || 'Unknown';
      tractSummary[hood].types[lt] = (tractSummary[hood].types[lt] || 0) + 1;
    });

    // Calculate averages
    Object.values(tractSummary).forEach(s => {
      s.avg_rate = s.rates.length > 0 ? +(s.rates.reduce((a,b) => a+b, 0) / s.rates.length).toFixed(3) : 0;
      delete s.rates;
    });

    // Sort neighborhoods by volume
    const neighborhoods = Object.entries(tractSummary)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.count - a.count);

    // Build loan list (paginated, most recent details)
    const { page: pageParam, limit: limitParam, type, purpose, sub60k, business } = req.query;
    const page = parseInt(pageParam) || 1;
    const limit = Math.min(parseInt(limitParam) || 50, 200);

    let filteredLoans = [...lenderLoans];
    
    if (type) filteredLoans = filteredLoans.filter(l => l.loan_type === type);
    if (purpose) filteredLoans = filteredLoans.filter(l => l.loan_purpose === purpose);
    if (sub60k === 'true') filteredLoans = filteredLoans.filter(l => l.loan_amount > 0 && l.loan_amount <= 60000);
    if (business === 'true') filteredLoans = filteredLoans.filter(l => l.is_business);

    // Sort by amount desc
    filteredLoans.sort((a, b) => b.loan_amount - a.loan_amount);

    const total = filteredLoans.length;
    const start = (page - 1) * limit;
    const paginatedLoans = filteredLoans.slice(start, start + limit).map(l => ({
      ...l,
      neighborhood: l.matched_neighborhood || TRACT_TO_HOOD[l.census_tract] || `Tract ${(l.census_tract || '').slice(-6)}`
    }));

    res.status(200).json({
      data: {
        profile: {
          ...lender,
          total_business_loans: lenderLoans.filter(l => l.is_business).length,
          business_sub_60k: lenderLoans.filter(l => l.is_business && l.loan_amount > 0 && l.loan_amount <= 60000).length,
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
