/* ============================================================
   Detroit Data Intelligence Platform V2 - Map Module
   ============================================================ */
(function () {
  'use strict';

  var map = null;
  var clusterGroups = {};
  var activeLayers = new Set();
  var layerPanelOpen = false;
  var loadingLayers = new Set();

  var DETROIT_CENTER = [42.3314, -83.0458];
  var DETROIT_ZOOM = 12;

  var LAYER_COLORS = {
    sales:    '#3b82f6',
    permits:  '#10b981',
    trades:   '#8b5cf6',
    blight:   '#ef4444',
    dlba:     '#f59e0b',
    demos:    '#6b7280',
    rentals:  '#06b6d4',
    crime:    '#dc2626',
    vacant:   '#d97706'
  };

  var BASEMAP_URL = 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png';
  var BASEMAP_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a> &copy; <a href="https://carto.com/">CARTO</a>';

  function init() {
    if (map) return; // already initialized

    map = L.map('map', {
      center: DETROIT_CENTER,
      zoom: DETROIT_ZOOM,
      zoomControl: true,
      attributionControl: true
    });

    L.tileLayer(BASEMAP_URL, {
      attribution: BASEMAP_ATTR,
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(map);

    // Create cluster groups for each layer
    Object.keys(LAYER_COLORS).forEach(function (layer) {
      clusterGroups[layer] = L.markerClusterGroup({
        maxClusterRadius: 50,
        disableClusteringAtZoom: 17,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        iconCreateFunction: function (cluster) {
          var count = cluster.getChildCount();
          var size = count < 10 ? 'small' : count < 50 ? 'medium' : 'large';
          return L.divIcon({
            html: '<div style="background:' + LAYER_COLORS[layer] + ';color:#fff;border-radius:50%;width:100%;height:100%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;">' + count + '</div>',
            className: 'marker-cluster marker-cluster-' + size,
            iconSize: L.point(36, 36)
          });
        }
      });
    });

    // Load default layers
    var defaults = document.querySelectorAll('#layer-list input[data-layer]:checked');
    defaults.forEach(function (cb) {
      activeLayers.add(cb.getAttribute('data-layer'));
    });

    // Layer panel toggle
    var toggleBtn = document.getElementById('layer-toggle-btn');
    var layerPanel = document.getElementById('map-layers');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        layerPanelOpen = !layerPanelOpen;
        layerPanel.classList.toggle('open', layerPanelOpen);
      });
    }

    // Close layer panel when clicking elsewhere on map
    map.on('click', function () {
      if (layerPanelOpen) {
        layerPanelOpen = false;
        layerPanel.classList.remove('open');
      }
    });

    // Layer checkbox changes
    document.getElementById('layer-list').addEventListener('change', function (e) {
      var cb = e.target;
      if (!cb.matches('input[data-layer]')) return;
      var layer = cb.getAttribute('data-layer');
      if (cb.checked) {
        activeLayers.add(layer);
        loadLayerData(layer);
      } else {
        activeLayers.delete(layer);
        clearLayer(layer);
      }
    });

    // Viewport-based loading on move/zoom
    map.on('moveend', onViewportChange);
    map.on('zoomend', onViewportChange);

    // Initial load for active layers
    activeLayers.forEach(function (layer) {
      loadLayerData(layer);
    });
  }

  var viewportTimer = null;
  function onViewportChange() {
    clearTimeout(viewportTimer);
    viewportTimer = setTimeout(function () {
      activeLayers.forEach(function (layer) {
        loadLayerData(layer);
      });
    }, 300);
  }

  async function loadLayerData(layer) {
    if (!map) return;
    if (loadingLayers.has(layer)) return;

    var bounds = map.getBounds();
    var zoom = map.getZoom();
    var boundsStr = [
      bounds.getSouthWest().lat.toFixed(6),
      bounds.getSouthWest().lng.toFixed(6),
      bounds.getNorthEast().lat.toFixed(6),
      bounds.getNorthEast().lng.toFixed(6)
    ].join(',');

    loadingLayers.add(layer);

    try {
      var data = await App.api('map-tiles', {
        layer: layer,
        bounds: boundsStr,
        zoom: zoom
      });

      if (!activeLayers.has(layer)) {
        loadingLayers.delete(layer);
        return; // user toggled off while loading
      }

      var points = data.data || data.points || data || [];
      renderLayerPoints(layer, points);
    } catch (e) {
      console.warn('Failed to load layer "' + layer + '":', e);
    } finally {
      loadingLayers.delete(layer);
    }
  }

  function renderLayerPoints(layer, points) {
    if (!Array.isArray(points)) return;

    var group = clusterGroups[layer];
    if (!group) return;

    // Remove existing markers and re-add
    group.clearLayers();

    var color = LAYER_COLORS[layer] || '#3b82f6';
    var markers = [];

    points.forEach(function (pt) {
      var lat = pt.lat || pt.latitude;
      var lng = pt.lng || pt.lon || pt.longitude;
      if (!lat || !lng) return;

      var marker = L.circleMarker([lat, lng], {
        radius: 6,
        fillColor: color,
        color: color,
        weight: 1,
        opacity: 0.8,
        fillOpacity: 0.6
      });

      var popupContent = buildPopup(layer, pt);
      marker.bindPopup(popupContent, {
        maxWidth: 280,
        className: 'dark-popup'
      });

      markers.push(marker);
    });

    group.addLayers(markers);

    if (!map.hasLayer(group)) {
      map.addLayer(group);
    }
  }

  function buildPopup(layer, pt) {
    var html = '<div style="color:#e0e0e0;font-size:13px;line-height:1.5;">';

    // Handle cluster points
    if (pt.count) {
      html += '<strong>' + pt.count + ' records</strong>';
      html += '</div>';
      return html;
    }

    var addr = pt.addr || pt.address || '';
    if (addr) {
      html += '<strong style="font-size:14px;">' + App.escapeHtml(addr) + '</strong><br>';
    }

    html += '<span style="display:inline-block;padding:1px 8px;border-radius:10px;font-size:11px;font-weight:600;margin:4px 0;background:' + (LAYER_COLORS[layer] || '#3b82f6') + '33;color:' + (LAYER_COLORS[layer] || '#3b82f6') + ';">' + layer.charAt(0).toUpperCase() + layer.slice(1) + '</span><br>';

    // Handle both compact and full field names
    var price = pt.pr || pt.sale_price || pt.price;
    var date = pt.dt || pt.sale_date || pt.date;
    var typ = pt.type || pt.cat;
    var status = pt.st || pt.status;

    if (price) html += 'Price: <strong>' + App.formatCurrencyFull(price) + '</strong><br>';
    if (date) html += 'Date: ' + App.formatDate(date) + '<br>';
    if (typ) html += 'Type: ' + App.escapeHtml(typ) + '<br>';
    if (status) html += 'Status: ' + App.escapeHtml(status) + '<br>';

    html += '</div>';
    return html;
  }

  function clearLayer(layer) {
    var group = clusterGroups[layer];
    if (group) {
      group.clearLayers();
      if (map && map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
  }

  function showOnMap(points, layer) {
    if (!map) return;
    if (!points || !points.length) return;

    layer = layer || 'sales';
    var color = LAYER_COLORS[layer] || '#3b82f6';

    // Switch to map tab
    App.switchTab('map');

    setTimeout(function () {
      if (map) map.invalidateSize();

      // Add points to a temporary group
      var tempGroup = L.featureGroup();
      points.forEach(function (pt) {
        var lat = pt.lat || pt.latitude;
        var lng = pt.lng || pt.lon || pt.longitude;
        if (!lat || !lng) return;

        var marker = L.circleMarker([lat, lng], {
          radius: 8,
          fillColor: color,
          color: '#fff',
          weight: 2,
          opacity: 1,
          fillOpacity: 0.8
        });

        var popup = buildPopup(layer, pt);
        marker.bindPopup(popup, { maxWidth: 280, className: 'dark-popup' });
        marker.addTo(tempGroup);
      });

      tempGroup.addTo(map);
      if (tempGroup.getBounds().isValid()) {
        map.fitBounds(tempGroup.getBounds(), { padding: [40, 40], maxZoom: 16 });
      }
    }, 150);
  }

  function invalidateSize() {
    if (map) {
      setTimeout(function () { map.invalidateSize(); }, 100);
    }
  }

  /* --- Exports --- */
  window.MapModule = {
    init: init,
    showOnMap: showOnMap,
    clearLayer: clearLayer,
    invalidateSize: invalidateSize
  };

})();
