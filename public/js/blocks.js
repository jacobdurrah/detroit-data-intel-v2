/* ============================================================
   Detroit Data Intelligence Platform V2 - Blocks Module
   Block-by-block street analysis with scores, maps, detail
   ============================================================ */
(function () {
  'use strict';

  var PAGE_SIZE = 20;
  var currentPage = 1;
  var totalPages = 1;
  var initialized = false;
  var currentView = 'list';
  var cachedDetail = null;
  var blockDetailMap = null;
  var savedScrollY = 0;

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    loadBlocks();
  }

  function bindEvents() {
    var searchEl = document.getElementById('block-search');
    var sortEl = document.getElementById('block-sort');
    var neighborhoodEl = document.getElementById('block-neighborhood');
    var zipEl = document.getElementById('block-zip');
    var minSalesEl = document.getElementById('block-min-sales');

    if (searchEl) {
      searchEl.addEventListener('input', App.debounce(function () {
        currentPage = 1;
        loadBlocks();
      }, 300));
    }
    if (sortEl) sortEl.addEventListener('change', function () { currentPage = 1; loadBlocks(); });
    if (neighborhoodEl) neighborhoodEl.addEventListener('change', function () { currentPage = 1; loadBlocks(); });
    if (zipEl) {
      zipEl.addEventListener('input', App.debounce(function () {
        currentPage = 1;
        loadBlocks();
      }, 300));
    }
    if (minSalesEl) minSalesEl.addEventListener('change', function () { currentPage = 1; loadBlocks(); });

    document.getElementById('blocks-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-street-id]');
      if (card) {
        savedScrollY = window.scrollY;
        showBlockDetail(card.getAttribute('data-street-id'));
      }
    });
  }

  function getFilters() {
    return {
      search: (document.getElementById('block-search') || {}).value || '',
      neighborhood: (document.getElementById('block-neighborhood') || {}).value || '',
      zip: (document.getElementById('block-zip') || {}).value || '',
      min_sales: parseInt((document.getElementById('block-min-sales') || {}).value) || 0,
      sort: (document.getElementById('block-sort') || {}).value || 'recent_sales',
      order: 'desc',
      page: currentPage,
      limit: PAGE_SIZE
    };
  }

  async function loadBlocks() {
    currentView = 'list';
    var listEl = document.getElementById('blocks-list');
    var paginationEl = document.getElementById('blocks-pagination');
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = '';

    App.showLoading(listEl);
    paginationEl.innerHTML = '';

    try {
      var filters = getFilters();
      var resp = await App.api('blocks', filters);
      var blocks = resp.data || [];
      var meta = resp.meta || {};
      var total = meta.total || blocks.length;
      totalPages = meta.pages || Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (!blocks.length) {
        App.showEmpty(listEl, 'No blocks match your filters.');
        return;
      }

      renderCards(listEl, blocks);

      App.renderPagination(paginationEl, currentPage, totalPages, function (page) {
        currentPage = page;
        loadBlocks();
      });

      // Restore scroll position if returning from detail
      if (savedScrollY > 0) {
        setTimeout(function () { window.scrollTo(0, savedScrollY); savedScrollY = 0; }, 50);
      }

      var start = (currentPage - 1) * PAGE_SIZE + 1;
      var end = Math.min(currentPage * PAGE_SIZE, total);
      var infoEl = document.createElement('span');
      infoEl.className = 'page-info';
      infoEl.textContent = 'Showing ' + start + '\u2013' + end + ' of ' + App.formatNumber(total);
      paginationEl.insertBefore(infoEl, paginationEl.firstChild);
    } catch (e) {
      App.showError(listEl, 'Failed to load blocks: ' + e.message, loadBlocks);
    }
  }

  function renderCards(container, blocks) {
    var html = '';
    blocks.forEach(function (b) {
      var addrRange = '';
      if (b.from_addr_left && b.to_addr_left) {
        addrRange = ' (' + b.from_addr_left + '\u2013' + b.to_addr_left + ')';
      }
      var streetName = b.full_street_name || b.street_name || 'Unknown';
      var score = Number(b.block_score) || 0;
      var scoreColor = score >= 70 ? 'var(--success)' : score >= 40 ? 'var(--warning)' : 'var(--danger)';

      html +=
        '<div class="card card-clickable" data-street-id="' + b.street_id + '">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(streetName) + App.escapeHtml(addrRange) + '</span>' +
            (score > 0 ? '<span class="block-score-badge" style="background:' + scoreColor + ';">' + score.toFixed(0) + '</span>' : '') +
          '</div>' +
          '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">' +
            (b.neighborhood ? '<span class="reason-tag" style="margin-right:4px;">' + App.escapeHtml(b.neighborhood) + '</span>' : '') +
            (b.zip_code ? '<span style="color:var(--text-dim);">ZIP ' + App.escapeHtml(b.zip_code) + '</span>' : '') +
          '</div>' +
          '<div class="block-metrics">' +
            '<div class="block-metric"><span class="metric-value">' + App.formatNumber(b.recent_sales) + '</span><span class="metric-label">Recent Sales</span></div>' +
            '<div class="block-metric"><span class="metric-value">' + App.formatNumber(b.total_sales) + '</span><span class="metric-label">Total Sales</span></div>' +
            '<div class="block-metric"><span class="metric-value">' + App.formatCurrency(b.avg_price) + '</span><span class="metric-label">Avg Price</span></div>' +
            '<div class="block-metric"><span class="metric-value">' + App.formatNumber(b.address_count) + '</span><span class="metric-label">Addresses</span></div>' +
          '</div>' +
          '<div class="card-footer">View block detail \u2192</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  async function showBlockDetail(streetId, skipHash) {
    if (!streetId) return;
    currentView = 'detail';

    var listEl = document.getElementById('blocks-list');
    var paginationEl = document.getElementById('blocks-pagination');
    paginationEl.innerHTML = '';

    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = 'none';

    // Push URL state for deep linking
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

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(streetName) + App.escapeHtml(addrRange) + '</h2>';
    html += '<div style="font-size:13px;color:var(--text-muted);margin:4px 0 12px;">';
    if (sc.neighborhoods && sc.neighborhoods.length) {
      html += App.escapeHtml(sc.neighborhoods.join(', '));
    }
    if (sc.zip_codes && sc.zip_codes.length) {
      html += ' &middot; ZIP ' + App.escapeHtml(sc.zip_codes.join(', '));
    }
    html += '</div>';

    // Score summary cards
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
    html += '<div class="map-legend" style="margin-top:6px;">';
    html += '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span> Recent Sale</div>';
    html += '<div class="legend-item"><span class="legend-dot" style="background:#6b7280;"></span> Address</div>';
    html += '</div>';
    html += '</div>';

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
        html += '<div class="card-header">';
        html += '<span class="card-title">' + App.escapeHtml((b.street_number || '') + ' ' + (b.street_name || '')) + '</span>';
        html += '<span class="card-badge" style="background:var(--danger);color:white;">' + App.formatCurrencyFull(b.fine_amount) + '</span>';
        html += '</div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Date</span><span class="kv-value">' + App.formatDate(b.ticket_issued_date) + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Violation</span><span class="kv-value">' + App.escapeHtml(b.violation_description || '--') + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Disposition</span><span class="kv-value">' + App.escapeHtml(b.disposition || '--') + '</span></div>';
        if (b.balance_due) html += '<div class="kv-item"><span class="kv-label">Balance Due</span><span class="kv-value">' + App.formatCurrencyFull(b.balance_due) + '</span></div>';
        html += '</div></div>';
      });
      if (blightData.length > 20) {
        html += '<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px;">Showing 20 of ' + blightData.length + ' tickets</p>';
      }
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
        html += '<div class="card-header">';
        html += '<span class="card-title">' + App.escapeHtml(p.address || p.permit_no || '--') + '</span>';
        html += '<span class="specialty-badge">' + App.escapeHtml(p.permit_type || '--') + '</span>';
        html += '</div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Permit #</span><span class="kv-value">' + App.escapeHtml(p.permit_no || '--') + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Issued</span><span class="kv-value">' + App.formatDate(p.permit_issued) + '</span></div>';
        if (p.description) html += '<div class="kv-item"><span class="kv-label">Description</span><span class="kv-value">' + App.escapeHtml(p.description) + '</span></div>';
        if (p.estimated_cost) html += '<div class="kv-item"><span class="kv-label">Est. Cost</span><span class="kv-value">' + App.formatCurrencyFull(p.estimated_cost) + '</span></div>';
        if (p.contractor_name) html += '<div class="kv-item"><span class="kv-label">Contractor</span><span class="kv-value">' + App.escapeHtml(p.contractor_name) + '</span></div>';
        html += '</div></div>';
      });
      if (permits.length > 20) {
        html += '<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px;">Showing 20 of ' + permits.length + ' permits</p>';
      }
    } else {
      html += '<p class="empty-state" style="padding:12px;">No permits for this block.</p>';
    }
    html += '</div></div>';

    html += '</div>';
    container.innerHTML = html;

    // Init map after DOM render
    setTimeout(function () { initBlockMap(detail); }, 100);
  }

  function renderSalesTable(sales) {
    var html = '<div style="overflow-x:auto;">';
    html += '<table class="data-table" style="display:table;width:100%;">';
    html += '<thead><tr>';
    html += '<th>Date</th><th>Address</th><th>Price</th><th>Buyer</th><th>Seller</th><th>Terms</th>';
    html += '</tr></thead><tbody>';

    var displaySales = sales.slice(0, 50);
    displaySales.forEach(function (s) {
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
    if (sales.length > 50) {
      html += '<p style="text-align:center;color:var(--text-muted);font-size:12px;padding:8px;">Showing 50 of ' + sales.length + ' sales</p>';
    }
    html += '</div>';
    return html;
  }

  function initBlockMap(detail) {
    var mapEl = document.getElementById('block-detail-map');
    if (!mapEl || !window.L) return;

    var st = detail.street || {};
    var addresses = detail.addresses || [];
    var sales = detail.sales || [];

    var centerLat = st.center_lat || 42.3314;
    var centerLng = st.center_lng || -83.0458;

    blockDetailMap = L.map('block-detail-map', {
      center: [centerLat, centerLng],
      zoom: 16,
      zoomControl: true
    });

    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '\u00a9 OSM \u00a9 CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(blockDetailMap);

    var group = L.featureGroup();

    // Build set of addresses with recent sales (last 12 months)
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
      var addrStr = ((a.street_number || '') + ' ' + (a.street_name || '') + ' ' + (a.street_type || '')).toUpperCase().trim();
      var isRecent = recentSaleAddresses.has(addrStr);

      // Also check by just street_number + street_name
      if (!isRecent) {
        var shortAddr = ((a.street_number || '') + ' ' + (a.street_name || '')).toUpperCase().trim();
        recentSaleAddresses.forEach(function (sa) {
          if (sa.indexOf(shortAddr) === 0) isRecent = true;
        });
      }

      var color = isRecent ? '#10b981' : '#6b7280';
      var popup = '<div class="popup-content">' +
        '<div class="popup-address">' + App.escapeHtml((a.street_number || '') + ' ' + (a.street_name || '') + ' ' + (a.street_type || '')) + '</div>' +
        '<div class="popup-fields">' +
        (a.parcel_id ? '<div class="popup-field"><span class="popup-label">Parcel</span><span class="popup-value">' + App.escapeHtml(a.parcel_id) + '</span></div>' : '') +
        (a.neighborhood ? '<div class="popup-field"><span class="popup-label">Neighborhood</span><span class="popup-value">' + App.escapeHtml(a.neighborhood) + '</span></div>' : '') +
        '</div></div>';

      L.circleMarker([a.latitude, a.longitude], {
        radius: 6, fillColor: color, color: color, weight: 1, opacity: 0.9, fillOpacity: 0.7
      }).bindPopup(popup, { className: 'dark-popup', maxWidth: 300 }).addTo(group);
    });

    group.addTo(blockDetailMap);
    if (group.getBounds().isValid()) {
      blockDetailMap.fitBounds(group.getBounds(), { padding: [30, 30] });
    }
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
    if (!preservePage) {
      // Don't reset page — keep where the user was
    }
    cachedDetail = null;
    blockDetailMap = null;

    // Update URL to list view
    if (App.setHashRoute) {
      App.setHashRoute('blocks', null, null, true);
    }

    loadBlocks();
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
