/* ============================================================
   Detroit Data Intelligence Platform V2 - Main App Controller
   ============================================================ */
(function () {
  'use strict';

  /* --- Global State --- */
  var state = {
    activeTab: 'map',
    loadedTabs: {},
    stats: null
  };

  /* --- API Helper --- */
  async function api(endpoint, params) {
    var url = '/api/' + endpoint;
    if (params) {
      var qs = Object.entries(params)
        .filter(function (e) { return e[1] !== undefined && e[1] !== null && e[1] !== ''; })
        .map(function (e) { return encodeURIComponent(e[0]) + '=' + encodeURIComponent(e[1]); })
        .join('&');
      if (qs) url += '?' + qs;
    }
    var res = await fetch(url);
    if (!res.ok) {
      var errText = await res.text().catch(function () { return 'Unknown error'; });
      throw new Error('API error ' + res.status + ': ' + errText);
    }
    return res.json();
  }

  /* --- Format Helpers --- */
  function formatNumber(n) {
    if (n == null) return '--';
    var num = Number(n);
    if (isNaN(num)) return '--';
    if (Math.abs(num) >= 1e6) return (num / 1e6).toFixed(1) + 'M';
    if (Math.abs(num) >= 1e3) return (num / 1e3).toFixed(1) + 'K';
    return num.toLocaleString();
  }

  function formatCurrency(n) {
    if (n == null) return '--';
    var num = Number(n);
    if (isNaN(num)) return '--';
    if (Math.abs(num) >= 1e6) return '$' + (num / 1e6).toFixed(1) + 'M';
    if (Math.abs(num) >= 1e3) return '$' + (num / 1e3).toFixed(1) + 'K';
    return '$' + num.toLocaleString();
  }

  function formatCurrencyFull(n) {
    if (n == null) return '--';
    var num = Number(n);
    if (isNaN(num)) return '--';
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  }

  function formatDate(d) {
    if (!d) return '--';
    var date = new Date(d);
    if (isNaN(date.getTime())) return d;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function formatPercent(n, decimals) {
    if (n == null) return '--';
    return Number(n).toFixed(decimals != null ? decimals : 1) + '%';
  }

  /* --- Debounce --- */
  function debounce(fn, ms) {
    var timer;
    return function () {
      var args = arguments;
      var ctx = this;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(ctx, args); }, ms);
    };
  }

  /* --- DOM Helpers --- */
  function $(sel) { return document.querySelector(sel); }
  function $$(sel) { return document.querySelectorAll(sel); }

  function showLoading(container) {
    container.innerHTML =
      '<div class="loading-state">' +
        '<div class="skeleton-card"></div>' +
        '<div class="skeleton-card"></div>' +
        '<div class="skeleton-card"></div>' +
      '</div>';
  }

  function showError(container, msg, retryFn) {
    container.innerHTML =
      '<div class="error-state">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="' + 'var(--danger)' + '" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>' +
        '<p class="error-msg">' + escapeHtml(msg) + '</p>' +
        '<button class="retry-btn">Retry</button>' +
      '</div>';
    var btn = container.querySelector('.retry-btn');
    if (btn && retryFn) {
      btn.addEventListener('click', retryFn);
    }
  }

  function showEmpty(container, msg) {
    container.innerHTML =
      '<div class="empty-state">' +
        '<svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>' +
        '<p class="empty-title">No Results</p>' +
        '<p class="empty-desc">' + escapeHtml(msg || 'Try adjusting your filters.') + '</p>' +
      '</div>';
  }

  function escapeHtml(str) {
    if (!str) return '';
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  /* --- Pagination Renderer --- */
  function renderPagination(container, page, totalPages, onPageChange) {
    container.innerHTML = '';
    if (totalPages <= 1) return;

    var prevBtn = document.createElement('button');
    prevBtn.className = 'page-btn';
    prevBtn.textContent = '\u2039';
    prevBtn.disabled = page <= 1;
    prevBtn.addEventListener('click', function () { onPageChange(page - 1); });
    container.appendChild(prevBtn);

    var startPage = Math.max(1, page - 2);
    var endPage = Math.min(totalPages, page + 2);
    if (startPage > 1) {
      container.appendChild(makePageBtn(1, page, onPageChange));
      if (startPage > 2) {
        var dots = document.createElement('span');
        dots.className = 'page-info';
        dots.textContent = '...';
        container.appendChild(dots);
      }
    }
    for (var i = startPage; i <= endPage; i++) {
      container.appendChild(makePageBtn(i, page, onPageChange));
    }
    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        var dots2 = document.createElement('span');
        dots2.className = 'page-info';
        dots2.textContent = '...';
        container.appendChild(dots2);
      }
      container.appendChild(makePageBtn(totalPages, page, onPageChange));
    }

    var nextBtn = document.createElement('button');
    nextBtn.className = 'page-btn';
    nextBtn.textContent = '\u203A';
    nextBtn.disabled = page >= totalPages;
    nextBtn.addEventListener('click', function () { onPageChange(page + 1); });
    container.appendChild(nextBtn);
  }

  function makePageBtn(num, current, onPageChange) {
    var btn = document.createElement('button');
    btn.className = 'page-btn' + (num === current ? ' active' : '');
    btn.textContent = num;
    btn.addEventListener('click', function () { onPageChange(num); });
    return btn;
  }

  /* --- Tab Routing --- */
  function switchTab(tabName) {
    if (state.activeTab === tabName) return;
    state.activeTab = tabName;

    $$('.tab-content').forEach(function (el) { el.classList.remove('active'); });
    $$('.tab-btn').forEach(function (el) { el.classList.remove('active'); });

    var content = $('#tab-' + tabName);
    var btn = document.querySelector('.tab-btn[data-tab="' + tabName + '"]');
    if (content) content.classList.add('active');
    if (btn) btn.classList.add('active');

    // Lazy load tab data on first activation
    if (!state.loadedTabs[tabName]) {
      state.loadedTabs[tabName] = true;
      initTabModule(tabName);
    }

    // Re-invalidate map size when switching back
    if (tabName === 'map' && window.MapModule && window.MapModule.invalidateSize) {
      window.MapModule.invalidateSize();
    }
  }

  function initTabModule(tabName) {
    switch (tabName) {
      case 'map':
        if (window.MapModule) window.MapModule.init();
        break;
      case 'search':
        if (window.SearchModule) window.SearchModule.init();
        break;
      case 'saved':
        if (window.SavedModule) window.SavedModule.init();
        break;
      case 'reports':
        if (window.ReportsModule) window.ReportsModule.init();
        break;
      case 'investors':
        if (window.InvestorsModule) window.InvestorsModule.init();
        break;
      case 'neighborhoods':
        if (window.NeighborhoodsModule) window.NeighborhoodsModule.init();
        break;
      case 'contractors':
        if (window.ContractorsModule) window.ContractorsModule.init();
        break;
      case 'lending':
        if (window.LendingModule) window.LendingModule.init();
        break;
      case 'pipeline':
        if (window.PipelineModule) window.PipelineModule.init();
        break;
      case 'sources':
        if (window.SourcesModule) window.SourcesModule.init();
        break;
    }
  }

  /* --- Stats Bar --- */
  async function loadStats() {
    try {
      var resp = await api('stats');
      var data = resp.data || resp;
      state.stats = data;
      renderStats(data);
    } catch (e) {
      console.warn('Stats load failed:', e);
      // Leave skeleton values
    }
  }

  function renderStats(data) {
    var map = {
      'stat-sales': data.sales || data.total_sales,
      'stat-investors': data.investors || data.total_investors,
      'stat-permits': data.permits || data.total_permits,
      'stat-blight': data.blight || data.total_blight,
      'stat-neighborhoods': data.neighborhoods || data.total_neighborhoods,
      'stat-pipeline': data.pipeline || data.total_pipeline
    };
    Object.keys(map).forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      var valEl = el.querySelector('.stat-value');
      if (valEl) {
        valEl.textContent = formatNumber(map[id]);
        valEl.classList.remove('skeleton');
      }
    });
  }

  /* --- Init --- */
  function init() {
    // Tab click handlers
    $$('.tab-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        switchTab(this.getAttribute('data-tab'));
      });
    });

    // Load stats
    loadStats();

    // Init map right away (it's the default tab)
    state.loadedTabs['map'] = true;
    if (window.MapModule) window.MapModule.init();

    // Init chat
    if (window.ChatModule) window.ChatModule.init();
  }

  document.addEventListener('DOMContentLoaded', init);

  /* --- Exports --- */
  window.App = {
    api: api,
    state: state,
    formatNumber: formatNumber,
    formatCurrency: formatCurrency,
    formatCurrencyFull: formatCurrencyFull,
    formatDate: formatDate,
    formatPercent: formatPercent,
    debounce: debounce,
    $: $,
    $$: $$,
    showLoading: showLoading,
    showError: showError,
    showEmpty: showEmpty,
    escapeHtml: escapeHtml,
    renderPagination: renderPagination,
    switchTab: switchTab
  };

})();
