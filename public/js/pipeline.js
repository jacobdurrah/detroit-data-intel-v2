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
  var currentView = 'list';

  var SALE_FIELDS = {
    id: 'Sale ID', pid: 'Parcel ID', addr: 'Address', dt: 'Sale Date',
    pr: 'Sale Price', gr: 'Grantor', ge: 'Grantee', tos: 'Term of Sale',
    si: 'Instrument', pcc: 'Class Code', pcd: 'Class Description',
    nb: 'Neighborhood', cd: 'Council District', zip: 'ZIP Code'
  };

  var BLIGHT_FIELDS = {
    id: 'Ticket ID', addr: 'Address', dt: 'Date', desc: 'Violation',
    disp: 'Disposition', fine: 'Fine', nb: 'Neighborhood'
  };

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
      neighborhoodEl.addEventListener('change', function () { currentPage = 1; loadPipeline(); });
    }

    document.getElementById('pipeline-list').addEventListener('click', function (e) {
      // Map button
      var btn = e.target.closest('.btn-map');
      if (btn) {
        e.stopPropagation();
        var lat = btn.getAttribute('data-lat');
        var lng = btn.getAttribute('data-lng');
        var addr = btn.getAttribute('data-address');
        if (lat && lng && window.MapModule) {
          window.MapModule.showOnMap([{ lat: Number(lat), lng: Number(lng), address: addr }], 'sales');
        }
        return;
      }

      // Card click for detail
      var card = e.target.closest('.card[data-address]');
      if (card) {
        showPropertyDetail(card.getAttribute('data-address'));
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
    } catch (e) { /* Non-critical */ }
  }

  async function loadPipeline() {
    currentView = 'list';
    var listEl = document.getElementById('pipeline-list');
    var paginationEl = document.getElementById('pipeline-pagination');
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = '';

    App.showLoading(listEl);
    paginationEl.innerHTML = '';

    try {
      var filters = getFilters();
      var data = await App.api('sellers', filters);
      var sellers = data.data || data.sellers || data || [];
      var meta = data.meta || {};
      var total = meta.total != null ? meta.total : (data.total || data.count || sellers.length);
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
      var addr = s.address || s.addr || s.property_address || '';

      var reasons = s.reasons || [];
      if (typeof reasons === 'string') {
        try { reasons = JSON.parse(reasons); } catch (e) { reasons = reasons.split(',').map(function (r) { return r.trim(); }); }
      }

      html +=
        '<div class="card card-clickable" data-address="' + App.escapeHtml(addr) + '">' +
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
              reasons.map(function (r) { return '<li class="reason-tag">' + App.escapeHtml(r) + '</li>'; }).join('') +
            '</ul>' : '') +
          '<div class="card-footer-row">' +
            (lat && lng ?
              '<button class="btn-map" data-lat="' + lat + '" data-lng="' + lng + '" data-address="' + App.escapeHtml(addr) + '">' +
                '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>' +
                'Map' +
              '</button>' : '') +
            '<span class="card-footer" style="flex:1;text-align:right;">Click for full report \u2192</span>' +
          '</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  async function showPropertyDetail(address) {
    if (!address) return;
    currentView = 'detail';

    var listEl = document.getElementById('pipeline-list');
    var paginationEl = document.getElementById('pipeline-pagination');
    paginationEl.innerHTML = '';

    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = 'none';

    App.showLoading(listEl);

    try {
      var data = await App.api('property/' + encodeURIComponent(address));
      if (!data.data) throw new Error('No data returned');
      renderPropertyDetail(listEl, data.data);
    } catch (e) {
      App.showError(listEl, 'Failed to load property: ' + e.message, function () { showPropertyDetail(address); });
    }
  }

  function renderPropertyDetail(container, detail) {
    var summary = detail.summary || {};

    var html = '<div class="detail-view">';
    html += '<button class="btn-back" onclick="PipelineModule.backToList()">\u2190 Back to pipeline</button>';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(detail.address || 'Unknown') + '</h2>';
    if (detail.neighborhood) {
      html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:8px;">Neighborhood: ' + App.escapeHtml(detail.neighborhood) + '</div>';
    }

    html += '<div class="card-metrics">';
    html += '<div class="card-metric"><span class="metric-label">Sales</span><span class="metric-value">' + App.formatNumber(summary.total_sales) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Permits</span><span class="metric-value">' + App.formatNumber(summary.total_permits) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Trades</span><span class="metric-value">' + App.formatNumber(summary.total_trades) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Blight Tickets</span><span class="metric-value">' + App.formatNumber(summary.total_blight) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Total Fines</span><span class="metric-value">' + App.formatCurrency(summary.total_fines) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Current Owner</span><span class="metric-value truncate">' + App.escapeHtml(summary.current_owner || '--') + '</span></div>';
    html += '</div></div>';

    // Motivated seller signals
    if (detail.signals && detail.signals.length) {
      html += '<h3>Motivated Seller Signals</h3>';
      html += '<ul class="reasons-list" style="margin-bottom:16px;">';
      detail.signals.forEach(function (s) {
        html += '<li class="reason-tag">' + App.escapeHtml(s) + '</li>';
      });
      html += '</ul>';
    }

    // Ownership history
    if (detail.owners && detail.owners.length) {
      html += '<h3>Ownership History</h3>';
      detail.owners.forEach(function (o) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(o.name || 'Unknown') + '</span>';
        html += '<span class="card-badge">' + App.formatCurrencyFull(o.price) + '</span></div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Date</span><span class="kv-value">' + App.formatDate(o.date) + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">From</span><span class="kv-value">' + App.escapeHtml(o.from || '--') + '</span></div>';
        html += '</div></div>';
      });
    }

    // Full sale records
    if (detail.sales && detail.sales.length) {
      html += '<h3>Sale Records (' + detail.sales.length + ')</h3>';
      detail.sales.forEach(function (s) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.formatDate(s.dt) + '</span>';
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
    }

    // Blight tickets
    if (detail.blight && detail.blight.length) {
      html += '<h3>Blight Tickets (' + detail.blight.length + ')</h3>';
      detail.blight.forEach(function (b) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(b.desc || 'Violation') + '</span>';
        html += '<span class="card-badge" style="background:var(--danger);color:white;">' + App.formatCurrencyFull(b.fine) + '</span></div>';
        html += '<div class="kv-grid">';
        Object.keys(BLIGHT_FIELDS).forEach(function (key) {
          if (b[key] == null || b[key] === '') return;
          var val = b[key];
          if (key === 'fine') val = App.formatCurrencyFull(val);
          else if (key === 'dt') val = App.formatDate(val);
          else val = App.escapeHtml(String(val));
          html += '<div class="kv-item"><span class="kv-label">' + BLIGHT_FIELDS[key] + '</span><span class="kv-value">' + val + '</span></div>';
        });
        html += '</div></div>';
      });
    }

    // Permits
    if (detail.permits && detail.permits.length) {
      html += '<h3>Building Permits (' + detail.permits.length + ')</h3>';
      detail.permits.forEach(function (p) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(p.id || '') + '</span>';
        html += '<span class="specialty-badge">' + App.escapeHtml(p.type || '') + '</span></div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Issued</span><span class="kv-value">' + App.formatDate(p.dt) + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Description</span><span class="kv-value">' + App.escapeHtml(p.desc || '') + '</span></div>';
        if (p.cost) html += '<div class="kv-item"><span class="kv-label">Cost</span><span class="kv-value">' + App.formatCurrencyFull(p.cost) + '</span></div>';
        if (p.cur) html += '<div class="kv-item"><span class="kv-label">Current Use</span><span class="kv-value">' + App.escapeHtml(p.cur) + '</span></div>';
        html += '</div></div>';
      });
    }

    // Trades
    if (detail.trades && detail.trades.length) {
      html += '<h3>Trade Permits (' + detail.trades.length + ')</h3>';
      detail.trades.forEach(function (t) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(t.id || '') + '</span>';
        html += '<span class="specialty-badge">' + App.escapeHtml(t.type || '') + '</span></div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Issued</span><span class="kv-value">' + App.formatDate(t.dt) + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Description</span><span class="kv-value">' + App.escapeHtml(t.desc || '') + '</span></div>';
        if (t.own) html += '<div class="kv-item"><span class="kv-label">Owner</span><span class="kv-value">' + App.escapeHtml(t.own) + '</span></div>';
        if (t.biz) html += '<div class="kv-item"><span class="kv-label">Contractor</span><span class="kv-value">' + App.escapeHtml(t.biz) + '</span></div>';
        html += '</div></div>';
      });
    }

    html += '</div>';
    container.innerHTML = html;
  }

  function backToList() {
    currentView = 'list';
    currentPage = 1;
    loadPipeline();
  }

  function refresh() {
    if (currentView === 'list') loadPipeline();
  }

  window.PipelineModule = {
    init: init,
    refresh: refresh,
    showPropertyDetail: showPropertyDetail,
    backToList: backToList
  };

})();
