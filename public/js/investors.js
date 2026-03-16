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
      tierEl.addEventListener('change', function () {
        currentPage = 1;
        loadInvestors();
      });
    }

    if (sortEl) {
      sortEl.addEventListener('change', function () {
        currentPage = 1;
        loadInvestors();
      });
    }

    // Event delegation for card/row clicks
    document.getElementById('investors-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-investor]');
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
    var listEl = document.getElementById('investors-list');
    var paginationEl = document.getElementById('investors-pagination');

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
        '<div class="card" data-investor="' + App.escapeHtml(inv.name || inv.investor_name || '') + '">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(inv.name || inv.investor_name || 'Unknown') + '</span>' +
            '<span class="tier-badge ' + tierClass + '">' + tierClass + '</span>' +
          '</div>' +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Purchases</span><span class="metric-value">' + App.formatNumber(inv.total_purchases) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Total Spend</span><span class="metric-value">' + App.formatCurrency(inv.total_spend) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Avg Price</span><span class="metric-value">' + App.formatCurrency(inv.avg_price) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Top Area</span><span class="metric-value truncate">' + App.escapeHtml(inv.top_neighborhood || '--') + '</span></div>' +
          '</div>' +
          (inv.first_purchase || inv.first_date || inv.last_purchase || inv.last_date ?
            '<div style="margin-top:8px;font-size:11px;color:var(--text-muted);">' +
              App.formatDate(inv.first_purchase || inv.first_date) + ' \u2014 ' + App.formatDate(inv.last_purchase || inv.last_date) +
            '</div>' : '') +
        '</div>';
    });
    container.innerHTML = html;
  }

  function renderTable(container, investors) {
    var html =
      '<div class="data-table-wrap" style="display:block;">' +
      '<table class="data-table">' +
        '<thead><tr>' +
          '<th>Name</th><th>Tier</th><th>Purchases</th><th>Total Spend</th><th>Avg Price</th><th>Top Area</th><th>First</th><th>Last</th>' +
        '</tr></thead><tbody>';

    investors.forEach(function (inv) {
      var tierClass = (inv.investment_tier || inv.tier || 'small').toLowerCase();
      html +=
        '<tr data-investor="' + App.escapeHtml(inv.name || inv.investor_name || '') + '" style="cursor:pointer;">' +
          '<td><strong>' + App.escapeHtml(inv.name || inv.investor_name || 'Unknown') + '</strong></td>' +
          '<td><span class="tier-badge ' + tierClass + '">' + tierClass + '</span></td>' +
          '<td>' + App.formatNumber(inv.total_purchases) + '</td>' +
          '<td>' + App.formatCurrency(inv.total_spend) + '</td>' +
          '<td>' + App.formatCurrency(inv.avg_price) + '</td>' +
          '<td>' + App.escapeHtml(inv.top_neighborhood || '--') + '</td>' +
          '<td>' + App.formatDate(inv.first_purchase || inv.first_date) + '</td>' +
          '<td>' + App.formatDate(inv.last_purchase || inv.last_date) + '</td>' +
        '</tr>';
    });

    html += '</tbody></table></div>';
    container.innerHTML = html;

    // Row click delegation
    container.querySelector('tbody').addEventListener('click', function (e) {
      var row = e.target.closest('tr[data-investor]');
      if (row) {
        showInvestorDetail(row.getAttribute('data-investor'));
      }
    });
  }

  async function showInvestorDetail(name) {
    if (!name) return;

    // Create modal
    var overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML =
      '<div class="modal-content">' +
        '<div class="modal-header">' +
          '<h2>' + App.escapeHtml(name) + '</h2>' +
          '<button class="modal-close" aria-label="Close">&times;</button>' +
        '</div>' +
        '<div class="modal-body"><div class="spinner"></div></div>' +
      '</div>';

    document.body.appendChild(overlay);

    // Close handlers
    overlay.querySelector('.modal-close').addEventListener('click', function () {
      overlay.remove();
    });
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) overlay.remove();
    });

    var bodyEl = overlay.querySelector('.modal-body');

    try {
      var data = await App.api('investor/' + encodeURIComponent(name));
      var inv = data.investor || data;
      var purchases = data.purchases || data.history || inv.purchases || [];

      var html =
        '<div class="card-metrics" style="margin-bottom:16px;">' +
          '<div class="card-metric"><span class="metric-label">Total Purchases</span><span class="metric-value">' + App.formatNumber(inv.total_purchases) + '</span></div>' +
          '<div class="card-metric"><span class="metric-label">Total Spend</span><span class="metric-value">' + App.formatCurrency(inv.total_spend) + '</span></div>' +
          '<div class="card-metric"><span class="metric-label">Avg Price</span><span class="metric-value">' + App.formatCurrency(inv.avg_price) + '</span></div>' +
          '<div class="card-metric"><span class="metric-label">Tier</span><span class="metric-value"><span class="tier-badge ' + ((inv.investment_tier || inv.tier || 'small').toLowerCase()) + '">' + (inv.investment_tier || inv.tier || 'small') + '</span></span></div>' +
        '</div>';

      if (purchases.length) {
        html += '<h3 style="font-size:14px;margin-bottom:8px;color:var(--text-muted);">Purchase History</h3>';
        html += '<div style="overflow-x:auto;"><table class="data-table"><thead><tr><th>Date</th><th>Address</th><th>Price</th></tr></thead><tbody>';
        purchases.forEach(function (p) {
          html +=
            '<tr>' +
              '<td>' + App.formatDate(p.sale_date || p.date) + '</td>' +
              '<td>' + App.escapeHtml(p.address || p.property_address || '--') + '</td>' +
              '<td>' + App.formatCurrencyFull(p.sale_price || p.price) + '</td>' +
            '</tr>';
        });
        html += '</tbody></table></div>';
      } else {
        html += '<p style="color:var(--text-muted);font-size:13px;">No purchase history available.</p>';
      }

      bodyEl.innerHTML = html;

    } catch (e) {
      bodyEl.innerHTML =
        '<div class="error-state">' +
          '<p class="error-msg">Failed to load investor details.</p>' +
        '</div>';
    }
  }

  function refresh() {
    currentPage = 1;
    loadInvestors();
  }

  /* --- Exports --- */
  window.InvestorsModule = {
    init: init,
    refresh: refresh
  };

})();
