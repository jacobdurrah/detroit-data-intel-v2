const { handleCors, sendJson, sendError } = require('./_helpers');

let statsData = null;

function loadData() {
  if (!statsData) {
    statsData = require('./_data/stats.json');
  }
  return statsData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const data = loadData();
    sendJson(res, { data });
  } catch (err) {
    console.error('Error in /api/stats:', err);
    sendError(res, 'Internal server error');
  }
};
