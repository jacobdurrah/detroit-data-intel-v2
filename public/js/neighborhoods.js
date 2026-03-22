/* ============================================================
   Detroit Data Intelligence Platform V2 - Neighborhoods Module
   ============================================================ */
(function () {
  'use strict';

  var initialized = false;
  var currentView = 'list';
  var rawNeighborhoods = [];
  var scoreWeights = {
    sales_volume: 25,
    median_price: 25,
    permit_activity: 20,
    blight: 15,
    rentals: 10,
    demos: 5
  };
  var showEmpty = false;

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    loadNeighborhoods();
  }

  function bindEvents() {
    var sortEl = document.getElementById('neighborhood-sort');
    if (sortEl) {
      sortEl.addEventListener('change', function () { recalculate(); });
    }

    var timeEl = document.getElementById('neighborhood-time-range');
    if (timeEl) {
      timeEl.addEventListener('change', function () { loadNeighborhoods(); });
    }

    var showEmptyEl = document.getElementById('neighborhood-show-empty');
    if (showEmptyEl) {
      showEmptyEl.addEventListener('change', function () {
        showEmpty = this.checked;
        recalculate();
      });
    }

    var toggleBtn = document.getElementById('score-weights-toggle-btn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function () {
        var panel = document.getElementById('score-weights-panel');
        if (panel) panel.classList.toggle('open');
      });
    }

    // Weight slider listeners
    document.querySelectorAll('#score-weights-panel input[type="range"]').forEach(function (slider) {
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

    document.getElementById('neighborhoods-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-neighborhood]');
      if (card) {
        showNeighborhoodDetail(card.getAttribute('data-neighborhood'));
      }
    });
  }

  function recalculate() {
    if (!rawNeighborhoods.length) return;

    var filtered = rawNeighborhoods.slice();

    // Filter empty neighborhoods (< 5 total data points)
    if (!showEmpty) {
      filtered = filtered.filter(function (n) {
        return ((n.sales_count || 0) + (n.permits_count || 0) + (n.blight_count || 0)) >= 5;
      });
    }

    // Recalculate scores based on weights
    var totalWeight = scoreWeights.sales_volume + scoreWeights.median_price +
      scoreWeights.permit_activity + scoreWeights.blight +
      scoreWeights.rentals + scoreWeights.demos;
    if (totalWeight === 0) totalWeight = 1;

    filtered = filtered.map(function (n) {
      var sc = n.score_components || {};
      var weighted =
        (sc.sales_volume_pct || 0) * scoreWeights.sales_volume +
        (sc.median_price_pct || 0) * scoreWeights.median_price +
        (sc.permit_activity_pct || 0) * scoreWeights.permit_activity +
        (1 - (sc.blight_pct || 0)) * scoreWeights.blight +
        (sc.rental_pct || 0) * scoreWeights.rentals +
        (1 - (sc.demo_pct || 0)) * scoreWeights.demos;

      return Object.assign({}, n, { score: Math.round(weighted / totalWeight * 100) });
    });

    // Sort
    var sortVal = (document.getElementById('neighborhood-sort') || {}).value || 'score';
    filtered.sort(function (a, b) {
      switch (sortVal) {
        case 'sales': return (b.sales_count || 0) - (a.sales_count || 0);
        case 'price': return (b.median_price || 0) - (a.median_price || 0);
        case 'permits': return (b.permits_count || 0) - (a.permits_count || 0);
        case 'blight': return (a.blight_count || 0) - (b.blight_count || 0);
        default: return (b.score || 0) - (a.score || 0);
      }
    });

    renderCards(document.getElementById('neighborhoods-list'), filtered);
  }

  async function loadNeighborhoods() {
    currentView = 'list';
    var listEl = document.getElementById('neighborhoods-list');
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = '';
    var weightsPanel = document.getElementById('score-weights-panel');
    if (weightsPanel) weightsPanel.style.display = '';

    App.showLoading(listEl);

    try {
      var timeRange = (document.getElementById('neighborhood-time-range') || {}).value || 'all';
      var data = await App.api('neighborhoods', { time_range: timeRange });
      rawNeighborhoods = data.data || data.neighborhoods || data || [];

      if (!rawNeighborhoods.length) {
        App.showEmpty(listEl, 'No neighborhood data available.');
        return;
      }

      recalculate();
    } catch (e) {
      App.showError(listEl, 'Failed to load neighborhoods: ' + e.message, loadNeighborhoods);
    }
  }

  function renderCards(container, neighborhoods) {
    var html = '';
    neighborhoods.forEach(function (n) {
      var score = Number(n.score) || 0;
      var scoreClass = score >= 70 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
      var sc = n.score_components || {};

      html +=
        '<div class="card card-clickable" data-neighborhood="' + App.escapeHtml(n.name || n.neighborhood || '') + '">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(n.name || n.neighborhood || 'Unknown') + '</span>' +
          '</div>' +
          '<div class="score-bar-container">' +
            '<div class="score-label">' +
              '<span class="score-text">Opportunity Score</span>' +
              '<span class="score-num ' + scoreClass + '">' + score + '</span>' +
            '</div>' +
            '<div class="score-bar-bg">' +
              '<div class="score-bar-fill ' + scoreClass + '" style="width:' + Math.min(100, score) + '%"></div>' +
            '</div>' +
          '</div>' +
          renderBreakdownBar(sc) +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Sales</span><span class="metric-value">' + App.formatNumber(n.sales_count || n.total_sales) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Med. Price</span><span class="metric-value">' + App.formatCurrency(n.median_price) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Permits</span><span class="metric-value">' + App.formatNumber(n.permits_count || n.total_permits) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Blight</span><span class="metric-value">' + App.formatNumber(n.blight_count || n.total_blight) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Rentals</span><span class="metric-value">' + App.formatNumber(n.rentals_count || n.total_rentals) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Demos</span><span class="metric-value">' + App.formatNumber(n.demos_count || n.total_demos) + '</span></div>' +
          '</div>' +
          '<div class="card-footer">Click for full detail \u2192</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  function renderBreakdownBar(sc) {
    if (!sc) return '';
    var totalWeight = scoreWeights.sales_volume + scoreWeights.median_price +
      scoreWeights.permit_activity + scoreWeights.blight +
      scoreWeights.rentals + scoreWeights.demos;
    if (totalWeight === 0) return '';

    var segments = [
      { pct: (sc.sales_volume_pct || 0) * scoreWeights.sales_volume / totalWeight * 100, color: '#3b82f6' },
      { pct: (sc.median_price_pct || 0) * scoreWeights.median_price / totalWeight * 100, color: '#10b981' },
      { pct: (sc.permit_activity_pct || 0) * scoreWeights.permit_activity / totalWeight * 100, color: '#8b5cf6' },
      { pct: (1 - (sc.blight_pct || 0)) * scoreWeights.blight / totalWeight * 100, color: '#ef4444' },
      { pct: (sc.rental_pct || 0) * scoreWeights.rentals / totalWeight * 100, color: '#06b6d4' },
      { pct: (1 - (sc.demo_pct || 0)) * scoreWeights.demos / totalWeight * 100, color: '#6b7280' }
    ];

    var html = '<div class="score-breakdown">';
    segments.forEach(function (s) {
      if (s.pct > 0) {
        html += '<div class="score-breakdown-seg" style="width:' + s.pct.toFixed(1) + '%;background:' + s.color + ';"></div>';
      }
    });
    html += '</div>';
    return html;
  }

  async function showNeighborhoodDetail(name) {
    if (!name) return;
    currentView = 'detail';

    var listEl = document.getElementById('neighborhoods-list');
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = 'none';
    var weightsPanel = document.getElementById('score-weights-panel');
    if (weightsPanel) weightsPanel.style.display = 'none';

    App.showLoading(listEl);

    try {
      var data = await App.api('neighborhood/' + encodeURIComponent(name));
      if (!data.data) throw new Error('No data returned');
      renderNeighborhoodDetail(listEl, data.data, name);
    } catch (e) {
      App.showError(listEl, 'Failed to load neighborhood: ' + e.message, function () { showNeighborhoodDetail(name); });
    }
  }

  function renderNeighborhoodDetail(container, detail, neighborhoodName) {
    var p = detail.profile || {};
    var sales = detail.sales || {};
    var permits = detail.permits || {};
    var trades = detail.trades || {};
    var blight = detail.blight || {};

    var html = '<div class="detail-view">';
    html += '<button class="btn-back" onclick="NeighborhoodsModule.backToList()">\u2190 Back to neighborhoods</button>';

    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(p.name || p.neighborhood || neighborhoodName) + '</h2>';

    var score = Number(p.score) || 0;
    if (score > 0) {
      var scoreClass = score >= 70 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
      html += '<div class="score-bar-container" style="margin:8px 0;">';
      html += '<div class="score-label"><span class="score-text">Opportunity Score</span><span class="score-num ' + scoreClass + '">' + score + '</span></div>';
      html += '<div class="score-bar-bg"><div class="score-bar-fill ' + scoreClass + '" style="width:' + Math.min(100, score) + '%"></div></div>';
      html += '</div>';
    }

    html += '<div class="card-metrics">';
    html += '<div class="card-metric"><span class="metric-label">Sales</span><span class="metric-value">' + App.formatNumber(sales.total) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Med. Price</span><span class="metric-value">' + App.formatCurrency(sales.median_price) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Sales Volume</span><span class="metric-value">' + App.formatCurrency(sales.total_volume) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Permits</span><span class="metric-value">' + App.formatNumber(permits.total) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Trades</span><span class="metric-value">' + App.formatNumber(trades.total) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Blight</span><span class="metric-value">' + App.formatNumber(blight.total) + '</span></div>';
    html += '</div></div>';

    var encName = encodeURIComponent(neighborhoodName);
    html += '<div class="loan-filters">';
    html += '<div class="filter-pills">';
    html += '<button class="pill active" onclick="NeighborhoodsModule.loadSection(\'' + encName + '\', \'overview\')">Overview</button>';
    html += '<button class="pill" onclick="NeighborhoodsModule.loadSection(\'' + encName + '\', \'sales\')">Sales (' + App.formatNumber(sales.total) + ')</button>';
    html += '<button class="pill" onclick="NeighborhoodsModule.loadSection(\'' + encName + '\', \'permits\')">Permits (' + App.formatNumber(permits.total) + ')</button>';
    html += '<button class="pill" onclick="NeighborhoodsModule.loadSection(\'' + encName + '\', \'blight\')">Blight (' + App.formatNumber(blight.total) + ')</button>';
    html += '<button class="pill" onclick="NeighborhoodsModule.loadSection(\'' + encName + '\', \'trades\')">Trades (' + App.formatNumber(trades.total) + ')</button>';
    html += '</div></div>';

    html += '<div id="neighborhood-section-container">';
    html += renderOverview(detail);
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  function renderOverview(detail) {
    var html = '';
    var sales = detail.sales || {};
    var permits = detail.permits || {};
    var trades = detail.trades || {};
    var blight = detail.blight || {};

    if (sales.recent && sales.recent.length) {
      html += '<h3>Recent Sales</h3>';
      sales.recent.forEach(function (s) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(s.addr || '') + '</span>';
        html += '<span class="card-badge">' + App.formatCurrencyFull(s.pr) + '</span></div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Date</span><span class="kv-value">' + App.formatDate(s.dt) + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Seller</span><span class="kv-value">' + App.escapeHtml(s.gr || '') + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Buyer</span><span class="kv-value">' + App.escapeHtml(s.ge || '') + '</span></div>';
        html += '</div></div>';
      });
    }

    if (permits.types) {
      html += '<h3>Permit Activity</h3>';
      html += '<div class="card-tags">';
      Object.keys(permits.types).forEach(function (t) {
        html += '<span class="reason-tag">' + App.escapeHtml(t) + ' (' + permits.types[t] + ')</span>';
      });
      html += '</div>';
    }

    if (trades.top_contractors && trades.top_contractors.length) {
      html += '<h3>Top Contractors</h3>';
      html += '<div class="detail-hoods">';
      trades.top_contractors.forEach(function (c) {
        html += '<div class="hood-row">';
        html += '<span class="hood-name clickable" onclick="NeighborhoodsModule.goToContractor(\'' + encodeURIComponent(c.name) + '\')">' + App.escapeHtml(c.name) + '</span>';
        html += '<span class="hood-count">' + c.count + ' permits</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    if (blight.total > 0) {
      html += '<h3>Blight Summary</h3>';
      html += '<div class="card-metrics" style="margin-bottom:12px;">';
      html += '<div class="card-metric"><span class="metric-label">Total Tickets</span><span class="metric-value">' + App.formatNumber(blight.total) + '</span></div>';
      html += '<div class="card-metric"><span class="metric-label">Total Fines</span><span class="metric-value">' + App.formatCurrency(blight.total_fines) + '</span></div>';
      html += '</div>';

      if (blight.recent && blight.recent.length) {
        blight.recent.forEach(function (b) {
          html += '<div class="card detail-record">';
          html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(b.addr || '') + '</span>';
          html += '<span class="card-badge" style="background:var(--danger);color:white;">' + App.formatCurrencyFull(b.fine) + '</span></div>';
          html += '<div class="kv-grid">';
          html += '<div class="kv-item"><span class="kv-label">Date</span><span class="kv-value">' + App.formatDate(b.dt) + '</span></div>';
          html += '<div class="kv-item"><span class="kv-label">Violation</span><span class="kv-value">' + App.escapeHtml(b.desc || '') + '</span></div>';
          html += '<div class="kv-item"><span class="kv-label">Disposition</span><span class="kv-value">' + App.escapeHtml(b.disp || '') + '</span></div>';
          html += '</div></div>';
        });
      }
    }

    return html;
  }

  async function loadSection(encodedName, section) {
    var name = decodeURIComponent(encodedName);
    document.querySelectorAll('.filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');

    var container = document.getElementById('neighborhood-section-container');
    if (!container) return;

    if (section === 'overview') {
      container.innerHTML = '<div class="spinner"></div>';
      try {
        var data = await App.api('neighborhood/' + encodeURIComponent(name));
        container.innerHTML = renderOverview(data.data);
      } catch (e) {
        container.innerHTML = '<p class="error">Failed to load: ' + e.message + '</p>';
      }
      return;
    }

    container.innerHTML = '<div class="spinner"></div>';
    loadSectionPage(name, section, 1);
  }

  async function loadSectionPage(name, section, page) {
    var container = document.getElementById('neighborhood-section-container');
    if (!container) return;

    try {
      var data = await App.api('neighborhood/' + encodeURIComponent(name), { section: section, page: page, limit: 20 });
      var records = data.data.records || [];
      var meta = data.meta || {};

      var html = '<h3>' + section.charAt(0).toUpperCase() + section.slice(1) + ' (' + App.formatNumber(meta.total) + ' total)</h3>';

      if (!records.length) {
        html += '<p class="empty-state">No records found.</p>';
      } else {
        records.forEach(function (r) {
          html += renderSectionRecord(r, section);
        });
      }

      html += '<div id="section-pagination" class="pagination"></div>';
      container.innerHTML = html;

      if (meta.pages > 1) {
        App.renderPagination(document.getElementById('section-pagination'), meta.page, meta.pages, function (p) {
          container.innerHTML = '<div class="spinner"></div>';
          loadSectionPage(name, section, p);
        });
      }
    } catch (e) {
      container.innerHTML = '<p class="error">Failed to load: ' + e.message + '</p>';
    }
  }

  function renderSectionRecord(r, section) {
    var html = '<div class="card detail-record">';
    html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(r.addr || '') + '</span>';

    if (section === 'sales') {
      html += '<span class="card-badge">' + App.formatCurrencyFull(r.pr) + '</span>';
    } else if (section === 'blight') {
      html += '<span class="card-badge" style="background:var(--danger);color:white;">' + App.formatCurrencyFull(r.fine) + '</span>';
    } else if (section === 'permits' || section === 'trades') {
      html += '<span class="specialty-badge">' + App.escapeHtml(r.type || '') + '</span>';
    }

    html += '</div><div class="kv-grid">';

    var fields = {};
    if (section === 'sales') {
      fields = { dt: 'Date', pr: 'Price', gr: 'Seller', ge: 'Buyer', tos: 'Term', si: 'Instrument', pcd: 'Class', pid: 'Parcel', zip: 'ZIP' };
    } else if (section === 'permits') {
      fields = { id: 'Permit ID', dt: 'Issued', type: 'Type', desc: 'Description', cur: 'Current Use', prop: 'Proposed Use', zoning: 'Zoning', cost: 'Cost' };
    } else if (section === 'trades') {
      fields = { id: 'Record ID', dt: 'Issued', type: 'Type', desc: 'Description', own: 'Owner', biz: 'Business', con: 'Contact' };
    } else if (section === 'blight') {
      fields = { id: 'Ticket ID', dt: 'Date', desc: 'Violation', disp: 'Disposition', fine: 'Fine' };
    }

    Object.keys(fields).forEach(function (key) {
      if (r[key] == null || r[key] === '') return;
      var val = r[key];
      if (key === 'pr' || key === 'fine' || key === 'cost') val = App.formatCurrencyFull(val);
      else if (key === 'dt') val = App.formatDate(val);
      else val = App.escapeHtml(String(val));
      html += '<div class="kv-item"><span class="kv-label">' + fields[key] + '</span><span class="kv-value">' + val + '</span></div>';
    });

    html += '</div></div>';
    return html;
  }

  function goToContractor(encodedName) {
    var name = decodeURIComponent(encodedName);
    App.switchTab('contractors');
    setTimeout(function () {
      if (window.ContractorsModule && window.ContractorsModule.showContractorDetail) {
        window.ContractorsModule.showContractorDetail(name);
      }
    }, 300);
  }

  function backToList() {
    currentView = 'list';
    loadNeighborhoods();
  }

  function refresh() {
    if (currentView === 'list') loadNeighborhoods();
  }

  window.NeighborhoodsModule = {
    init: init,
    refresh: refresh,
    showNeighborhoodDetail: showNeighborhoodDetail,
    loadSection: loadSection,
    goToContractor: goToContractor,
    backToList: backToList
  };

})();
