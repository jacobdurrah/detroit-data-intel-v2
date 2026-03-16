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
    var tierEl = document.getElementById('investor-tier');
    var sortEl = document.getElementById('investor-sort');

    if (searchEl) {
      searchEl.addEventListener('input', App.debounce(function () {
        currentPage = 1;
        loadInvestors();
      }, 300));
    }
    if (tierEl) {
      tierEl.addEventListener('change', function () { currentPage = 1; loadInvestors(); });
    }
    if (sortEl) {
      sortEl.addEventListener('change', function () { currentPage = 1; loadInvestors(); });
    }

    document.getElementById('investors-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-investor], tr[data-investor]');
      if (card) {
        showInvestorDetail(card.getAttribute('data-investor'));
      }
    });
  }

  function getFilters() {
    return {
      search: (document.getElementById('investor-search') || {}).value || '',
      tier: (document.getElementById('investor-tier') || {}).value || '',
      sort: (document.getElementById('investor-sort') || {}).value || 'total_purchases',
      page: currentPage,
      limit: PAGE_SIZE
    };
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
    } catch (e) {
      App.showError(listEl, 'Failed to load investors: ' + e.message, loadInvestors);
    }
  }

  function renderCards(container, investors) {
    var html = '';
    investors.forEach(function (inv) {
      var tierClass = (inv.investment_tier || inv.tier || 'small').toLowerCase();
      html +=
        '<div class="card card-clickable" data-investor="' + App.escapeHtml(inv.name || '') + '">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(inv.name || 'Unknown') + '</span>' +
            '<span class="tier-badge ' + tierClass + '">' + tierClass + '</span>' +
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
        '<th>Name</th><th>Tier</th><th>Purchases</th><th>Total Spend</th><th>Avg Price</th><th>Top Area</th><th>First</th><th>Last</th>' +
      '</tr></thead><tbody>';

    investors.forEach(function (inv) {
      var tierClass = (inv.investment_tier || inv.tier || 'small').toLowerCase();
      html +=
        '<tr data-investor="' + App.escapeHtml(inv.name || '') + '" style="cursor:pointer;">' +
          '<td><strong>' + App.escapeHtml(inv.name || 'Unknown') + '</strong></td>' +
          '<td><span class="tier-badge ' + tierClass + '">' + tierClass + '</span></td>' +
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
      renderInvestorDetail(listEl, data.data, data.meta, name);
    } catch (e) {
      App.showError(listEl, 'Failed to load investor: ' + e.message, function () { showInvestorDetail(name); });
    }
  }

  function renderInvestorDetail(container, detail, meta, investorName) {
    var p = detail.profile;
    var purchases = detail.purchases || [];
    var hoods = detail.neighborhoods || [];
    var deedTypes = detail.deed_types || {};
    var tierClass = (p.investment_tier || p.tier || 'small').toLowerCase();

    var html = '<div class="detail-view">';
    html += '<button class="btn-back" onclick="InvestorsModule.backToList()">\u2190 Back to investors</button>';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(p.name || 'Unknown') + ' <span class="tier-badge ' + tierClass + '">' + tierClass + '</span></h2>';
    html += '<div class="card-metrics">';
    html += '<div class="card-metric"><span class="metric-label">Total Purchases</span><span class="metric-value">' + App.formatNumber(p.total_purchases) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Total Spend</span><span class="metric-value">' + App.formatCurrency(p.total_spend) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Avg Price</span><span class="metric-value">' + App.formatCurrency(p.avg_price) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Areas</span><span class="metric-value">' + App.formatNumber(p.neighborhood_count) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">First Purchase</span><span class="metric-value">' + App.formatDate(p.first_purchase) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Last Purchase</span><span class="metric-value">' + App.formatDate(p.last_purchase) + '</span></div>';
    html += '</div></div>';

    // Neighborhoods breakdown
    if (hoods.length > 0) {
      html += '<h3>Neighborhoods (' + hoods.length + ')</h3>';
      html += '<div class="detail-hoods">';
      hoods.slice(0, 15).forEach(function (h) {
        html += '<div class="hood-row">';
        html += '<span class="hood-name">' + App.escapeHtml(h.neighborhood) + '</span>';
        html += '<span class="hood-count">' + h.count + ' purchases</span>';
        html += '<span class="hood-amount">' + App.formatCurrency(h.total_spent) + '</span>';
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

    // Filter pills for purchases
    var encName = encodeURIComponent(investorName);
    html += '<div class="loan-filters">';
    html += '<h3>Purchases (' + (meta ? meta.total : purchases.length) + ' total)</h3>';
    html += '<div class="filter-pills">';
    html += '<button class="pill active" onclick="InvestorsModule.filterPurchases(\'' + encName + '\', \'\')">All</button>';
    html += '<button class="pill" onclick="InvestorsModule.filterPurchases(\'' + encName + '\', \'sub60k\')">Sub-$60K</button>';
    html += '<button class="pill" onclick="InvestorsModule.filterPurchases(\'' + encName + '\', \'over60k\')">&gt;$60K</button>';
    html += '</div></div>';

    // Purchases list
    html += '<div id="investor-purchases-container">';
    html += renderPurchaseCards(purchases);
    html += '</div>';

    // Pagination for purchases
    if (meta && meta.pages > 1) {
      html += '<div id="investor-detail-pagination" class="pagination"></div>';
    }

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

  function renderPurchaseCards(purchases) {
    if (!purchases.length) return '<p class="empty-state">No purchases match this filter.</p>';

    var html = '';
    purchases.forEach(function (s) {
      html += '<div class="card detail-record">';
      html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(s.addr || 'Unknown Address') + '</span>';
      html += '<span class="card-badge">' + App.formatCurrencyFull(s.pr) + '</span></div>';
      html += '<div class="kv-grid">';

      Object.keys(SALE_FIELDS).forEach(function (key) {
        if (s[key] == null || s[key] === '') return;
        var val = s[key];
        if (key === 'pr') val = App.formatCurrencyFull(val);
        else if (key === 'dt') val = App.formatDate(val);
        else val = App.escapeHtml(String(val));
        html += '<div class="kv-item"><span class="kv-label">' + SALE_FIELDS[key] + '</span><span class="kv-value">' + val + '</span></div>';
      });

      html += '</div></div>';
    });
    return html;
  }

  async function loadDetailPage(name, page) {
    var container = document.getElementById('investor-purchases-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    try {
      var params = { page: page, limit: 50 };
      if (detailFilter === 'sub60k') params.max_price = 60000;
      if (detailFilter === 'over60k') params.min_price = 60001;

      var data = await App.api('investor/' + encodeURIComponent(name), params);
      container.innerHTML = renderPurchaseCards(data.data.purchases || []);

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

    var params = { page: 1, limit: 50 };
    if (filter === 'sub60k') params.max_price = 60000;
    if (filter === 'over60k') params.min_price = 60001;

    var container = document.getElementById('investor-purchases-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    App.api('investor/' + encodeURIComponent(name), params).then(function (data) {
      container.innerHTML = renderPurchaseCards(data.data.purchases || []);
      var pagEl = document.getElementById('investor-detail-pagination');
      if (pagEl && data.meta) {
        App.renderPagination(pagEl, data.meta.page, data.meta.pages, function (p) { loadDetailPage(name, p); });
      }
    }).catch(function (e) {
      container.innerHTML = '<p class="error">Failed to filter: ' + e.message + '</p>';
    });
  }

  function backToList() {
    currentView = 'list';
    currentPage = 1;
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
    backToList: backToList
  };

})();
