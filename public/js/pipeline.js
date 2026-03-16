/* ============================================================
   Detroit Data Intelligence Platform V2 - Pipeline Module
   ============================================================ */
(function () {
  'use strict';

  var PAGE_SIZE = 20;
  var currentPage = 1;
  var totalPages = 1;
  var initialized = false;
  var neighborhoodsLoaded = false;

  function init() {
    if (initialized) return;
    initialized = true;

    bindEvents();
    loadPipeline();
    loadNeighborhoodOptions();
  }

  function bindEvents() {
    var scoreEl = document.getElementById('pipeline-score');
    var scoreValEl = document.getElementById('pipeline-score-val');
    var neighborhoodEl = document.getElementById('pipeline-neighborhood');

    if (scoreEl) {
      scoreEl.addEventListener('input', function () {
        if (scoreValEl) scoreValEl.textContent = this.value;
      });
      scoreEl.addEventListener('change', App.debounce(function () {
        currentPage = 1;
        loadPipeline();
      }, 300));
    }

    if (neighborhoodEl) {
      neighborhoodEl.addEventListener('change', function () {
        currentPage = 1;
        loadPipeline();
      });
    }

    // Event delegation for "Show on Map" buttons
    document.getElementById('pipeline-list').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-map');
      if (btn) {
        e.stopPropagation();
        var lat = btn.getAttribute('data-lat');
        var lng = btn.getAttribute('data-lng');
        var addr = btn.getAttribute('data-address');
        if (lat && lng && window.MapModule) {
          window.MapModule.showOnMap([{
            lat: Number(lat),
            lng: Number(lng),
            address: addr
          }], 'sales');
        }
      }
    });
  }

  function getFilters() {
    return {
      min_score: (document.getElementById('pipeline-score') || {}).value || 50,
      neighborhood: (document.getElementById('pipeline-neighborhood') || {}).value || '',
      page: currentPage,
      limit: PAGE_SIZE
    };
  }

  async function loadNeighborhoodOptions() {
    if (neighborhoodsLoaded) return;
    try {
      var data = await App.api('neighborhoods', { sort: 'score', limit: 200 });
      var neighborhoods = data.data || data.neighborhoods || data || [];
      var sel = document.getElementById('pipeline-neighborhood');
      if (!sel) return;

      neighborhoods.forEach(function (n) {
        var name = n.name || n.neighborhood || '';
        if (!name) return;
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      neighborhoodsLoaded = true;
    } catch (e) {
      // Non-critical
    }
  }

  async function loadPipeline() {
    var listEl = document.getElementById('pipeline-list');
    var paginationEl = document.getElementById('pipeline-pagination');

    App.showLoading(listEl);
    paginationEl.innerHTML = '';

    try {
      var filters = getFilters();
      var data = await App.api('sellers', filters);

      var sellers = data.data || data.sellers || data || [];
      var total = data.total || data.count || sellers.length;
      totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (!sellers.length) {
        App.showEmpty(listEl, 'No motivated sellers match your criteria.');
        return;
      }

      renderCards(listEl, sellers);

      App.renderPagination(paginationEl, currentPage, totalPages, function (page) {
        currentPage = page;
        loadPipeline();
      });

    } catch (e) {
      App.showError(listEl, 'Failed to load pipeline data: ' + e.message, loadPipeline);
    }
  }

  function getScoreClass(score) {
    var s = Number(score) || 0;
    if (s >= 70) return 'score-high';
    if (s >= 40) return 'score-mid';
    return 'score-low';
  }

  function renderCards(container, sellers) {
    var html = '';
    sellers.forEach(function (s) {
      var score = Number(s.score) || 0;
      var scoreClass = getScoreClass(score);
      var lat = s.lat || s.latitude || '';
      var lng = s.lng || s.lon || s.longitude || '';
      var addr = s.address || s.property_address || '';

      var reasons = s.reasons || [];
      if (typeof reasons === 'string') {
        try { reasons = JSON.parse(reasons); } catch (e) { reasons = reasons.split(',').map(function (r) { return r.trim(); }); }
      }

      html +=
        '<div class="card">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(addr || 'Unknown Address') + '</span>' +
            '<span class="score-num ' + scoreClass + '" style="font-size:18px;font-weight:800;">' + score + '</span>' +
          '</div>' +
          '<div class="score-bar-container">' +
            '<div class="score-bar-bg">' +
              '<div class="score-bar-fill ' + scoreClass + '" style="width:' + Math.min(100, score) + '%"></div>' +
            '</div>' +
          '</div>' +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Price</span><span class="metric-value">' + App.formatCurrency(s.price || s.sale_price) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Date</span><span class="metric-value">' + App.formatDate(s.date || s.sale_date) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Grantor</span><span class="metric-value truncate">' + App.escapeHtml(s.grantor || '--') + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Grantee</span><span class="metric-value truncate">' + App.escapeHtml(s.grantee || '--') + '</span></div>' +
          '</div>' +
          (reasons.length ?
            '<ul class="reasons-list">' +
              reasons.map(function (r) {
                return '<li class="reason-tag">' + App.escapeHtml(r) + '</li>';
              }).join('') +
            '</ul>' : '') +
          (lat && lng ?
            '<button class="btn-map" data-lat="' + lat + '" data-lng="' + lng + '" data-address="' + App.escapeHtml(addr) + '">' +
              '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>' +
              'Show on Map' +
            '</button>' : '') +
        '</div>';
    });
    container.innerHTML = html;
  }

  function refresh() {
    currentPage = 1;
    loadPipeline();
  }

  /* --- Exports --- */
  window.PipelineModule = {
    init: init,
    refresh: refresh
  };

})();
