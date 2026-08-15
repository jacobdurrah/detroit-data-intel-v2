const { handleCors, checkAuth, sendPaginated, sendError, intParam } = require('./_helpers');

let lendingData = null;

function loadData() {
  if (!lendingData) {
    lendingData = require('./_data/lending.json');
  }
  return lendingData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;
  if (checkAuth(req, res)) return;

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

    // Filter by LLC/business sub-60K — this filter also ranks by llc_sub_60k_loans
    const llcSub60k = req.query.llc_sub60k === 'true';
    if (llcSub60k) {
      filtered = filtered.filter(l => (l.llc_sub_60k_loans || 0) > 0);
      filtered.sort((a, b) => (b.llc_sub_60k_loans || 0) - (a.llc_sub_60k_loans || 0));
    }

    // Filter by business/LLC lending
    if (req.query.business === 'true') {
      filtered = filtered.filter(l => (l.business_loans || 0) > 0);
    }

    // Filter by loan type (e.g., FHA, Conventional, VA)
    if (loan_type) {
      filtered = filtered.filter(l => l.loan_types && l.loan_types[loan_type] > 0);
    }

    // Sort. The Lenders dropdown sends total_loans / total_volume / avg_rate / name;
    // keep short aliases (loans / volume / rate) for older callers. Skip when the
    // llc_sub60k filter already applied its own ranking.
    if (sort && !llcSub60k) {
      switch (sort) {
        case 'loans':
        case 'total_loans':
          filtered = filtered.slice().sort((a, b) => (b.total_loans || 0) - (a.total_loans || 0));
          break;
        case 'volume':
        case 'total_volume':
          filtered = filtered.slice().sort((a, b) => (b.total_volume || 0) - (a.total_volume || 0));
          break;
        case 'rate':
        case 'avg_rate':
          filtered = filtered.slice().sort((a, b) => (a.avg_rate || 999) - (b.avg_rate || 999));
          break;
        case 'name':
          filtered = filtered.slice().sort((a, b) => (a.name || '').localeCompare(b.name || ''));
          break;
      }
    }

    sendPaginated(res, filtered, page, limit);
  } catch (err) {
    console.error('Error in /api/lending:', err);
    sendError(res, 'Internal server error');
  }
};
