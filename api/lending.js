const { handleCors, sendPaginated, sendError, intParam } = require('./_helpers');

let lendingData = null;

function loadData() {
  if (!lendingData) {
    lendingData = require('./_data/lending.json');
  }
  return lendingData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const data = loadData();
    const {
      sub60k, investment, multifamily, loan_type,
      sort, limit: limitParam, page: pageParam,
    } = req.query;

    const limit = intParam(limitParam, 50);
    const page = intParam(pageParam, 1);

    let filtered = data;

    // Filter by sub60k (lenders that have sub-60k loans)
    if (sub60k === 'true') {
      filtered = filtered.filter(l => l.sub_60k_loans > 0);
    }

    // Filter by investment (lenders that have investment loans)
    if (investment === 'true') {
      filtered = filtered.filter(l => l.investment_loans > 0);
    }

    // Filter by multifamily
    if (multifamily === 'true') {
      filtered = filtered.filter(l => l.does_multifamily === true);
    }

    // Filter by loan type (e.g., FHA, Conventional, VA)
    if (loan_type) {
      filtered = filtered.filter(l => l.loan_types && l.loan_types[loan_type] > 0);
    }

    // Sort
    if (sort) {
      switch (sort) {
        case 'loans':
          filtered = filtered.slice().sort((a, b) => (b.total_loans || 0) - (a.total_loans || 0));
          break;
        case 'volume':
          filtered = filtered.slice().sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0));
          break;
        case 'rate':
          filtered = filtered.slice().sort((a, b) => (a.avg_rate || 999) - (b.avg_rate || 999));
          break;
      }
    }

    sendPaginated(res, filtered, page, limit);
  } catch (err) {
    console.error('Error in /api/lending:', err);
    sendError(res, 'Internal server error');
  }
};
