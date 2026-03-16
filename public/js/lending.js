/* ============================================================
   Detroit Data Intelligence Platform V2 - Lending Module
   Click-through lender detail + LLC sub-60K filter
   ============================================================ */
(function () {
  'use strict';

  var initialized = false;
  var currentView = 'list'; // 'list' or 'detail'

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    loadLending();
  }

  function bindEvents() {
    ['lending-sub60k', 'lending-investment', 'lending-multifamily', 'lending-llc-sub60k'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function() { loadLending(); });
    });
    var sortEl = document.getElementById('lending-sort');
    if (sortEl) sortEl.addEventListener('change', function() { loadLending(); });
  }

  function getFilters() {
    return {
      sub60k: (document.getElementById('lending-sub60k') || {}).checked ? 'true' : '',
      investment: (document.getElementById('lending-investment') || {}).checked ? 'true' : '',
      multifamily: (document.getElementById('lending-multifamily') || {}).checked ? 'true' : '',
      llc_sub60k: (document.getElementById('lending-llc-sub60k') || {}).checked ? 'true' : '',
      sort: (document.getElementById('lending-sort') || {}).value || 'loans',
      limit: 100
    };
  }

  async function loadLending() {
    currentView = 'list';
    var listEl = document.getElementById('lending-list');
    App.showLoading(listEl);

    try {
      var filters = getFilters();
      var data = await App.api('lending', filters);
      var lenders = data.data || data || [];
      if (!lenders.length) {
        App.showEmpty(listEl, 'No lenders match your filters.');
        return;
      }
      renderCards(listEl, lenders);
    } catch (e) {
      App.showError(listEl, 'Failed to load lending data: ' + e.message, loadLending);
    }
  }

  function getRateClass(rate) {
    if (!rate) return '';
    if (rate < 5) return 'rate-low';
    if (rate < 7) return 'rate-mid';
    return 'rate-high';
  }

  function renderCards(container, lenders) {
    var html = '';
    lenders.forEach(function (l) {
      var rate = l.avg_rate;
      var rateClass = getRateClass(rate);
      var sub60k = l.sub_60k_loans || 0;
      var llcSub60k = l.llc_sub_60k_loans || 0;
      var investment = l.investment_loans || 0;
      var business = l.business_loans || 0;

      // Loan type tags
      var types = l.loan_types || {};
      var typeTags = Object.keys(types).map(function(t) {
        return '<span class="reason-tag">' + App.escapeHtml(t) + ' (' + types[t] + ')</span>';
      }).join('');

      html +=
        '<div class="card card-clickable" onclick="LendingModule.showDetail(\'' + l.lei + '\')">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(l.name || 'Unknown') + '</span>' +
            '<span class="card-badge">' + App.formatNumber(l.total_loans) + ' loans</span>' +
          '</div>' +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Volume</span><span class="metric-value">' + App.formatCurrency(l.total_volume) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Avg Rate</span><span class="metric-value ' + rateClass + '">' + (rate ? rate.toFixed(2) + '%' : '--') + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Avg Loan</span><span class="metric-value">' + App.formatCurrency(l.avg_amount) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Min Loan</span><span class="metric-value">' + App.formatCurrency(l.min_amount) + '</span></div>' +
          '</div>' +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Sub-$60K</span><span class="metric-value">' + sub60k + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">LLC Sub-$60K</span><span class="metric-value' + (llcSub60k > 0 ? ' highlight-green' : '') + '">' + llcSub60k + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Investment</span><span class="metric-value">' + investment + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Business</span><span class="metric-value">' + business + '</span></div>' +
          '</div>' +
          (typeTags ? '<div class="card-tags">' + typeTags + '</div>' : '') +
          '<div class="card-footer">Click to see individual loans →</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  async function showDetail(lei) {
    currentView = 'detail';
    var listEl = document.getElementById('lending-list');
    App.showLoading(listEl);

    try {
      var data = await App.api('lender/' + encodeURIComponent(lei));
      if (!data.data) throw new Error('No data returned');
      renderDetail(listEl, data.data, data.meta);
    } catch(e) {
      App.showError(listEl, 'Failed to load lender detail: ' + e.message, function() { showDetail(lei); });
    }
  }

  function renderDetail(container, detail, meta) {
    var p = detail.profile;
    var hoods = detail.neighborhoods || [];
    var loans = detail.loans || [];

    var html = '<div class="lender-detail">';
    
    // Back button
    html += '<button class="btn-back" onclick="LendingModule.backToList()">← Back to lenders</button>';
    
    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(p.name || 'Unknown') + '</h2>';
    html += '<div class="card-metrics">';
    html += '<div class="card-metric"><span class="metric-label">Total Loans</span><span class="metric-value">' + App.formatNumber(p.total_loans) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Volume</span><span class="metric-value">' + App.formatCurrency(p.total_volume) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Avg Rate</span><span class="metric-value">' + (p.avg_rate ? p.avg_rate.toFixed(2) + '%' : '--') + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Sub-$60K</span><span class="metric-value">' + (p.sub_60k_loans || 0) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">LLC/Biz</span><span class="metric-value">' + (p.total_business_loans || 0) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">LLC Sub-$60K</span><span class="metric-value highlight-green">' + (p.business_sub_60k || 0) + '</span></div>';
    html += '</div></div>';

    // Neighborhoods
    if (hoods.length > 0) {
      html += '<h3>Lending by Neighborhood</h3>';
      html += '<div class="detail-hoods">';
      hoods.slice(0, 20).forEach(function(h) {
        html += '<div class="hood-row">';
        html += '<span class="hood-name">' + App.escapeHtml(h.name) + '</span>';
        html += '<span class="hood-count">' + h.count + ' loans</span>';
        html += '<span class="hood-amount">' + App.formatCurrency(h.total_amount) + '</span>';
        html += '<span class="hood-rate">' + (h.avg_rate ? h.avg_rate.toFixed(2) + '%' : '--') + '</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Loan filter tabs
    html += '<div class="loan-filters">';
    html += '<h3>Individual Loans (' + (meta ? meta.total : loans.length) + ' total)</h3>';
    html += '<div class="filter-pills">';
    html += '<button class="pill active" onclick="LendingModule.filterLoans(\'' + p.lei + '\', \'\')">All</button>';
    html += '<button class="pill" onclick="LendingModule.filterLoans(\'' + p.lei + '\', \'sub60k\')">Sub-$60K</button>';
    html += '<button class="pill" onclick="LendingModule.filterLoans(\'' + p.lei + '\', \'business\')">LLC/Business</button>';
    html += '<button class="pill" onclick="LendingModule.filterLoans(\'' + p.lei + '\', \'both\')">LLC + Sub-$60K</button>';
    html += '</div></div>';

    // Loans table
    html += '<div id="loan-table-container">';
    html += renderLoanTable(loans);
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  function renderLoanTable(loans) {
    if (!loans.length) return '<p class="empty-state">No loans match this filter.</p>';

    var html = '<div class="table-scroll"><table class="data-table">';
    html += '<thead><tr>';
    html += '<th>Amount</th><th>Rate</th><th>Type</th><th>Purpose</th>';
    html += '<th>Units</th><th>Occupancy</th><th>Biz/LLC</th><th>Neighborhood</th>';
    html += '</tr></thead><tbody>';

    loans.forEach(function(l) {
      var isBiz = l.is_business ? '✅' : '';
      html += '<tr' + (l.is_business ? ' class="row-highlight"' : '') + '>';
      html += '<td>' + App.formatCurrency(l.loan_amount) + '</td>';
      html += '<td>' + (l.interest_rate ? l.interest_rate.toFixed(2) + '%' : '--') + '</td>';
      html += '<td>' + App.escapeHtml(l.loan_type || '') + '</td>';
      html += '<td>' + App.escapeHtml(l.loan_purpose || '') + '</td>';
      html += '<td>' + App.escapeHtml(l.total_units || '1') + '</td>';
      html += '<td>' + App.escapeHtml(l.occupancy || '') + '</td>';
      html += '<td>' + isBiz + '</td>';
      html += '<td>' + App.escapeHtml(l.neighborhood || '') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    return html;
  }

  async function filterLoans(lei, filter) {
    var container = document.getElementById('loan-table-container');
    if (!container) return;
    container.innerHTML = '<p class="loading">Loading...</p>';

    // Update active pill
    document.querySelectorAll('.loan-filters .pill').forEach(function(p) { p.classList.remove('active'); });
    event.target.classList.add('active');

    try {
      var params = {};
      if (filter === 'sub60k') params.sub60k = 'true';
      if (filter === 'business') params.business = 'true';
      if (filter === 'both') { params.sub60k = 'true'; params.business = 'true'; }
      params.limit = 100;

      var data = await App.api('lender/' + encodeURIComponent(lei), params);
      container.innerHTML = renderLoanTable(data.data.loans || []);
    } catch(e) {
      container.innerHTML = '<p class="error">Failed to filter: ' + e.message + '</p>';
    }
  }

  function backToList() {
    loadLending();
  }

  function refresh() {
    if (currentView === 'list') loadLending();
  }

  window.LendingModule = {
    init: init,
    refresh: refresh,
    showDetail: showDetail,
    filterLoans: filterLoans,
    backToList: backToList
  };

})();
