/* ============================================================
   Detroit Data Intelligence Platform V2 - Lending Module
   ============================================================ */
(function () {
  'use strict';

  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    bindEvents();
    loadLending();
  }

  function bindEvents() {
    var sub60kEl = document.getElementById('lending-sub60k');
    var investmentEl = document.getElementById('lending-investment');
    var multifamilyEl = document.getElementById('lending-multifamily');
    var sortEl = document.getElementById('lending-sort');

    [sub60kEl, investmentEl, multifamilyEl].forEach(function (el) {
      if (el) {
        el.addEventListener('change', function () {
          loadLending();
        });
      }
    });

    if (sortEl) {
      sortEl.addEventListener('change', function () {
        loadLending();
      });
    }
  }

  function getFilters() {
    return {
      sub60k: (document.getElementById('lending-sub60k') || {}).checked ? 'true' : '',
      investment: (document.getElementById('lending-investment') || {}).checked ? 'true' : '',
      multifamily: (document.getElementById('lending-multifamily') || {}).checked ? 'true' : '',
      sort: (document.getElementById('lending-sort') || {}).value || 'total_loans'
    };
  }

  async function loadLending() {
    var listEl = document.getElementById('lending-list');

    App.showLoading(listEl);

    try {
      var filters = getFilters();
      var data = await App.api('lending', filters);

      var lenders = data.data || data.lenders || data || [];

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
    if (rate == null) return '';
    var r = Number(rate);
    if (isNaN(r)) return '';
    if (r < 5) return 'rate-low';
    if (r < 7) return 'rate-mid';
    return 'rate-high';
  }

  function renderCards(container, lenders) {
    var html = '';
    lenders.forEach(function (l) {
      var rate = l.avg_rate || l.average_rate;
      var rateClass = getRateClass(rate);

      var loanTypes = l.loan_types || l.types || [];
      if (typeof loanTypes === 'string') {
        loanTypes = loanTypes.split(',').map(function (s) { return s.trim(); });
      }

      html +=
        '<div class="card">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(l.name || l.lender_name || 'Unknown') + '</span>' +
          '</div>' +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Total Loans</span><span class="metric-value">' + App.formatNumber(l.total_loans || l.loan_count) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Volume</span><span class="metric-value">' + App.formatCurrency(l.total_volume || l.volume) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Avg Rate</span><span class="metric-value ' + rateClass + '">' + (rate != null ? App.formatPercent(rate, 2) : '--') + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Sub-$60K</span><span class="metric-value">' + App.formatNumber(l.sub_60k_count || l.sub60k || 0) + '</span></div>' +
          '</div>' +
          (loanTypes.length ?
            '<div class="card-tags">' +
              loanTypes.map(function (t) {
                return '<span class="reason-tag">' + App.escapeHtml(t) + '</span>';
              }).join('') +
            '</div>' : '') +
        '</div>';
    });
    container.innerHTML = html;
  }

  function refresh() {
    loadLending();
  }

  /* --- Exports --- */
  window.LendingModule = {
    init: init,
    refresh: refresh
  };

})();
