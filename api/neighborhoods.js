const { handleCors, sendPaginated, sendError, intParam } = require('./_helpers');

let neighborhoodsData = null;

function loadData() {
  if (!neighborhoodsData) {
    neighborhoodsData = require('./_data/neighborhoods.json');
  }
  return neighborhoodsData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const data = loadData();
    const { sort, limit: limitParam, page: pageParam } = req.query;

    const limit = intParam(limitParam, 50);
    const page = intParam(pageParam, 1);

    let sorted = data.slice();

    // Sort by requested field
    if (sort) {
      switch (sort) {
        case 'score':
          sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
          break;
        case 'sales':
          sorted.sort((a, b) => (b.total_sales || 0) - (a.total_sales || 0));
          break;
        case 'price':
          sorted.sort((a, b) => (b.median_price || 0) - (a.median_price || 0));
          break;
        case 'permits':
          sorted.sort((a, b) => (b.total_permits || 0) - (a.total_permits || 0));
          break;
        case 'blight':
          sorted.sort((a, b) => (b.total_blight || 0) - (a.total_blight || 0));
          break;
        default:
          sorted.sort((a, b) => (b.score || 0) - (a.score || 0));
      }
    }

    sendPaginated(res, sorted, page, limit);
  } catch (err) {
    console.error('Error in /api/neighborhoods:', err);
    sendError(res, 'Internal server error');
  }
};
