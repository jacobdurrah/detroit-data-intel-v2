const { handleCors, sendJson, sendError } = require('../_helpers');

let permitsData = null;
let tradesData = null;

function loadPermits() {
  if (!permitsData) permitsData = require('../_data/permits.json');
  return permitsData;
}

function loadTrades() {
  if (!tradesData) tradesData = require('../_data/trades.json');
  return tradesData;
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { id } = req.query;
    if (!id) return sendError(res, 'ID parameter is required', 400);

    const permits = loadPermits();
    const permit = permits.find(p => p.id === id);

    if (!permit) return sendError(res, 'Permit not found', 404);

    // Find related trades at same address
    const trades = loadTrades();
    const relatedTrades = trades
      .filter(t => t.addr && permit.addr && t.addr.toUpperCase() === permit.addr.toUpperCase())
      .sort((a, b) => (b.dt || '').localeCompare(a.dt || ''))
      .slice(0, 20);

    sendJson(res, {
      data: {
        permit,
        related_trades: relatedTrades,
      },
    });
  } catch (err) {
    console.error('Error in /api/permit/[id]:', err);
    sendError(res, 'Internal server error');
  }
};
