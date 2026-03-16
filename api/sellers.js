const { handleCors, sendPaginated, sendError, intParam, floatParam } = require('./_helpers');

let sellersData = null;

function loadData() {
  if (!sellersData) {
    sellersData = require('./_data/sellers.json');
  }
  return sellersData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const data = loadData();
    const {
      min_score, neighborhood,
      limit: limitParam, page: pageParam,
    } = req.query;

    const limit = intParam(limitParam, 100);
    const page = intParam(pageParam, 1);

    let filtered = data;

    // Filter by min_score
    const minScore = floatParam(min_score);
    if (minScore !== null) {
      filtered = filtered.filter(s => s.score != null && s.score >= minScore);
    }

    // Filter by neighborhood
    if (neighborhood) {
      const nb = neighborhood.toLowerCase();
      filtered = filtered.filter(s => s.nb && s.nb.toLowerCase() === nb);
    }

    sendPaginated(res, filtered, page, limit);
  } catch (err) {
    console.error('Error in /api/sellers:', err);
    sendError(res, 'Internal server error');
  }
};
