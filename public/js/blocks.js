/* ============================================================
   Detroit Data Intelligence Platform V2 - Blocks Module
   Block-by-block street analysis with client-side scoring
   ============================================================ */
(function () {
  'use strict';

  var initialized = false;
  var currentView = 'list';
  var rawBlocks = [];
  var cachedDetail = null;
  var blockDetailMap = null;
  var savedScrollY = 0;
  var showEmpty = false;

  var scoreWeights = {
    recent_sales: 30,
    median_price: 25,
    investor_activity: 20,
    blight: 15,
    permits: 10
  };

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    loadBlocks();
  }

  function bindEvents() {
    var searchEl = document.getElementById('block-search');
    if (searchEl) {
      searchEl.addEventListener('input', App.debounce(function () { loadBlocks(); }, 300));
    }

    var neighborhoodEl = document.getElementById('block-neighborhood');
    if (neighborhoodEl) neighborhoodEl.addEventListener('change', function () { loadBlocks(); });

    var zipEl = document.getElementById('block-zip');
    if (zipEl) {
      zipEl.addEventListener('input', App.debounce(function () { loadBlocks(); }, 300));
    }

    var timeEl = document.getElementById('block-time-range');
    if (timeEl) timeEl.addEventListener('change', function () { loadBlocks(); });

    var sortEl = document.getElementById('block-sort');
    if (sortEl) sortEl.addEventListener('change', function () { recalculate(); });

    var showEmptyEl = document.getElementById('block-show-empty');
    if (showEmptyEl) {
      showEmptyEl.addEventListener('change', function () {
        showEmpty = this.checked;
        recalculate();
      });
    }

    var toggleBtn = document.getElementById('block-weights-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var panel = document.getElementById('block-weights-panel');
        if (panel) panel.classList.toggle('open');
      });
    }

    // Weight slider listeners
    document.querySelectorAll('#block-weights-panel input[type="range"]').forEach(function (slider) {
      slider.addEventListener('input', function () {
        var key = this.getAttribute('data-weight');
        var val = parseInt(this.value);
        this.nextElementSibling.textContent = val;
        if (scoreWeights.hasOwnProperty(key)) {
          scoreWeights[key] = val;
          recalculate();
        }
      });
    });

    // Price range filters
    var minPriceEl = document.getElementById('block-min-price');
    var maxPriceEl = document.getElementById('block-max-price');
    if (minPriceEl) minPriceEl.addEventListener('input', App.debounce(function () { recalculate(); }, 300));
    if (maxPriceEl) maxPriceEl.addEventListener('input', App.debounce(function () { recalculate(); }, 300));

    // Min sales filter
    var minSalesEl = document.getElementById('block-min-sales');
    if (minSalesEl) minSalesEl.addEventListener('change', function () { recalculate(); });

    document.getElementById('blocks-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-street-id]');
      if (card) {
        savedScrollY = window.scrollY;
        showBlockDetail(card.getAttribute('data-street-id'));
      }
    });
  }

  function recalculate() {
    if (!rawBlocks.length) return;

    var filtered = rawBlocks.slice();

    // Filter by min sales
    var minSales = parseInt((document.getElementById('block-min-sales') || {}).value) || 0;
    if (minSales > 0) {
      filtered = filtered.filter(function (b) { return (b.recent_sales || 0) >= minSales; });
    }

    // Filter by price range (based on recent avg price or median)
    var minPrice = parseInt((document.getElementById('block-min-price') || {}).value) || 0;
    var maxPrice = parseInt((document.getElementById('block-max-price') || {}).value) || 0;
    if (minPrice > 0) {
      filtered = filtered.filter(function (b) {
        var price = b.recent_avg_price || b.median_price || b.avg_price || 0;
        return price >= minPrice;
      });
    }
    if (maxPrice > 0) {
      filtered = filtered.filter(function (b) {
        var price = b.recent_avg_price || b.median_price || b.avg_price || 0;
        return price <= maxPrice;
      });
    }

    // Filter empty blocks
    if (!showEmpty) {
      filtered = filtered.filter(function (b) { return (b.recent_sales || 0) > 0; });
    }

    // Compute percentiles for scoring
    var maxRecentSales = Math.max.apply(null, filtered.map(function (b) { return b.recent_sales || 0; })) || 1;
    var maxMedianPrice = Math.max.apply(null, filtered.map(function (b) { return b.median_price || 0; })) || 1;
    var maxInvestor = Math.max.apply(null, filtered.map(function (b) { return b.llc_buyers || 0; })) || 1;
    var maxBlight = Math.max.apply(null, filtered.map(function (b) { return b.total_blight || 0; })) || 1;
    var maxPermits = Math.max.apply(null, filtered.map(function (b) { return b.total_permits || 0; })) || 1;

    var totalWeight = scoreWeights.recent_sales + scoreWeights.median_price +
      scoreWeights.investor_activity + scoreWeights.blight + scoreWeights.permits;
    if (totalWeight === 0) totalWeight = 1;

    filtered = filtered.map(function (b) {
      var recentPct = (b.recent_sales || 0) / maxRecentSales;
      var pricePct = (b.median_price || 0) / maxMedianPrice;
      var investorPct = (b.llc_buyers || 0) / maxInvestor;
      var blightPct = (b.total_blight || 0) / maxBlight;
      var permitPct = (b.total_permits || 0) / maxPermits;

      var weighted =
        recentPct * scoreWeights.recent_sales +
        pricePct * scoreWeights.median_price +
        investorPct * scoreWeights.investor_activity +
        (1 - blightPct) * scoreWeights.blight +
        permitPct * scoreWeights.permits;

      var score = Math.round(weighted / totalWeight * 100);

      return Object.assign({}, b, {
        score: score,
        score_components: {
          recent_sales_pct: recentPct,
          median_price_pct: pricePct,
          investor_pct: investorPct,
          blight_pct: blightPct,
          permits_pct: permitPct
        }
      });
    });

    // Sort
    var sortVal = (document.getElementById('block-sort') || {}).value || 'score';
    filtered.sort(function (a, b) {
      switch (sortVal) {
        case 'recent_sales': return (b.recent_sales || 0) - (a.recent_sales || 0);
        case 'total_sales': return (b.total_sales || 0) - (a.total_sales || 0);
        case 'median_price': return (b.median_price || 0) - (a.median_price || 0);
        case 'avg_price': return (b.avg_price || 0) - (a.avg_price || 0);
        case 'investors': return (b.llc_buyers || 0) - (a.llc_buyers || 0);
        case 'blight': return (a.total_blight || 0) - (b.total_blight || 0);
        default: return (b.score || 0) - (a.score || 0);
      }
    });

    renderCards(document.getElementById('blocks-list'), filtered);
  }

  async function loadBlocks() {
    currentView = 'list';
    var listEl = document.getElementById('blocks-list');
    var filterBar = document.querySelector('#tab-blocks .filter-bar');
    var weightsPanel = document.getElementById('block-weights-panel');
    var priceFilters = document.getElementById('block-price-filters');
    if (filterBar) filterBar.style.display = '';
    if (weightsPanel) weightsPanel.style.display = '';
    if (priceFilters) priceFilters.style.display = '';

    App.showLoading(listEl);

    try {
      var params = {
        search: (document.getElementById('block-search') || {}).value || '',
        neighborhood: (document.getElementById('block-neighborhood') || {}).value || '',
        zip: (document.getElementById('block-zip') || {}).value || '',
        time_range: (document.getElementById('block-time-range') || {}).value || '1y',
        limit: 500
      };

      var resp = await App.api('blocks', params);
      rawBlocks = resp.data || [];

      if (!rawBlocks.length) {
        App.showEmpty(listEl, 'No blocks match your filters.');
        return;
      }

      recalculate();
    } catch (e) {
      App.showError(listEl, 'Failed to load blocks: ' + e.message, loadBlocks);
    }
  }

  function renderCards(container, blocks) {
    var html = '<div class="blocks-count" style="padding:0 12px 8px;color:var(--text-muted);font-size:13px;">' +
      'Showing ' + blocks.length + ' blocks</div>';

    blocks.forEach(function (b) {
      var streetName = b.full_street_name || b.street_name || 'Unknown';
      var addrRange = '';
      if (b.from_addr_left && b.to_addr_left) {
        addrRange = ' (' + b.from_addr_left + '\u2013' + b.to_addr_left + ')';
      }
      var score = Number(b.score) || 0;
      var scoreClass = score >= 70 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
      var sc = b.score_components || {};
      var displayPrice = b.recent_avg_price || b.median_price || b.avg_price || 0;

      html +=
        '<div class="card card-clickable" data-street-id="' + b.street_id + '">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(streetName) + App.escapeHtml(addrRange) + '</span>' +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px;">' +
            (b.neighborhood ? '<span class="reason-tag" style="margin-right:4px;">' + App.escapeHtml(b.neighborhood) + '</span>' : '') +
            (b.zip_code ? '<span style="color:var(--text-dim);">ZIP ' + App.escapeHtml(b.zip_code) + '</span>' : '') +
          '</div>' +
          '<div class="score-bar-container">' +
            '<div class="score-label">' +
              '<span class="score-text">Block Score</span>' +
              '<span class="score-num ' + scoreClass + '">' + score + '</span>' +
            '</div>' +
            '<div class="score-bar-bg">' +
              '<div class="score-bar-fill ' + scoreClass + '" style="width:' + Math.min(100, score) + '%"></div>' +
            '</div>' +
          '</div>' +
          renderBreakdownBar(sc) +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Recent Sales</span><span class="metric-value">' + App.formatNumber(b.recent_sales) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Total Sales</span><span class="metric-value">' + App.formatNumber(b.total_sales) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Med. Price</span><span class="metric-value">' + App.formatCurrency(b.median_price) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Recent Avg</span><span class="metric-value">' + App.formatCurrency(displayPrice) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">LLC Buyers</span><span class="metric-value">' + App.formatNumber(b.llc_buyers) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Addresses</span><span class="metric-value">' + App.formatNumber(b.address_count) + '</span></div>' +
          '</div>' +
          '<div class="card-footer">View block detail \u2192</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  function renderBreakdownBar(sc) {
    if (!sc) return '';
    var totalWeight = scoreWeights.recent_sales + scoreWeights.median_price +
      scoreWeights.investor_activity + scoreWeights.blight + scoreWeights.permits;
    if (totalWeight === 0) return '';

    var segments = [
      { pct: (sc.recent_sales_pct || 0) * scoreWeights.recent_sales / totalWeight * 100, color: '#3b82f6', label: 'Sales' },
      { pct: (sc.median_price_pct || 0) * scoreWeights.median_price / totalWeight * 100, color: '#10b981', label: 'Price' },
      { pct: (sc.investor_pct || 0) * scoreWeights.investor_activity / totalWeight * 100, color: '#8b5cf6', label: 'Investors' },
      { pct: (1 - (sc.blight_pct || 0)) * scoreWeights.blight / totalWeight * 100, color: '#ef4444', label: 'Low Blight' },
      { pct: (sc.permits_pct || 0) * scoreWeights.permits / totalWeight * 100, color: '#06b6d4', label: 'Permits' }
    ];

    var html = '<div class="score-breakdown">';
    segments.forEach(function (s) {
      if (s.pct > 0.5) {
        html += '<div class="breakdown-seg" style="width:' + s.pct.toFixed(1) + '%;background:' + s.color + ';" title="' + s.label + ': ' + s.pct.toFixed(0) + '%"></div>';
      }
    });
    html += '</div>';
    return html;
  }

  async function showBlockDetail(streetId, skipHash) {
    if (!streetId) return;
    currentView = 'detail';

    var listEl = document.getElementById('blocks-list');
    var filterBar = document.querySelector('#tab-blocks .filter-bar');
    var weightsPanel = document.getElementById('block-weights-panel');
    var priceFilters = document.getElementById('block-price-filters');
    if (filterBar) filterBar.style.display = 'none';
    if (weightsPanel) weightsPanel.style.display = 'none';
    if (priceFilters) priceFilters.style.display = 'none';

    if (!skipHash && App.setHashRoute) {
      App.setHashRoute('blocks', streetId);
    }

    App.showLoading(listEl);

    try {
      var data = await App.api('block/' + streetId);
      if (!data.data) throw new Error('No data returned');
      cachedDetail = data.data;
      blockDetailMap = null;
      renderBlockDetail(listEl, data.data);
    } catch (e) {
      App.showError(listEl, 'Failed to load block: ' + e.message, function () { showBlockDetail(streetId); });
    }
  }

  function renderBlockDetail(container, detail) {
    var st = detail.street || {};
    var sc = detail.score || {};
    var addresses = detail.addresses || [];
    var sales = detail.sales || [];
    var blightData = detail.blight || [];
    var permits = detail.permits || [];

    var streetName = st.full_street_name || st.street_name || 'Unknown';
    var addrRange = '';
    if (st.from_addr_left && st.to_addr_left) {
      addrRange = ' (' + st.from_addr_left + '\u2013' + st.to_addr_left + ')';
    }

    var html = '<div class="detail-view">';
    html += '<button class="btn-back" onclick="BlocksModule.backToList()">\u2190 Back to blocks</button>';

    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(streetName) + App.escapeHtml(addrRange) + '</h2>';
    html += '<div style="font-size:13px;color:var(--text-muted);margin:4px 0 12px;">';
    if (sc.neighborhoods && sc.neighborhoods.length) html += App.escapeHtml(sc.neighborhoods.join(', '));
    if (sc.zip_codes && sc.zip_codes.length) html += ' &middot; ZIP ' + App.escapeHtml(sc.zip_codes.join(', '));
    html += '</div>';

    html += '<div class="block-metrics">';
    html += '<div class="block-metric"><span class="metric-value">' + App.formatNumber(sc.addresses) + '</span><span class="metric-label">Addresses</span></div>';
    html += '<div class="block-metric"><span class="metric-value">' + App.formatNumber(sc.total_sales) + '</span><span class="metric-label">Total Sales</span></div>';
    html += '<div class="block-metric"><span class="metric-value">' + App.formatNumber(sc.recent_sales_12mo) + '</span><span class="metric-label">Recent Sales</span></div>';
    html += '<div class="block-metric"><span class="metric-value">' + App.formatCurrency(sc.avg_sale_price) + '</span><span class="metric-label">Avg Price</span></div>';
    html += '<div class="block-metric"><span class="metric-value">' + App.formatPercent(sc.investor_pct, 0) + '</span><span class="metric-label">Investor %</span></div>';
    html += '<div class="block-metric"><span class="metric-value">' + App.formatNumber(sc.total_blight) + '</span><span class="metric-label">Blight</span></div>';
    html += '</div>';
    html += '</div>';

    // Map
    html += '<div style="margin:16px 0;">';
    html += '<h3 style="margin-bottom:8px;">Block Map</h3>';
    html += '<div id="block-detail-map" style="height:280px;border-radius:8px;border:1px solid var(--border);"></div>';
    html += '<div class="map-legend" style="margin-top:6px;display:flex;gap:12px;font-size:12px;color:var(--text-muted);">';
    html += '<div class="legend-item"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#10b981;margin-right:4px;"></span>Recent Sale</div>';
    html += '<div class="legend-item"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#6b7280;margin-right:4px;"></span>Address</div>';
    html += '</div></div>';

    // Sales History
    html += '<div class="block-section">';
    html += '<h3 class="block-section-header" onclick="BlocksModule.toggleSection(\'sales\')" style="cursor:pointer;">';
    html += 'Sales History (' + sales.length + ') <span id="block-sales-arrow">\u25BC</span></h3>';
    html += '<div id="block-sales-section">';
    if (sales.length) {
      html += renderSalesTable(sales);
    } else {
      html += '<p class="empty-state" style="padding:12px;">No sales recorded for this block.</p>';
    }
    html += '</div></div>';

    // Blight
    html += '<div class="block-section">';
    html += '<h3 class="block-section-header" onclick="BlocksModule.toggleSection(\'blight\')" style="cursor:pointer;">';
    html += 'Blight Tickets (' + blightData.length + ') <span id="block-blight-arrow">\u25B6</span></h3>';
    html += '<div id="block-blight-section" style="display:none;">';
    if (blightData.length) {
      blightData.slice(0, 20).forEach(function (b) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml((b.street_number || '') + ' ' + (b.street_name || '')) + '</span>';
        html += '<span class="card-badge" style="background:var(--danger);color:white;">' + App.formatCurrencyFull(b.fine_amount) + '</span></div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Date</span><span class="kv-value">' + App.formatDate(b.ticket_issued_date) + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Violation</span><span class="kv-value">' + App.escapeHtml(b.violation_description || '--') + '</span></div>';
        html += '</div></div>';
      });
    } else {
      html += '<p class="empty-state" style="padding:12px;">No blight tickets for this block.</p>';
    }
    html += '</div></div>';

    // Permits
    html += '<div class="block-section">';
    html += '<h3 class="block-section-header" onclick="BlocksModule.toggleSection(\'permits\')" style="cursor:pointer;">';
    html += 'Permits (' + permits.length + ') <span id="block-permits-arrow">\u25B6</span></h3>';
    html += '<div id="block-permits-section" style="display:none;">';
    if (permits.length) {
      permits.slice(0, 20).forEach(function (p) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(p.address || p.permit_no || '--') + '</span>';
        html += '<span class="specialty-badge">' + App.escapeHtml(p.permit_type || '--') + '</span></div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Issued</span><span class="kv-value">' + App.formatDate(p.permit_issued) + '</span></div>';
        if (p.description) html += '<div class="kv-item"><span class="kv-label">Description</span><span class="kv-value">' + App.escapeHtml(p.description) + '</span></div>';
        if (p.estimated_cost) html += '<div class="kv-item"><span class="kv-label">Est. Cost</span><span class="kv-value">' + App.formatCurrencyFull(p.estimated_cost) + '</span></div>';
        html += '</div></div>';
      });
    } else {
      html += '<p class="empty-state" style="padding:12px;">No permits for this block.</p>';
    }
    html += '</div></div>';

    html += '</div>';
    container.innerHTML = html;
    setTimeout(function () { initBlockMap(detail); }, 100);
  }

  function renderSalesTable(sales) {
    var html = '<div style="overflow-x:auto;">';
    html += '<table class="data-table" style="display:table;width:100%;">';
    html += '<thead><tr><th>Date</th><th>Address</th><th>Price</th><th>Buyer</th><th>Seller</th><th>Terms</th></tr></thead><tbody>';
    sales.slice(0, 50).forEach(function (s) {
      html += '<tr>';
      html += '<td>' + App.formatDate(s.sale_date) + '</td>';
      html += '<td>' + App.escapeHtml(s.address || '--') + '</td>';
      html += '<td>' + App.formatCurrencyFull(s.sale_price) + '</td>';
      html += '<td>' + App.escapeHtml(s.grantee || '--') + '</td>';
      html += '<td>' + App.escapeHtml(s.grantor || '--') + '</td>';
      html += '<td>' + App.escapeHtml(s.terms_of_sale || '--') + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table>';
    if (sales.length > 50) html += '<p style="text-align:center;color:var(--text-muted);font-size:12px;">Showing 50 of ' + sales.length + '</p>';
    html += '</div>';
    return html;
  }

  function initBlockMap(detail) {
    var mapEl = document.getElementById('block-detail-map');
    if (!mapEl || !window.L) return;

    var st = detail.street || {};
    var addresses = detail.addresses || [];
    var sales = detail.sales || [];

    blockDetailMap = L.map('block-detail-map', {
      center: [st.center_lat || 42.3314, st.center_lng || -83.0458],
      zoom: 16, zoomControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '\u00a9 OSM \u00a9 CARTO', subdomains: 'abcd', maxZoom: 19
    }).addTo(blockDetailMap);

    var group = L.featureGroup();
    var now = new Date();
    var oneYearAgo = new Date(now - 365 * 24 * 60 * 60 * 1000);
    var recentSaleAddresses = new Set();
    sales.forEach(function (s) {
      if (new Date(s.sale_date) >= oneYearAgo && s.address) {
        recentSaleAddresses.add(s.address.toUpperCase().trim());
      }
    });

    addresses.forEach(function (a) {
      if (!a.latitude || !a.longitude) return;
      var shortAddr = ((a.street_number || '') + ' ' + (a.street_name || '')).toUpperCase().trim();
      var isRecent = false;
      recentSaleAddresses.forEach(function (sa) { if (sa.indexOf(shortAddr) === 0) isRecent = true; });
      var color = isRecent ? '#10b981' : '#6b7280';

      L.circleMarker([a.latitude, a.longitude], {
        radius: 6, fillColor: color, color: color, weight: 1, opacity: 0.9, fillOpacity: 0.7
      }).bindPopup(
        '<div class="popup-content"><div class="popup-address">' + App.escapeHtml(shortAddr) + '</div>' +
        (a.parcel_id ? '<div style="font-size:11px;color:#999;">Parcel: ' + App.escapeHtml(a.parcel_id) + '</div>' : '') +
        '</div>', { className: 'dark-popup', maxWidth: 300 }
      ).addTo(group);
    });

    group.addTo(blockDetailMap);
    if (group.getBounds().isValid()) blockDetailMap.fitBounds(group.getBounds(), { padding: [30, 30] });
  }

  function toggleSection(section) {
    var el = document.getElementById('block-' + section + '-section');
    var arrow = document.getElementById('block-' + section + '-arrow');
    if (!el) return;
    var isHidden = el.style.display === 'none';
    el.style.display = isHidden ? '' : 'none';
    if (arrow) arrow.textContent = isHidden ? '\u25BC' : '\u25B6';
  }

  function backToList(preservePage) {
    currentView = 'list';
    cachedDetail = null;
    blockDetailMap = null;
    if (App.setHashRoute) App.setHashRoute('blocks', null, null, true);
    // Re-render from cache instead of re-fetching
    if (rawBlocks.length) {
      var listEl = document.getElementById('blocks-list');
      var filterBar = document.querySelector('#tab-blocks .filter-bar');
      var weightsPanel = document.getElementById('block-weights-panel');
      var priceFilters = document.getElementById('block-price-filters');
      if (filterBar) filterBar.style.display = '';
      if (weightsPanel) weightsPanel.style.display = '';
      if (priceFilters) priceFilters.style.display = '';
      recalculate();
      if (savedScrollY > 0) {
        setTimeout(function () { window.scrollTo(0, savedScrollY); savedScrollY = 0; }, 50);
      }
    } else {
      loadBlocks();
    }
  }

  function refresh() {
    if (currentView === 'list') loadBlocks();
  }

  window.BlocksModule = {
    init: init,
    refresh: refresh,
    showBlockDetail: showBlockDetail,
    backToList: backToList,
    toggleSection: toggleSection
  };

})();
