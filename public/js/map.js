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
        {k: 'permit_type', l: 'Permit Type'},
        {k: 'work_description', l: 'Work Description'},
        {k: 'issued_date', l: 'Issued', fmt: 'date'},
        {k: 'submitted_date', l: 'Submitted', fmt: 'date'},
        {k: 'construction_type', l: 'Construction Type'},
        {k: 'current_use_type', l: 'Current Use'},
        {k: 'proposed_use_type', l: 'Proposed Use'},
        {k: 'zoning_designation', l: 'Zoning'},
        {k: 'use_group', l: 'Use Group'},
        {k: 'num_stories', l: 'Stories'},
        {k: 'num_units', l: 'Units'},
        {k: 'amt_permit_cost', l: 'Permit Cost', fmt: 'currency'},
        {k: 'amt_estimated_contractor_cost', l: 'Est. Contractor Cost', fmt: 'currency'},
        {k: 'is_purchased_from_dlba', l: 'DLBA Purchase'},
        {k: 'is_in_dlba_compliance', l: 'DLBA Compliance'},
        {k: 'is_vacant', l: 'Vacant'},
        {k: 'neighborhood', l: 'Neighborhood'},
        {k: 'parcel_id', l: 'Parcel ID'},
      ];
    } else if (layer === 'trades') {
      fields = [
        {k: 'permit_type', l: 'Permit Type'},
        {k: 'work_description', l: 'Work Description'},
        {k: 'issued_date', l: 'Issued', fmt: 'date'},
        {k: 'contact_business_name', l: 'Contractor'},
        {k: 'contact_name', l: 'Contact Name'},
        {k: 'contact_address', l: 'Contractor Address'},
        {k: 'owner_name', l: 'Property Owner'},
        {k: 'neighborhood', l: 'Neighborhood'},
        {k: 'parcel_id', l: 'Parcel ID'},
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
        {k: 'work_description', l: 'Description'},
        {k: 'issued_date', l: 'Date', fmt: 'date'},
        {k: 'demolition_contractor', l: 'Contractor'},
        {k: 'owner_name', l: 'Owner'},
        {k: 'neighborhood', l: 'Neighborhood'},
      ];
    } else if (layer === 'dlba') {
      fields = [
        {k: 'inventory_status_socrata', l: 'Status'},
        {k: 'neighborhood', l: 'Neighborhood'},
        {k: 'parcel_id', l: 'Parcel ID'},
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
