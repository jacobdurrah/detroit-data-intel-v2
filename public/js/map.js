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
  var mapMode = 'cluster'; // 'cluster' or 'heat'
  var heatLayers = {};
  var layerPointsCache = {};
  var searchMarker = null;

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
    vacant:   '#d97706',
    newbuilds:'#22d3ee',
    foreclosures:'#f43f5e',
    leadreplace:'#a855f7',
    density:'#f472b6'
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

    // Create cluster groups for each layer (density uses standalone heatmap)
    Object.keys(LAYER_COLORS).forEach(function (layer) {
      if (layer === 'density') return; // density renders as standalone heatmap
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

      // Multi-item popup for co-located markers (Feature #7)
      clusterGroups[layer].on('clusterclick', function (e) {
        var markers = e.layer.getAllChildMarkers();
        if (markers.length > 20 || markers.length < 2) return;
        var allSame = markers.every(function (m) {
          return m.getLatLng().lat === markers[0].getLatLng().lat &&
                 m.getLatLng().lng === markers[0].getLatLng().lng;
        });
        if (allSame) {
          var html = '<div style="max-height:300px;overflow-y:auto;">';
          markers.forEach(function (m, i) {
            if (m.getPopup()) {
              html += m.getPopup().getContent();
              if (i < markers.length - 1) html += '<hr style="border-color:var(--border);margin:8px 0;">';
            }
          });
          html += '</div>';
          L.popup({ maxWidth: 360, className: 'dark-popup' })
            .setLatLng(e.latlng)
            .setContent(html)
            .openOn(map);
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

    // Time range filter
    var timeRangeEl = document.getElementById('map-time-range');
    if (timeRangeEl) {
      timeRangeEl.addEventListener('change', function () {
        activeLayers.forEach(function (layer) {
          clearLayer(layer);
          loadLayerData(layer);
        });
      });
    }

    // Heatmap mode toggle
    var clusterBtn = document.getElementById('map-mode-cluster');
    var heatBtn = document.getElementById('map-mode-heat');
    if (clusterBtn) {
      clusterBtn.addEventListener('click', function () {
        if (mapMode === 'cluster') return;
        mapMode = 'cluster';
        clusterBtn.classList.add('active');
        heatBtn.classList.remove('active');
        switchMapMode();
      });
    }
    if (heatBtn) {
      heatBtn.addEventListener('click', function () {
        if (mapMode === 'heat') return;
        mapMode = 'heat';
        heatBtn.classList.add('active');
        clusterBtn.classList.remove('active');
        switchMapMode();
      });
    }

    // Address search
    var searchInput = document.getElementById('map-search-input');
    var searchBtn = document.getElementById('map-search-btn');
    if (searchBtn) {
      searchBtn.addEventListener('click', function () { doAddressSearch(); });
    }
    if (searchInput) {
      searchInput.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') doAddressSearch();
      });
    }

    // Viewport-based loading on move/zoom
    map.on('moveend', onViewportChange);
    map.on('zoomend', onViewportChange);

    // Initial load for active layers
    activeLayers.forEach(function (layer) {
      loadLayerData(layer);
    });
  }

  /* --- Address Search (Feature #5) --- */
  async function doAddressSearch() {
    var input = document.getElementById('map-search-input');
    var query = (input && input.value || '').trim();
    if (!query) return;

    // Remove old search marker
    if (searchMarker && map) {
      map.removeLayer(searchMarker);
      searchMarker = null;
    }

    try {
      // Try our geocode endpoint first
      var data = await App.api('geocode', { q: query });
      var results = data.results || [];

      if (results.length > 0) {
        var r = results[0];
        map.setView([r.lat, r.lng], 17);
        searchMarker = L.marker([r.lat, r.lng], {
          icon: L.divIcon({
            html: '<div style="background:#ef4444;color:white;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.4);">&#9679;</div>',
            className: 'search-marker-icon',
            iconSize: [28, 28],
            iconAnchor: [14, 14]
          })
        }).addTo(map);
        searchMarker.bindPopup('<div class="popup-content"><div class="popup-address">' + App.escapeHtml(r.address) + '</div>' +
          (r.neighborhood ? '<div class="popup-fields"><div class="popup-field"><span class="popup-label">Area</span><span class="popup-value">' + App.escapeHtml(r.neighborhood) + '</span></div></div>' : '') +
          '</div>', { className: 'dark-popup' }).openPopup();
        return;
      }

      // Fallback to Nominatim
      var resp = await fetch('https://nominatim.openstreetmap.org/search?q=' + encodeURIComponent(query + ' Detroit MI') + '&format=json&limit=1');
      var nominatim = await resp.json();
      if (nominatim.length > 0) {
        var lat = parseFloat(nominatim[0].lat);
        var lng = parseFloat(nominatim[0].lon);
        map.setView([lat, lng], 17);
        searchMarker = L.marker([lat, lng]).addTo(map);
        searchMarker.bindPopup('<div class="popup-content"><div class="popup-address">' + App.escapeHtml(nominatim[0].display_name || query) + '</div></div>', { className: 'dark-popup' }).openPopup();
      }
    } catch (e) {
      console.warn('Address search failed:', e);
    }
  }

  /* --- Heatmap Mode (Feature #6) --- */
  function switchMapMode() {
    activeLayers.forEach(function (layer) {
      if (mapMode === 'heat') {
        // Remove cluster group, add heat layer
        if (map.hasLayer(clusterGroups[layer])) {
          map.removeLayer(clusterGroups[layer]);
        }
        renderHeatLayer(layer);
      } else {
        // Remove heat layer, restore cluster group
        if (heatLayers[layer] && map.hasLayer(heatLayers[layer])) {
          map.removeLayer(heatLayers[layer]);
        }
        if (layerPointsCache[layer]) {
          renderLayerPoints(layer, layerPointsCache[layer]);
        }
      }
    });
  }

  function renderHeatLayer(layer) {
    var points = layerPointsCache[layer] || [];
    var heatPoints = [];
    points.forEach(function (pt) {
      var lat = pt.lat || pt.latitude;
      var lng = pt.lng || pt.lon || pt.longitude;
      if (!lat || !lng) return;
      heatPoints.push([lat, lng, 1]);
    });

    if (heatLayers[layer] && map.hasLayer(heatLayers[layer])) {
      map.removeLayer(heatLayers[layer]);
    }

    if (heatPoints.length > 0) {
      heatLayers[layer] = L.heatLayer(heatPoints, {
        radius: 25,
        blur: 15,
        maxZoom: 15,
        gradient: { 0.4: 'blue', 0.6: 'lime', 0.8: 'orange', 1.0: 'red' }
      }).addTo(map);
    }
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
      var timeRangeEl = document.getElementById('map-time-range');
      var timeVal = timeRangeEl ? timeRangeEl.value : 'all';

      var data = await App.api('map-tiles', {
        layer: layer,
        bounds: boundsStr,
        zoom: zoom,
        time_range: timeVal
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

  var densityLayerGroup = null;

  function renderDensityMarkers(points) {
    // Remove existing density layer
    if (densityLayerGroup && map.hasLayer(densityLayerGroup)) {
      map.removeLayer(densityLayerGroup);
    }
    densityLayerGroup = L.layerGroup();
    if (!points || points.length === 0) return;

    // Find max density for scaling
    var maxDensity = 0;
    points.forEach(function (pt) {
      if (pt.density > maxDensity) maxDensity = pt.density;
    });

    // Color gradient: low density = cool (blue) → high density = warm (pink/red)
    function densityColor(density) {
      var ratio = Math.min(density / (maxDensity || 1), 1);
      if (ratio < 0.25) return '#6366f1'; // indigo - low
      if (ratio < 0.5) return '#8b5cf6';  // purple - medium-low
      if (ratio < 0.7) return '#d946ef';  // fuchsia - medium
      if (ratio < 0.85) return '#f43f5e'; // rose - high
      return '#ef4444';                    // red - very high
    }

    points.forEach(function (pt) {
      var lat = pt.lat || pt.latitude;
      var lng = pt.lng || pt.longitude;
      if (!lat || !lng || !pt.density) return;

      var ratio = pt.density / (maxDensity || 1);
      var radius = Math.max(8, Math.min(22, 8 + ratio * 14));
      var color = densityColor(pt.density);

      var marker = L.circleMarker([lat, lng], {
        radius: radius,
        fillColor: color,
        color: '#ffffff',
        weight: 1.5,
        opacity: 0.9,
        fillOpacity: 0.65
      });

      var popupContent = buildPopup('density', pt);
      marker.bindPopup(popupContent, { maxWidth: 340, className: 'dark-popup' });
      marker.addTo(densityLayerGroup);
    });

    densityLayerGroup.addTo(map);
  }

  function renderLayerPoints(layer, points) {
    if (!Array.isArray(points)) return;

    // Cache points for mode switching
    layerPointsCache[layer] = points;

    // Density renders as graduated circle markers, not clustered
    if (layer === 'density') {
      renderDensityMarkers(points);
      return;
    }

    // If in heat mode, render heat layer instead
    if (mapMode === 'heat') {
      renderHeatLayer(layer);
      return;
    }

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
        maxWidth: 340,
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
    var html = '<div class="popup-content">';

    // Handle cluster points
    if (pt.count) {
      html += '<strong>' + pt.count + ' records</strong></div>';
      return html;
    }

    var addr = pt.addr || pt.address || '';
    if (addr) {
      html += '<div class="popup-address">' + App.escapeHtml(addr) + '</div>';
    }

    html += '<span class="popup-layer-badge" style="background:' + (LAYER_COLORS[layer] || '#3b82f6') + '33;color:' + (LAYER_COLORS[layer] || '#3b82f6') + ';">' + layer.charAt(0).toUpperCase() + layer.slice(1) + '</span>';

    // Field display config per layer type
    var fields = [];

    if (layer === 'sales') {
      // Support both abbreviated (slim) and full field names
      fields = [
        {k: ['pr','amt_sale_price','sale_price','price'], l: 'Sale Price', fmt: 'currency'},
        {k: ['dt','sale_date','date'], l: 'Sale Date', fmt: 'date'},
        {k: ['ge','grantee','buyer'], l: 'Buyer (Grantee)'},
        {k: ['gr','grantor','seller'], l: 'Seller (Grantor)'},
        {k: ['si','sale_instrument'], l: 'Deed Type'},
        {k: ['tos','term_of_sale'], l: 'Terms'},
        {k: ['pcd','property_class_description'], l: 'Property Class'},
        {k: ['nb','neighborhood'], l: 'Neighborhood'},
        {k: ['ecf','ecf_neighborhood'], l: 'ECF Neighborhood'},
        {k: ['zip','zip_code'], l: 'Zip Code'},
        {k: ['pid','parcel_id'], l: 'Parcel ID'},
        {k: ['cd','council_district'], l: 'Council District'},
        {k: ['lp','liber_page'], l: 'Liber/Page'},
        {k: ['ppt','pct_property_transferred'], l: '% Transferred'},
        {k: ['mps','is_multi_parcel_sale'], l: 'Multi-Parcel'},
      ];
    } else if (layer === 'permits') {
      fields = [
        {k: ['id','permit_no'], l: 'Permit #'},
        {k: ['type_detail','permit_type'], l: 'Permit Type'},
        {k: ['status','permit_status'], l: 'Status'},
        {k: ['dt','permit_issued','issued_date'], l: 'Date Issued', fmt: 'date'},
        {k: ['desc','description','work_description'], l: 'Description'},
        {k: ['cost','estimated_cost','amt_permit_cost'], l: 'Estimated Cost', fmt: 'currency'},
        {k: ['contractor','contractor_name'], l: 'Contractor'},
        {k: ['owner','bld_type_use'], l: 'Owner/Use'},
        {k: ['nb','neighborhood'], l: 'Neighborhood'},
        {k: ['cd','council_district'], l: 'Council District'},
        {k: ['pid','parcel_id'], l: 'Parcel ID'},
      ];
    } else if (layer === 'trades') {
      fields = [
        {k: ['id','permit_no'], l: 'Permit #'},
        {k: ['type_detail','permit_type'], l: 'Permit Type'},
        {k: ['dt','permit_issued','issued_date'], l: 'Date Issued', fmt: 'date'},
        {k: ['desc','description','work_description'], l: 'Description'},
        {k: ['contractor','contractor_name','contact_business_name'], l: 'Contractor'},
        {k: ['nb','neighborhood'], l: 'Neighborhood'},
        {k: ['cd','council_district'], l: 'Council District'},
        {k: ['pid','parcel_id'], l: 'Parcel ID'},
      ];
    } else if (layer === 'blight') {
      fields = [
        {k: 'ordinance_description', l: 'Violation'},
        {k: 'ticket_issued_date', l: 'Issued', fmt: 'date'},
        {k: 'disposition', l: 'Disposition'},
        {k: 'amt_fine', l: 'Fine', fmt: 'currency'},
        {k: 'amt_judgment', l: 'Judgment', fmt: 'currency'},
        {k: 'amt_balance_due', l: 'Balance Due', fmt: 'currency'},
        {k: 'payment_status', l: 'Payment Status'},
        {k: 'property_owner_name', l: 'Owner'},
        {k: 'property_owner_address', l: 'Owner Address'},
        {k: 'hearing_date', l: 'Hearing', fmt: 'date'},
        {k: 'judgment_date', l: 'Judgment Date', fmt: 'date'},
        {k: 'agency_name', l: 'Agency'},
        {k: 'neighborhood', l: 'Neighborhood'},
      ];
    } else if (layer === 'demos') {
      fields = [
        {k: ['id','permit_no'], l: 'Permit #'},
        {k: ['dt','permit_issued'], l: 'Date Issued', fmt: 'date'},
        {k: ['desc','permit_status'], l: 'Description'},
        {k: ['owner','bld_type_use'], l: 'Owner'},
        {k: ['contractor','contractor_name'], l: 'Contractor'},
        {k: ['nb','neighborhood'], l: 'Neighborhood'},
        {k: ['cd','council_district'], l: 'Council District'},
        {k: ['pid','parcel_id'], l: 'Parcel ID'},
      ];
    } else if (layer === 'crime') {
      fields = [
        {k: ['type_detail','offense_category'], l: 'Offense Category'},
        {k: ['desc','offense_description'], l: 'Description'},
        {k: ['dt','incident_timestamp'], l: 'Date', fmt: 'date'},
        {k: ['nb','neighborhood'], l: 'Neighborhood'},
      ];
    } else if (layer === 'dlba') {
      fields = [
        {k: 'inventory_status_socrata', l: 'Status'},
        {k: 'neighborhood', l: 'Neighborhood'},
        {k: 'parcel_id', l: 'Parcel ID'},
      ];
    } else if (layer === 'density') {
      fields = [
        {k: ['pop','population'], l: 'Population', fmt: 'number'},
        {k: ['density','pop_density_sqmi'], l: 'Density (per sq mi)', fmt: 'number'},
        {k: ['hu','housing_units'], l: 'Housing Units', fmt: 'number'},
        {k: ['inc','median_income'], l: 'Median Income', fmt: 'currency'},
        {k: ['hv','median_home_value'], l: 'Median Home Value', fmt: 'currency'},
        {k: ['area','area_sqmi'], l: 'Area (sq mi)'},
        {k: ['name','tract_name'], l: 'Census Tract'},
      ];
    } else if (layer === 'leadreplace') {
      fields = [
        {k: ['dt','permit_issued'], l: 'Date Issued', fmt: 'date'},
        {k: ['desc','description'], l: 'Description'},
        {k: ['contractor','contractor_name'], l: 'Contractor'},
        {k: ['type_detail','permit_type'], l: 'Permit Type'},
        {k: ['nb','neighborhood'], l: 'Neighborhood'},
        {k: ['cd','council_district'], l: 'Council District'},
      ];
    } else if (layer === 'foreclosures') {
      fields = [
        {k: ['pr','sale_price'], l: 'Sale Price', fmt: 'currency'},
        {k: ['dt','sale_date'], l: 'Sale Date', fmt: 'date'},
        {k: ['tos','terms_of_sale'], l: 'Terms (Foreclosure Type)'},
        {k: ['ge','grantee'], l: 'Buyer (Grantee)'},
        {k: ['gr','grantor'], l: 'Seller (Grantor)'},
        {k: ['nb','neighborhood'], l: 'Neighborhood'},
        {k: ['pid','parcel_id'], l: 'Parcel ID'},
      ];
    } else if (layer === 'newbuilds') {
      fields = [
        {k: ['type_detail','permit_type'], l: 'Permit Type'},
        {k: ['status','permit_status'], l: 'Status'},
        {k: ['dt','permit_issued'], l: 'Date Issued', fmt: 'date'},
        {k: ['desc','description'], l: 'Description'},
        {k: ['cost','estimated_cost'], l: 'Estimated Cost', fmt: 'currency'},
        {k: ['contractor','contractor_name'], l: 'Contractor'},
        {k: ['owner','bld_type_use'], l: 'Owner/Use'},
        {k: ['nb','neighborhood'], l: 'Neighborhood'},
        {k: ['cd','council_district'], l: 'Council District'},
      ];
    } else {
      // Generic: show all non-geo fields
      fields = Object.keys(pt)
        .filter(function(k) { return !['latitude','longitude','lat','lng','_lat','_lng','ObjectId','OBJECTID','address_id'].includes(k); })
        .map(function(k) { return {k: k, l: k.replace(/_/g, ' ')}; });
    }

    html += '<div class="popup-fields">';
    fields.forEach(function(f) {
      // Support array of possible key names (abbreviated + full)
      var keys = Array.isArray(f.k) ? f.k : [f.k];
      var val = null;
      for (var i = 0; i < keys.length; i++) {
        if (pt[keys[i]] !== null && pt[keys[i]] !== undefined && pt[keys[i]] !== '') {
          val = pt[keys[i]];
          break;
        }
      }
      if (val === null || val === undefined || val === '') return;
      
      var display = val;
      if (f.fmt === 'currency') display = App.formatCurrencyFull(val);
      else if (f.fmt === 'date') display = App.formatDate(val);
      else display = App.escapeHtml(String(val));
      
      html += '<div class="popup-field"><span class="popup-label">' + f.l + '</span><span class="popup-value">' + display + '</span></div>';
    });
    html += '</div></div>';
    return html;
  }

  function clearLayer(layer) {
    // Density has its own layer group
    if (layer === 'density') {
      if (densityLayerGroup && map && map.hasLayer(densityLayerGroup)) {
        map.removeLayer(densityLayerGroup);
        densityLayerGroup = null;
      }
      delete layerPointsCache[layer];
      return;
    }
    var group = clusterGroups[layer];
    if (group) {
      group.clearLayers();
      if (map && map.hasLayer(group)) {
        map.removeLayer(group);
      }
    }
    if (heatLayers[layer] && map && map.hasLayer(heatLayers[layer])) {
      map.removeLayer(heatLayers[layer]);
    }
    delete layerPointsCache[layer];
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
        marker.bindPopup(popup, { maxWidth: 340, className: 'dark-popup' });
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
