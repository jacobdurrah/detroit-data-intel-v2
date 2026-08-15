/* ============================================================
   Detroit Data Intelligence Platform V2 - Lending Module
   Two views: Lender summaries + All individual loans explorer
   ============================================================ */
(function () {
  'use strict';

  var initialized = false;
  var currentView = 'lenders'; // 'lenders', 'loans', 'detail'
  var loansPage = 1;
  var lendersPage = 1;
  var LENDER_PAGE_SIZE = 50;
  var detailLoansPage = 1;
  var DETAIL_LOAN_PAGE_SIZE = 50;
  var currentLei = null;
  var currentLoanFilter = '';
  var searchTimer = null;

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    loadLending();
  }

  function bindEvents() {
    // Lender view filters
    ['lending-sub60k', 'lending-investment', 'lending-multifamily', 'lending-llc-sub60k'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function() { lendersPage = 1; loadLending(); });
    });
    var sortEl = document.getElementById('lending-sort');
    if (sortEl) sortEl.addEventListener('change', function() { lendersPage = 1; loadLending(); });

    // Loan view filters
    ['loan-filter-llc', 'loan-filter-sub60k', 'loan-filter-investment'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.addEventListener('change', function() { loansPage = 1; loadAllLoans(); });
    });
    var loanSort = document.getElementById('loan-sort');
    if (loanSort) loanSort.addEventListener('change', function() { loansPage = 1; loadAllLoans(); });
    var yearFilter = document.getElementById('loan-year-filter');
    if (yearFilter) yearFilter.addEventListener('change', function() { loansPage = 1; loadAllLoans(); });
    
    var searchInput = document.getElementById('loan-search');
    if (searchInput) {
      searchInput.addEventListener('input', function() {
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function() { loansPage = 1; loadAllLoans(); }, 400);
      });
    }
  }

  function switchView(view) {
    currentView = view;
    document.getElementById('lending-view-lenders').classList.toggle('active', view === 'lenders');
    document.getElementById('lending-view-loans').classList.toggle('active', view === 'loans');
    document.getElementById('lending-lender-filters').style.display = view === 'lenders' ? '' : 'none';
    document.getElementById('lending-loan-filters').style.display = view === 'loans' ? '' : 'none';
    document.getElementById('lending-loan-stats').style.display = view === 'loans' ? '' : 'none';
    var pagEl = document.getElementById('lending-pagination');
    if (pagEl) pagEl.innerHTML = '';

    if (view === 'lenders') {
      lendersPage = 1;
      loadLending();
    } else {
      loansPage = 1;
      loadAllLoans();
    }
  }

  // ==================== LENDERS VIEW ====================

  function getFilters() {
    return {
      sub60k: (document.getElementById('lending-sub60k') || {}).checked ? 'true' : '',
      investment: (document.getElementById('lending-investment') || {}).checked ? 'true' : '',
      multifamily: (document.getElementById('lending-multifamily') || {}).checked ? 'true' : '',
      llc_sub60k: (document.getElementById('lending-llc-sub60k') || {}).checked ? 'true' : '',
      sort: (document.getElementById('lending-sort') || {}).value || 'total_loans',
      page: lendersPage,
      limit: LENDER_PAGE_SIZE
    };
  }

  function listTotal(payload, pageItems) {
    var meta = (payload && payload.meta) || {};
    if (meta.total != null) return meta.total;
    if (payload && payload.total != null) return payload.total;
    if (payload && payload.count != null) return payload.count;
    return (pageItems && pageItems.length) || 0;
  }

  async function loadLending() {
    currentView = 'lenders';
    var listEl = document.getElementById('lending-list');
    App.showLoading(listEl);
    var pagEl = document.getElementById('lending-pagination');
    if (pagEl) pagEl.innerHTML = '';

    try {
      var filters = getFilters();
      var data = await App.api('lending', filters);
      var lenders = data.data || data || [];
      var meta = data.meta || {};
      var total = listTotal(data, lenders);
      var totalPages = Math.max(1, Math.ceil(total / LENDER_PAGE_SIZE));

      if (!lenders.length) {
        App.showEmpty(listEl, 'No lenders match your filters.');
        return;
      }
      renderLenderCards(listEl, lenders);

      if (pagEl) {
        App.renderPagination(pagEl, meta.page || lendersPage, totalPages, function(page) {
          lendersPage = page;
          loadLending();
        });
        var start = (lendersPage - 1) * LENDER_PAGE_SIZE + 1;
        var end = Math.min(lendersPage * LENDER_PAGE_SIZE, total);
        var infoEl = document.createElement('span');
        infoEl.className = 'page-info';
        infoEl.textContent = 'Showing ' + start + '\u2013' + end + ' of ' + App.formatNumber(total);
        pagEl.insertBefore(infoEl, pagEl.firstChild);
      }
    } catch (e) {
      App.showError(listEl, 'Failed to load lending data: ' + e.message, loadLending);
    }
  }

  function renderLenderCards(container, lenders) {
    var html = '';
    lenders.forEach(function (l) {
      var rate = l.avg_rate;
      var rateClass = !rate ? '' : rate < 5 ? 'rate-low' : rate < 7 ? 'rate-mid' : 'rate-high';
      var sub60k = l.sub_60k_loans || 0;
      var llcSub60k = l.llc_sub_60k_loans || 0;
      var investment = l.investment_loans || 0;
      var business = l.business_loans || 0;

      var types = l.loan_types || {};
      var typeTags = Object.keys(types).map(function(t) {
        return '<span class="reason-tag">' + App.escapeHtml(t) + ' (' + types[t] + ')</span>';
      }).join('');

      html +=
        '<div class="card card-clickable" onclick="LendingModule.showDetail(\'' + App.escapeHtml(l.lei || l.name) + '\')">' +
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

  // ==================== ALL LOANS VIEW ====================

  function getLoanFilters() {
    return {
      llc: (document.getElementById('loan-filter-llc') || {}).checked ? 'true' : '',
      sub60k: (document.getElementById('loan-filter-sub60k') || {}).checked ? 'true' : '',
      investment: (document.getElementById('loan-filter-investment') || {}).checked ? 'true' : '',
      sort: (document.getElementById('loan-sort') || {}).value || 'year_desc',
      year: (document.getElementById('loan-year-filter') || {}).value || '',
      q: (document.getElementById('loan-search') || {}).value || '',
      page: loansPage,
      limit: 50
    };
  }

  async function loadAllLoans() {
    var listEl = document.getElementById('lending-list');
    var pagEl = document.getElementById('lending-pagination');
    var statsEl = document.getElementById('lending-loan-stats');
    App.showLoading(listEl);
    if (pagEl) pagEl.innerHTML = '';

    try {
      var filters = getLoanFilters();
      var data = await App.api('loans', filters);
      var loans = data.data || [];
      var meta = data.meta || {};
      var stats = data.stats || {};

      // Render stats bar
      if (statsEl) {
        var yearInfo = '';
        if (stats.by_year) {
          var yrs = Object.keys(stats.by_year).sort().reverse();
          yearInfo = yrs.map(function(y) { return y + ': ' + App.formatNumber(stats.by_year[y]); }).join(' · ');
        }
        statsEl.innerHTML =
          '<div class="stat-pill"><strong>' + App.formatNumber(stats.total_loans || 0) + '</strong> loans</div>' +
          '<div class="stat-pill">$' + App.formatNumber(Math.round((stats.total_volume || 0) / 1000000)) + 'M volume</div>' +
          '<div class="stat-pill">Avg ' + (stats.avg_rate ? stats.avg_rate.toFixed(2) + '%' : '--') + '</div>' +
          '<div class="stat-pill">Avg $' + App.formatNumber(Math.round(stats.avg_amount || 0)) + '</div>' +
          '<div class="stat-pill">🏢 ' + App.formatNumber(stats.llc_count || 0) + ' LLC</div>' +
          '<div class="stat-pill">' + App.formatNumber(stats.sub60k_count || 0) + ' sub-$60K</div>' +
          (yearInfo ? '<div class="stat-pill stat-pill-years">' + yearInfo + '</div>' : '');
      }

      if (!loans.length) {
        App.showEmpty(listEl, 'No loans match your filters.');
        return;
      }

      renderLoanCards(listEl, loans);

      // Pagination
      if (pagEl && meta.pages > 1) {
        App.renderPagination(pagEl, meta.page, meta.pages, function(page) {
          loansPage = page;
          loadAllLoans();
        });
      }
    } catch (e) {
      App.showError(listEl, 'Failed to load loans: ' + e.message, loadAllLoans);
    }
  }

  function renderLoanCards(container, loans) {
    var isMobile = window.innerWidth < 768;
    var html = '';

    if (isMobile) {
      loans.forEach(function(l) {
        var isBiz = l.is_business;
        var addr = l.matched_address || '';
        var buyer = l.matched_grantee || '';
        var seller = l.matched_grantor || '';
        var hood = l.matched_neighborhood || '';
        var date = (l.matched_date || '').split('T')[0] || '';
        var lender = l.lender_name || l.lei || '';
        
        html += '<div class="card loan-card-full' + (isBiz ? ' loan-biz' : '') + '">';
        html += '<div class="card-header">';
        html += '<span class="card-title">' + App.formatCurrency(l.loan_amount) + (isBiz ? ' 🏢' : '') + '</span>';
        html += '<span class="card-badge">' + (l.year || '') + ' · ' + (l.interest_rate ? l.interest_rate.toFixed(2) + '%' : '--') + '</span>';
        html += '</div>';
        html += '<div class="loan-lender">🏦 ' + App.escapeHtml(lender) + '</div>';
        if (addr) html += '<div class="loan-addr">📍 ' + App.escapeHtml(addr) + '</div>';
        html += '<div class="card-metrics">';
        html += '<div class="card-metric"><span class="metric-label">Type</span><span class="metric-value">' + App.escapeHtml(l.loan_type || '') + '</span></div>';
        html += '<div class="card-metric"><span class="metric-label">Purpose</span><span class="metric-value">' + App.escapeHtml(l.loan_purpose || '') + '</span></div>';
        html += '<div class="card-metric"><span class="metric-label">Occupancy</span><span class="metric-value">' + App.escapeHtml(l.occupancy || '') + '</span></div>';
        if (l.total_units && l.total_units !== '1') {
          html += '<div class="card-metric"><span class="metric-label">Units</span><span class="metric-value">' + l.total_units + '</span></div>';
        }
        html += '</div>';
        if (buyer) html += '<div class="loan-party">Buyer: <strong>' + App.escapeHtml(buyer) + '</strong></div>';
        if (seller) html += '<div class="loan-party">Seller: ' + App.escapeHtml(seller) + '</div>';
        html += '<div class="loan-meta">';
        if (date) html += '<span>📅 ' + date + '</span>';
        if (hood) html += '<span>📍 ' + App.escapeHtml(hood) + '</span>';
        html += '</div>';
        html += '</div>';
      });
    } else {
      html += '<div class="table-scroll"><table class="data-table"><thead><tr>';
      html += '<th>Year</th><th>Amount</th><th>Rate</th><th>Lender</th><th>Type</th><th>Purpose</th>';
      html += '<th>Occupancy</th><th>LLC</th>';
      html += '<th>Address</th><th>Buyer</th><th>Seller</th><th>Neighborhood</th>';
      html += '</tr></thead><tbody>';

      loans.forEach(function(l) {
        var isBiz = l.is_business ? '✅' : '';
        var addr = l.matched_address || '';
        var buyer = l.matched_grantee || '';
        var seller = l.matched_grantor || '';
        var hood = l.matched_neighborhood || '';
        var lender = l.lender_name || l.lei || '';
        
        html += '<tr' + (l.is_business ? ' class="row-highlight"' : '') + '>';
        html += '<td><strong>' + (l.year || '') + '</strong></td>';
        html += '<td>' + App.formatCurrency(l.loan_amount) + '</td>';
        html += '<td>' + (l.interest_rate ? l.interest_rate.toFixed(2) + '%' : '--') + '</td>';
        html += '<td class="cell-lender">' + App.escapeHtml(lender) + '</td>';
        html += '<td>' + App.escapeHtml(l.loan_type || '') + '</td>';
        html += '<td>' + App.escapeHtml(l.loan_purpose || '') + '</td>';
        html += '<td>' + App.escapeHtml(l.occupancy || '') + '</td>';
        html += '<td>' + isBiz + '</td>';
        html += '<td class="cell-address">' + App.escapeHtml(addr) + '</td>';
        html += '<td>' + App.escapeHtml(buyer) + '</td>';
        html += '<td>' + App.escapeHtml(seller) + '</td>';
        html += '<td>' + App.escapeHtml(hood) + '</td>';
        html += '</tr>';
      });

      html += '</tbody></table></div>';
    }
    container.innerHTML = html;
  }

  // ==================== DETAIL VIEW ====================

  async function showDetail(lei, page) {
    currentView = 'detail';
    currentLei = lei;
    currentLoanFilter = '';
    detailLoansPage = typeof page === 'number' ? page : 1;
    var listEl = document.getElementById('lending-list');
    App.showLoading(listEl);
    
    // Hide view toggle filters, show detail
    document.getElementById('lending-lender-filters').style.display = 'none';
    document.getElementById('lending-loan-filters').style.display = 'none';
    document.getElementById('lending-loan-stats').style.display = 'none';
    var pagEl = document.getElementById('lending-pagination');
    if (pagEl) pagEl.innerHTML = '';

    try {
      var data = await App.api('lender/' + encodeURIComponent(lei), {
        page: detailLoansPage,
        limit: DETAIL_LOAN_PAGE_SIZE
      });
      if (!data.data) throw new Error('No data returned');
      renderDetail(listEl, data.data, data.meta);
      renderDetailPager(lei, data.meta || {});
    } catch(e) {
      App.showError(listEl, 'Failed to load lender detail: ' + e.message, function() { showDetail(lei); });
    }
  }

  function renderDetailPager(lei, meta) {
    var pagEl = document.getElementById('lending-pagination');
    if (!pagEl) return;
    pagEl.innerHTML = '';
    var total = listTotal({ meta: meta }, []);
    var pages = meta.pages || Math.max(1, Math.ceil(total / DETAIL_LOAN_PAGE_SIZE));
    App.renderPagination(pagEl, meta.page || detailLoansPage, pages, function(p) {
      filterLoans(lei, currentLoanFilter, p);
    });
  }

  function renderDetail(container, detail, meta) {
    var p = detail.profile;
    var hoods = detail.neighborhoods || [];
    var loans = detail.loans || [];

    var html = '<div class="lender-detail">';
    html += '<button class="btn-back" onclick="LendingModule.backToList()">← Back to lenders</button>';
    
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

    html += '<div class="loan-filters">';
    html += '<h3>Individual Loans (' + (meta ? meta.total : loans.length) + ' total)</h3>';
    html += '<div class="filter-pills">';
    html += '<button class="pill active" onclick="LendingModule.filterLoans(\'' + App.escapeHtml(p.lei || '') + '\', \'\')">All</button>';
    html += '<button class="pill" onclick="LendingModule.filterLoans(\'' + App.escapeHtml(p.lei || '') + '\', \'sub60k\')">Sub-$60K</button>';
    html += '<button class="pill" onclick="LendingModule.filterLoans(\'' + App.escapeHtml(p.lei || '') + '\', \'business\')">LLC/Business</button>';
    html += '<button class="pill" onclick="LendingModule.filterLoans(\'' + App.escapeHtml(p.lei || '') + '\', \'both\')">LLC + Sub-$60K</button>';
    html += '</div></div>';

    html += '<div id="loan-table-container">';
    html += renderDetailLoanTable(loans);
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  function renderDetailLoanTable(loans) {
    if (!loans.length) return '<p class="empty-state">No loans match this filter.</p>';
    var isMobile = window.innerWidth < 768;
    var html = '';

    if (isMobile) {
      loans.forEach(function(l) {
        var isBiz = l.is_business ? ' 🏢' : '';
        var addr = l.matched_address || '';
        var buyer = l.matched_grantee || '';
        var seller = l.matched_grantor || '';
        var hood = l.matched_neighborhood || l.neighborhood || '';
        var date = (l.matched_date || '').split('T')[0] || '';
        
        html += '<div class="card loan-card-full' + (l.is_business ? ' loan-biz' : '') + '">';
        html += '<div class="card-header">';
        html += '<span class="card-title">' + App.formatCurrency(l.loan_amount) + isBiz + '</span>';
        html += '<span class="card-badge">' + (l.interest_rate ? l.interest_rate.toFixed(2) + '%' : '--') + '</span>';
        html += '</div>';
        if (addr) html += '<div class="loan-addr">📍 ' + App.escapeHtml(addr) + '</div>';
        html += '<div class="card-metrics">';
        html += '<div class="card-metric"><span class="metric-label">Type</span><span class="metric-value">' + App.escapeHtml(l.loan_type || '') + '</span></div>';
        html += '<div class="card-metric"><span class="metric-label">Purpose</span><span class="metric-value">' + App.escapeHtml(l.loan_purpose || '') + '</span></div>';
        html += '<div class="card-metric"><span class="metric-label">Occupancy</span><span class="metric-value">' + App.escapeHtml(l.occupancy || '') + '</span></div>';
        html += '</div>';
        if (buyer) html += '<div class="loan-party">Buyer: <strong>' + App.escapeHtml(buyer) + '</strong></div>';
        if (seller) html += '<div class="loan-party">Seller: ' + App.escapeHtml(seller) + '</div>';
        html += '<div class="loan-meta">';
        if (date) html += '<span>📅 ' + date + '</span>';
        if (hood) html += '<span>📍 ' + App.escapeHtml(hood) + '</span>';
        html += '</div>';
        html += '</div>';
      });
    } else {
      html += '<div class="table-scroll"><table class="data-table"><thead><tr>';
      html += '<th>Amount</th><th>Rate</th><th>Type</th><th>Purpose</th>';
      html += '<th>Units</th><th>Occupancy</th><th>LLC</th>';
      html += '<th>Date</th><th>Address</th><th>Buyer</th><th>Seller</th><th>Neighborhood</th>';
      html += '</tr></thead><tbody>';
      loans.forEach(function(l) {
        var isBiz = l.is_business ? '✅' : '';
        html += '<tr' + (l.is_business ? ' class="row-highlight"' : '') + '>';
        html += '<td><strong>' + App.formatCurrency(l.loan_amount) + '</strong></td>';
        html += '<td>' + (l.interest_rate ? l.interest_rate.toFixed(2) + '%' : '--') + '</td>';
        html += '<td>' + App.escapeHtml(l.loan_type || '') + '</td>';
        html += '<td>' + App.escapeHtml(l.loan_purpose || '') + '</td>';
        html += '<td>' + App.escapeHtml(l.total_units || '1') + '</td>';
        html += '<td>' + App.escapeHtml(l.occupancy || '') + '</td>';
        html += '<td>' + isBiz + '</td>';
        html += '<td>' + ((l.matched_date || '').split('T')[0] || '') + '</td>';
        html += '<td class="cell-address">' + App.escapeHtml(l.matched_address || '') + '</td>';
        html += '<td>' + App.escapeHtml(l.matched_grantee || '') + '</td>';
        html += '<td>' + App.escapeHtml(l.matched_grantor || '') + '</td>';
        html += '<td>' + App.escapeHtml(l.matched_neighborhood || l.neighborhood || '') + '</td>';
        html += '</tr>';
      });
      html += '</tbody></table></div>';
    }
    return html;
  }

  async function filterLoans(lei, filter, page) {
    var container = document.getElementById('loan-table-container');
    if (!container) return;
    currentLei = lei;
    currentLoanFilter = filter || '';
    detailLoansPage = typeof page === 'number' ? page : 1;
    container.innerHTML = '<p class="loading">Loading...</p>';

    if (typeof page !== 'number') {
      document.querySelectorAll('.loan-filters .pill').forEach(function(p) { p.classList.remove('active'); });
      if (event && event.target) event.target.classList.add('active');
    }

    try {
      var params = { page: detailLoansPage, limit: DETAIL_LOAN_PAGE_SIZE };
      if (filter === 'sub60k') params.sub60k = 'true';
      if (filter === 'business') params.business = 'true';
      if (filter === 'both') { params.sub60k = 'true'; params.business = 'true'; }

      var data = await App.api('lender/' + encodeURIComponent(lei), params);
      container.innerHTML = renderDetailLoanTable((data.data && data.data.loans) || []);
      renderDetailPager(lei, data.meta || {});
    } catch(e) {
      container.innerHTML = '<p class="error">Failed to filter: ' + e.message + '</p>';
    }
  }

  function backToList() {
    // Show appropriate filters based on which view was active before detail
    document.getElementById('lending-lender-filters').style.display = '';
    document.getElementById('lending-loan-filters').style.display = 'none';
    document.getElementById('lending-loan-stats').style.display = 'none';
    currentView = 'lenders';
    document.getElementById('lending-view-lenders').classList.add('active');
    document.getElementById('lending-view-loans').classList.remove('active');
    loadLending();
  }

  function refresh() {
    if (currentView === 'lenders') loadLending();
    else if (currentView === 'loans') loadAllLoans();
  }

  window.LendingModule = {
    init: init,
    refresh: refresh,
    switchView: switchView,
    showDetail: showDetail,
    filterLoans: filterLoans,
    backToList: backToList
  };

})();
