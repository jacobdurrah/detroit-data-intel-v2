/* ============================================================
   Detroit Data Intelligence Platform V2 - Investors Module
   ============================================================ */
(function () {
  'use strict';

  var PAGE_SIZE = 20;
  var currentPage = 1;
  var totalPages = 1;
  var initialized = false;
  var isDesktop = false;
  var currentView = 'list';
  var detailPage = 1;
  var detailFilter = '';
  var cachedDetail = null;
  var investorDetailMap = null;

  // Sale field labels for key-value display
  var SALE_FIELDS = {
    id: 'Sale ID', pid: 'Parcel ID', addr: 'Address', dt: 'Sale Date',
    pr: 'Sale Price', gr: 'Grantor (Seller)', ge: 'Grantee (Buyer)',
    tos: 'Term of Sale', si: 'Sale Instrument', pcc: 'Property Class Code',
    pcd: 'Property Class Desc', nb: 'Neighborhood', ecf: 'ECF Neighborhood',
    cd: 'Council District', zip: 'ZIP Code', lat: 'Latitude', lng: 'Longitude'
  };

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    checkViewport();
    window.addEventListener('resize', App.debounce(checkViewport, 200));
    loadInvestors();
  }

  function checkViewport() {
    isDesktop = window.innerWidth >= 1024;
  }

  function bindEvents() {
    var searchEl = document.getElementById('investor-search');
    var sortEl = document.getElementById('investor-sort');
    var dateFromEl = document.getElementById('investor-date-from');
    var dateToEl = document.getElementById('investor-date-to');
    var minPurchEl = document.getElementById('investor-min-purchases');
    var maxPurchEl = document.getElementById('investor-max-purchases');

    if (searchEl) {
      searchEl.addEventListener('input', App.debounce(function () {
        currentPage = 1;
        loadInvestors();
      }, 300));
    }
    if (sortEl) {
      sortEl.addEventListener('change', function () { currentPage = 1; loadInvestors(); });
    }
    if (dateFromEl) {
      dateFromEl.addEventListener('change', function () { currentPage = 1; loadInvestors(); });
    }
    if (dateToEl) {
      dateToEl.addEventListener('change', function () { currentPage = 1; loadInvestors(); });
    }
    if (minPurchEl) {
      minPurchEl.addEventListener('change', function () { currentPage = 1; loadInvestors(); });
    }
    if (maxPurchEl) {
      maxPurchEl.addEventListener('change', function () { currentPage = 1; loadInvestors(); });
    }

    document.getElementById('investors-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-investor], tr[data-investor]');
      if (card) {
        showInvestorDetail(card.getAttribute('data-investor'));
      }
    });
  }

  function getFilters() {
    var minP = parseInt((document.getElementById('investor-min-purchases') || {}).value) || 2;
    var maxP = parseInt((document.getElementById('investor-max-purchases') || {}).value) || 0;
    var filters = {
      search: (document.getElementById('investor-search') || {}).value || '',
      sort: (document.getElementById('investor-sort') || {}).value || 'total_purchases',
      min_purchases: minP,
      page: currentPage,
      limit: PAGE_SIZE
    };
    var dateFrom = (document.getElementById('investor-date-from') || {}).value || '';
    var dateTo = (document.getElementById('investor-date-to') || {}).value || '';
    if (dateFrom) filters.date_from = dateFrom;
    if (dateTo) filters.date_to = dateTo;
    if (maxP > 0) filters.max_purchases = maxP;
    return filters;
  }

  async function loadInvestors() {
    currentView = 'list';
    var listEl = document.getElementById('investors-list');
    var paginationEl = document.getElementById('investors-pagination');
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = '';

    App.showLoading(listEl);
    paginationEl.innerHTML = '';

    try {
      var filters = getFilters();
      var data = await App.api('investors', filters);
      var investors = data.data || data.investors || data || [];
      var total = data.total || data.count || investors.length;
      totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (!investors.length) {
        App.showEmpty(listEl, 'No investors match your filters.');
        return;
      }

      if (isDesktop) {
        renderTable(listEl, investors);
      } else {
        renderCards(listEl, investors);
      }

      App.renderPagination(paginationEl, currentPage, totalPages, function (page) {
        currentPage = page;
        loadInvestors();
      });

      // Show total count
      var start = (currentPage - 1) * PAGE_SIZE + 1;
      var end = Math.min(currentPage * PAGE_SIZE, total);
      var infoEl = document.createElement('span');
      infoEl.className = 'page-info';
      infoEl.textContent = 'Showing ' + start + '\u2013' + end + ' of ' + App.formatNumber(total);
      paginationEl.insertBefore(infoEl, paginationEl.firstChild);
    } catch (e) {
      App.showError(listEl, 'Failed to load investors: ' + e.message, loadInvestors);
    }
  }

  function renderCards(container, investors) {
    var html = '';
    investors.forEach(function (inv) {
      html +=
        '<div class="card card-clickable" data-investor="' + App.escapeHtml(inv.name || '') + '">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(inv.name || 'Unknown') + '</span>' +
          '</div>' +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Purchases</span><span class="metric-value">' + App.formatNumber(inv.total_purchases) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Total Spend</span><span class="metric-value">' + App.formatCurrency(inv.total_spend) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Avg Price</span><span class="metric-value">' + App.formatCurrency(inv.avg_price) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Top Area</span><span class="metric-value truncate">' + App.escapeHtml(inv.top_neighborhood || '--') + '</span></div>' +
          '</div>' +
          (inv.first_purchase || inv.last_purchase ?
            '<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">' +
              App.formatDate(inv.first_purchase) + ' \u2014 ' + App.formatDate(inv.last_purchase) +
            '</div>' : '') +
          '<div class="card-footer">Click to see all purchases \u2192</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  function renderTable(container, investors) {
    var html =
      '<div class="data-table-wrap" style="display:block;">' +
      '<table class="data-table"><thead><tr>' +
        '<th class="sortable-th" data-sort="name">Name</th>' +
        '<th class="sortable-th" data-sort="total_purchases">Purchases</th>' +
        '<th class="sortable-th" data-sort="total_spend">Total Spend</th>' +
        '<th class="sortable-th" data-sort="avg_price">Avg Price</th>' +
        '<th>Top Area</th>' +
        '<th class="sortable-th" data-sort="first_purchase">First</th>' +
        '<th class="sortable-th" data-sort="last_purchase">Last</th>' +
      '</tr></thead><tbody>';

    investors.forEach(function (inv) {
      html +=
        '<tr data-investor="' + App.escapeHtml(inv.name || '') + '" style="cursor:pointer;">' +
          '<td><strong>' + App.escapeHtml(inv.name || 'Unknown') + '</strong></td>' +
          '<td>' + App.formatNumber(inv.total_purchases) + '</td>' +
          '<td>' + App.formatCurrency(inv.total_spend) + '</td>' +
          '<td>' + App.formatCurrency(inv.avg_price) + '</td>' +
          '<td>' + App.escapeHtml(inv.top_neighborhood || '--') + '</td>' +
          '<td>' + App.formatDate(inv.first_purchase) + '</td>' +
          '<td>' + App.formatDate(inv.last_purchase) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    container.querySelector('tbody').addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-investor]');
      if (row) showInvestorDetail(row.getAttribute('data-investor'));
    });

    // Sortable column headers
    container.querySelectorAll('.sortable-th').forEach(function (th) {
      th.style.cursor = 'pointer';
      th.addEventListener('click', function () {
        var sortKey = th.getAttribute('data-sort');
        var sortEl = document.getElementById('investor-sort');
        if (sortEl) {
          sortEl.value = sortKey;
          currentPage = 1;
          loadInvestors();
        }
      });
    });
  }

  async function showInvestorDetail(name) {
    if (!name) return;
    currentView = 'detail';
    detailPage = 1;
    detailFilter = '';

    var listEl = document.getElementById('investors-list');
    var paginationEl = document.getElementById('investors-pagination');
    paginationEl.innerHTML = '';

    // Hide filters
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = 'none';

    App.showLoading(listEl);

    try {
      var data = await App.api('investor/' + encodeURIComponent(name), { limit: 50 });
      if (!data.data) throw new Error('No data returned');
      cachedDetail = data.data;
      investorDetailMap = null;
      renderInvestorDetail(listEl, data.data, data.meta, name);
    } catch (e) {
      App.showError(listEl, 'Failed to load investor: ' + e.message, function () { showInvestorDetail(name); });
    }
  }

  var currentSection = 'purchases';

  function renderInvestorDetail(container, detail, meta, investorName) {
    var p = detail.profile;
    var purchases = detail.purchases || [];
    var salesRecords = detail.sales || [];
    var flips = detail.flips || [];
    var hoods = detail.neighborhoods || [];
    var saleHoods = detail.sale_neighborhoods || [];
    var deedTypes = detail.deed_types || {};
    currentSection = meta.section || 'purchases';

    var html = '<div class="detail-view">';
    html += '<button class="btn-back" onclick="InvestorsModule.backToList()">\u2190 Back to investors</button>';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(p.name || 'Unknown') + '</h2>';
    html += '<div class="card-metrics">';
    html += '<div class="card-metric"><span class="metric-label">Purchases</span><span class="metric-value">' + App.formatNumber(p.total_purchases) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Total Spent</span><span class="metric-value">' + App.formatCurrency(p.total_spend) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Sales</span><span class="metric-value">' + App.formatNumber(p.total_sales) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Revenue</span><span class="metric-value">' + App.formatCurrency(p.total_revenue) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Flips</span><span class="metric-value">' + App.formatNumber(p.total_flips) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Areas</span><span class="metric-value">' + App.formatNumber(p.neighborhoods_active) + '</span></div>';
    html += '</div></div>';

    // Flips section (if any)
    if (flips.length > 0) {
      html += '<h3>\uD83D\uDD04 Flips (' + flips.length + ')</h3>';
      html += '<div class="flip-list">';
      flips.slice(0, 10).forEach(function (f) {
        var profitClass = f.profit > 0 ? 'profit-pos' : f.profit < 0 ? 'profit-neg' : '';
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(f.address || '?') + '</span>';
        html += '<span class="card-badge ' + profitClass + '">' + (f.profit >= 0 ? '+' : '') + App.formatCurrencyFull(f.profit) + '</span></div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Bought</span><span class="kv-value">' + App.formatCurrencyFull(f.bought_price) + ' (' + App.formatDate(f.bought_date) + ')</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Sold</span><span class="kv-value">' + App.formatCurrencyFull(f.sold_price) + ' (' + App.formatDate(f.sold_date) + ')</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Hold Time</span><span class="kv-value">' + (f.hold_days || '?') + ' days</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Neighborhood</span><span class="kv-value">' + App.escapeHtml(f.neighborhood || '?') + '</span></div>';
        html += '</div></div>';
      });
      html += '</div>';
    }

    // Neighborhoods breakdown
    if (hoods.length > 0) {
      html += '<h3>Purchase Areas (' + hoods.length + ')</h3>';
      html += '<div class="detail-hoods">';
      hoods.slice(0, 10).forEach(function (h) {
        html += '<div class="hood-row">';
        html += '<span class="hood-name">' + App.escapeHtml(h.name) + '</span>';
        html += '<span class="hood-count">' + h.count + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Deed type breakdown
    var deedKeys = Object.keys(deedTypes);
    if (deedKeys.length > 0) {
      html += '<div class="card-tags" style="margin:12px 0;">';
      deedKeys.forEach(function (k) {
        html += '<span class="reason-tag">' + App.escapeHtml(k) + ' (' + deedTypes[k] + ')</span>';
      });
      html += '</div>';
    }

    // Map/List View Toggle
    html += '<div class="detail-view-toggle" id="investor-view-toggle">';
    html += '<button class="toggle-btn active" onclick="InvestorsModule.toggleDetailView(\'list\')">List View</button>';
    html += '<button class="toggle-btn" onclick="InvestorsModule.toggleDetailView(\'map\')">Map View</button>';
    html += '</div>';
    html += '<div id="investor-map-container" style="display:none;">';
    html += '<div id="investor-detail-map"></div>';
    html += '<div class="map-legend">';
    html += '<div class="legend-item"><span class="legend-dot" style="background:#10b981;"></span> Purchase</div>';
    html += '<div class="legend-item"><span class="legend-dot" style="background:#3b82f6;"></span> Sale</div>';
    html += '</div></div>';
    html += '<div id="investor-list-container">';

    // Section toggle: Purchases vs Sales
    var encName = encodeURIComponent(investorName);
    html += '<div class="section-toggle" style="display:flex;gap:8px;margin:16px 0 8px;">';
    html += '<button class="pill ' + (currentSection === 'purchases' ? 'active' : '') + '" onclick="InvestorsModule.switchSection(\'' + encName + '\', \'purchases\')">\uD83D\uDED2 Purchases (' + (meta.total_purchases || p.total_purchases) + ')</button>';
    html += '<button class="pill ' + (currentSection === 'sales' ? 'active' : '') + '" onclick="InvestorsModule.switchSection(\'' + encName + '\', \'sales\')">\uD83D\uDCB0 Sales (' + (meta.total_sales || p.total_sales) + ')</button>';
    html += '</div>';

    // Filter pills
    html += '<div class="filter-pills" style="margin-bottom:8px;">';
    html += '<button class="pill active" onclick="InvestorsModule.filterPurchases(\'' + encName + '\', \'\')">All</button>';
    html += '<button class="pill" onclick="InvestorsModule.filterPurchases(\'' + encName + '\', \'sub60k\')">Sub-$60K</button>';
    html += '<button class="pill" onclick="InvestorsModule.filterPurchases(\'' + encName + '\', \'over60k\')">&gt;$60K</button>';
    html += '</div>';

    // Records list
    var records = currentSection === 'sales' ? salesRecords : purchases;
    html += '<div id="investor-purchases-container">';
    html += renderPurchaseCards(records, currentSection);
    html += '</div>';

    html += '<div id="investor-detail-pagination" class="pagination"></div>';
    html += '</div>'; // close investor-list-container

    html += '</div>';
    container.innerHTML = html;

    if (meta && meta.pages > 1) {
      App.renderPagination(
        document.getElementById('investor-detail-pagination'),
        meta.page, meta.pages,
        function (page) { loadDetailPage(investorName, page); }
      );
    }
  }

  function renderPurchaseCards(records, section) {
    if (!records || !records.length) return '<p class="empty-state">No ' + (section === 'sales' ? 'sales' : 'purchases') + ' match this filter.</p>';

    var isSale = section === 'sales';
    var html = '';
    records.forEach(function (s) {
      html += '<div class="card detail-record">';
      html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(s.addr || 'Unknown Address') + '</span>';
      html += '<span class="card-badge">' + App.formatCurrencyFull(s.pr) + '</span></div>';
      html += '<div class="kv-grid">';
      html += '<div class="kv-item"><span class="kv-label">Sale Date</span><span class="kv-value">' + App.formatDate(s.dt) + '</span></div>';
      html += '<div class="kv-item"><span class="kv-label">Sale Price</span><span class="kv-value">' + App.formatCurrencyFull(s.pr) + '</span></div>';
      if (isSale) {
        html += '<div class="kv-item"><span class="kv-label">Sold To (Buyer)</span><span class="kv-value">' + App.escapeHtml(s.ge || '--') + '</span></div>';
      } else {
        html += '<div class="kv-item"><span class="kv-label">Grantor (Seller)</span><span class="kv-value">' + App.escapeHtml(s.gr || '--') + '</span></div>';
      }
      html += '<div class="kv-item"><span class="kv-label">Neighborhood</span><span class="kv-value">' + App.escapeHtml(s.nb || '--') + '</span></div>';
      if (s.terms) html += '<div class="kv-item"><span class="kv-label">Terms</span><span class="kv-value">' + App.escapeHtml(s.terms) + '</span></div>';
      if (s.pid) html += '<div class="kv-item"><span class="kv-label">Parcel ID</span><span class="kv-value">' + App.escapeHtml(s.pid) + '</span></div>';
      html += '</div></div>';
    });
    return html;
  }

  function switchSection(encodedName, section) {
    var name = decodeURIComponent(encodedName);
    currentSection = section;
    detailPage = 1;
    detailFilter = '';

    // Update toggle buttons
    document.querySelectorAll('.section-toggle .pill').forEach(function (p) { p.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');

    // Reset filter pills
    document.querySelectorAll('.filter-pills .pill').forEach(function (p, i) { p.classList.toggle('active', i === 0); });

    loadDetailPage(name, 1);
  }

  async function loadDetailPage(name, page) {
    var container = document.getElementById('investor-purchases-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    try {
      var params = { page: page, limit: 50, section: currentSection };
      if (detailFilter === 'sub60k') params.max_price = 60000;
      if (detailFilter === 'over60k') params.min_price = 60001;

      var data = await App.api('investor/' + encodeURIComponent(name), params);
      var records = currentSection === 'sales' ? (data.data.sales || []) : (data.data.purchases || []);
      container.innerHTML = renderPurchaseCards(records, currentSection);

      var pagEl = document.getElementById('investor-detail-pagination');
      if (pagEl && data.meta) {
        App.renderPagination(pagEl, data.meta.page, data.meta.pages, function (p) { loadDetailPage(name, p); });
      }
    } catch (e) {
      container.innerHTML = '<p class="error">Failed to load: ' + e.message + '</p>';
    }
  }

  function filterPurchases(encodedName, filter) {
    var name = decodeURIComponent(encodedName);
    detailFilter = filter;
    detailPage = 1;

    // Update active pill
    document.querySelectorAll('.filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');

    var params = { page: 1, limit: 50, section: currentSection };
    if (filter === 'sub60k') params.max_price = 60000;
    if (filter === 'over60k') params.min_price = 60001;

    var container = document.getElementById('investor-purchases-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    App.api('investor/' + encodeURIComponent(name), params).then(function (data) {
      var records = currentSection === 'sales' ? (data.data.sales || []) : (data.data.purchases || []);
      container.innerHTML = renderPurchaseCards(records, currentSection);
      var pagEl = document.getElementById('investor-detail-pagination');
      if (pagEl && data.meta) {
        App.renderPagination(pagEl, data.meta.page, data.meta.pages, function (p) { loadDetailPage(name, p); });
      }
    }).catch(function (e) {
      container.innerHTML = '<p class="error">Failed to filter: ' + e.message + '</p>';
    });
  }

  function toggleDetailView(view) {
    var btns = document.querySelectorAll('#investor-view-toggle .toggle-btn');
    btns.forEach(function (b, i) {
      b.classList.toggle('active', (i === 0 && view === 'list') || (i === 1 && view === 'map'));
    });
    var mapContainer = document.getElementById('investor-map-container');
    var listContainer = document.getElementById('investor-list-container');
    if (view === 'map') {
      if (mapContainer) mapContainer.style.display = '';
      if (listContainer) listContainer.style.display = 'none';
      if (!investorDetailMap) initInvestorMap();
    } else {
      if (mapContainer) mapContainer.style.display = 'none';
      if (listContainer) listContainer.style.display = '';
    }
  }

  function buildInvestorPopup(record, label) {
    var html = '<div class="popup-content">';
    html += '<div class="popup-address">' + App.escapeHtml(record.addr || '') + '</div>';
    html += '<span class="popup-layer-badge" style="background:' + (label === 'Purchase' ? '#10b98133' : '#3b82f633') + ';color:' + (label === 'Purchase' ? '#10b981' : '#3b82f6') + ';">' + label + '</span>';
    html += '<div class="popup-fields">';
    html += '<div class="popup-field"><span class="popup-label">Price</span><span class="popup-value">' + App.formatCurrencyFull(record.pr) + '</span></div>';
    html += '<div class="popup-field"><span class="popup-label">Date</span><span class="popup-value">' + App.formatDate(record.dt) + '</span></div>';
    if (record.gr) html += '<div class="popup-field"><span class="popup-label">Seller</span><span class="popup-value">' + App.escapeHtml(record.gr) + '</span></div>';
    if (record.ge) html += '<div class="popup-field"><span class="popup-label">Buyer</span><span class="popup-value">' + App.escapeHtml(record.ge) + '</span></div>';
    if (record.tos) html += '<div class="popup-field"><span class="popup-label">Terms</span><span class="popup-value">' + App.escapeHtml(record.tos) + '</span></div>';
    if (record.pid) html += '<div class="popup-field"><span class="popup-label">Parcel</span><span class="popup-value">' + App.escapeHtml(record.pid) + '</span></div>';
    if (record.nb) html += '<div class="popup-field"><span class="popup-label">Area</span><span class="popup-value">' + App.escapeHtml(record.nb) + '</span></div>';
    html += '</div></div>';
    return html;
  }

  function initInvestorMap() {
    var mapEl = document.getElementById('investor-detail-map');
    if (!mapEl || !window.L) return;
    investorDetailMap = L.map('investor-detail-map', {
      center: [42.3314, -83.0458],
      zoom: 12,
      zoomControl: true
    });
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '\u00a9 OSM \u00a9 CARTO',
      subdomains: 'abcd',
      maxZoom: 19
    }).addTo(investorDetailMap);

    var group = L.featureGroup();
    var purchases = (cachedDetail && cachedDetail.purchases) || [];
    var sales = (cachedDetail && cachedDetail.sales) || [];

    purchases.forEach(function (p) {
      if (!p.lat || !p.lng) return;
      L.circleMarker([p.lat, p.lng], {
        radius: 7, fillColor: '#10b981', color: '#10b981', weight: 1, opacity: 0.8, fillOpacity: 0.6
      }).bindPopup(buildInvestorPopup(p, 'Purchase'), { className: 'dark-popup', maxWidth: 340 }).addTo(group);
    });

    sales.forEach(function (s) {
      if (!s.lat || !s.lng) return;
      L.circleMarker([s.lat, s.lng], {
        radius: 7, fillColor: '#3b82f6', color: '#3b82f6', weight: 1, opacity: 0.8, fillOpacity: 0.6
      }).bindPopup(buildInvestorPopup(s, 'Sale'), { className: 'dark-popup', maxWidth: 340 }).addTo(group);
    });

    group.addTo(investorDetailMap);
    if (group.getBounds().isValid()) {
      investorDetailMap.fitBounds(group.getBounds(), { padding: [30, 30] });
    }
  }

  function backToList() {
    currentView = 'list';
    currentPage = 1;
    cachedDetail = null;
    investorDetailMap = null;
    loadInvestors();
  }

  function refresh() {
    if (currentView === 'list') loadInvestors();
  }

  window.InvestorsModule = {
    init: init,
    refresh: refresh,
    showInvestorDetail: showInvestorDetail,
    filterPurchases: filterPurchases,
    switchSection: switchSection,
    backToList: backToList,
    toggleDetailView: toggleDetailView
  };

})();
