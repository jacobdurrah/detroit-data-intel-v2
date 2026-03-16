const { handleCors, sendJson, sendError } = require('../_helpers');

let salesData = null;
let permitsData = null;
let tradesData = null;
let blightData = null;

function load(name) {
  switch (name) {
    case 'sales': if (!salesData) salesData = require('../_data/sales.json'); return salesData;
    case 'permits': if (!permitsData) permitsData = require('../_data/permits.json'); return permitsData;
    case 'trades': if (!tradesData) tradesData = require('../_data/trades.json'); return tradesData;
    case 'blight': if (!blightData) blightData = require('../_data/blight.json'); return blightData;
  }
}

function normalizeAddress(addr) {
  if (!addr) return '';
  return addr.toUpperCase().replace(/[.,#]/g, '').replace(/\s+/g, ' ').trim();
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { address } = req.query;
    if (!address) return sendError(res, 'Address parameter is required', 400);

    const normalized = normalizeAddress(decodeURIComponent(address));

    // Cross-reference across all datasets
    const sales = load('sales').filter(s => normalizeAddress(s.addr) === normalized);
    const permits = load('permits').filter(p => normalizeAddress(p.addr) === normalized);
    const trades = load('trades').filter(t => normalizeAddress(t.addr) === normalized);
    const blight = load('blight').filter(b => normalizeAddress(b.addr) === normalized);

    // Sort each by date descending
    sales.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));
    permits.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));
    trades.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));
    blight.sort((a, b) => (b.dt || '').localeCompare(a.dt || ''));

    // Build owner history from sales
    const owners = sales.map(s => ({
      name: s.ge,
      date: s.dt,
      price: s.pr,
      from: s.gr,
    }));

    // Motivated seller signals
    const signals = [];
    if (blight.length > 0) signals.push(blight.length + ' blight ticket' + (blight.length > 1 ? 's' : ''));
    const totalFines = blight.reduce((sum, b) => sum + (b.fine || 0), 0);
    if (totalFines > 0) signals.push('$' + totalFines.toLocaleString() + ' in fines');
    if (sales.length > 0 && sales[0].pr < 60000) signals.push('Low sale price ($' + (sales[0].pr || 0).toLocaleString() + ')');
    if (sales.length > 1) signals.push(sales.length + ' ownership changes');
    if (permits.length === 0 && trades.length === 0) signals.push('No permit activity');

    // Get location info from first available record
    const firstRecord = sales[0] || permits[0] || trades[0] || blight[0] || {};

    sendJson(res, {
      data: {
        address: decodeURIComponent(address),
        neighborhood: firstRecord.nb || null,
        lat: firstRecord.lat || null,
        lng: firstRecord.lng || null,
        parcel_id: firstRecord.pid || null,
        sales,
        permits,
        trades,
        blight,
        owners,
        signals,
        summary: {
          total_sales: sales.length,
          total_permits: permits.length,
          total_trades: trades.length,
          total_blight: blight.length,
          total_fines: totalFines,
          last_sale_date: sales[0] ? sales[0].dt : null,
          last_sale_price: sales[0] ? sales[0].pr : null,
          current_owner: owners[0] ? owners[0].name : null,
        },
      },
    });
  } catch (err) {
    console.error('Error in /api/property/[address]:', err);
    sendError(res, 'Internal server error');
  }
};
