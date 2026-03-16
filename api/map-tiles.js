const { handleCors, sendJson, sendError, intParam, parseBounds, filterByBounds } = require('./_helpers');

// Module-scope cache for lazy-loaded data files
const dataCache = {};

function loadLayer(layer) {
  if (!dataCache[layer]) {
    switch (layer) {
      case 'sales':
        dataCache[layer] = require('./_data/sales.json');
        break;
      case 'permits':
        dataCache[layer] = require('./_data/permits.json');
        break;
      case 'trades':
        dataCache[layer] = require('./_data/trades.json');
        break;
      case 'blight':
        dataCache[layer] = require('./_data/blight.json');
        break;
      case 'dlba':
        dataCache[layer] = require('./_data/dlba.json');
        break;
      case 'demos':
        dataCache[layer] = require('./_data/demos.json');
        break;
      case 'rentals':
        dataCache[layer] = require('./_data/rentals.json');
        break;
      case 'crime':
        dataCache[layer] = require('./_data/crime.json');
        break;
      case 'vacant':
        dataCache[layer] = require('./_data/vacant.json');
        break;
      default:
        return null;
    }
  }
  return dataCache[layer];
}

/**
 * Extract minimal fields for map display depending on layer type
 */
function minimalFields(record, layer) {
  // Pass through ALL fields for full popup detail
  // Only strip internal/geo duplication fields
  const result = {};
  for (const key of Object.keys(record)) {
    if (['_lat', '_lng', 'ObjectId', 'OBJECTID', 'address_id', 'building_id'].includes(key)) continue;
    result[key] = record[key];
  }
  return result;
}

/**
 * Grid-based clustering for low zoom levels
 */
function clusterPoints(points, zoom) {
  // At zoom < 13, cluster into grid cells
  // Grid size decreases as zoom increases
  const gridSize = 0.01 * Math.pow(2, 13 - zoom);
  const clusters = {};

  points.forEach(p => {
    if (p.lat == null || p.lng == null) return;
    const cellLat = Math.floor(p.lat / gridSize) * gridSize;
    const cellLng = Math.floor(p.lng / gridSize) * gridSize;
    const key = `${cellLat.toFixed(5)},${cellLng.toFixed(5)}`;

    if (!clusters[key]) {
      clusters[key] = {
        lat: cellLat + gridSize / 2,
        lng: cellLng + gridSize / 2,
        count: 0,
      };
    }
    clusters[key].count += 1;
  });

  return Object.values(clusters);
}

module.exports = (req, res) => {
  if (handleCors(req, res)) return;

  try {
    const { layer, bounds, zoom: zoomParam, limit: limitParam } = req.query;

    if (!layer) {
      return sendError(res, 'layer parameter is required', 400);
    }

    const data = loadLayer(layer);
    if (!data) {
      return sendError(res, `Unknown layer: ${layer}`, 400);
    }

    const limit = intParam(limitParam, 2000);
    const zoom = intParam(zoomParam, 14);
    const parsedBounds = parseBounds(bounds);

    // Filter by bounds
    let filtered = filterByBounds(data, parsedBounds);

    // Remove records without lat/lng
    filtered = filtered.filter(r => r.lat != null && r.lng != null);

    // If zoomed out, cluster points
    if (zoom < 13) {
      const clustered = clusterPoints(filtered, zoom);
      return sendJson(res, {
        data: clustered.slice(0, limit),
        meta: { total: clustered.length, clustered: true, zoom },
      });
    }

    // Return minimal fields, limited
    const minimal = filtered.slice(0, limit).map(r => minimalFields(r, layer));

    sendJson(res, {
      data: minimal,
      meta: { total: filtered.length, page: 1, limit },
    });
  } catch (err) {
    console.error('Error in /api/map-tiles:', err);
    sendError(res, 'Internal server error');
  }
};
