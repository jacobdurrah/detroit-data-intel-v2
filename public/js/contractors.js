/* ============================================================
   Detroit Data Intelligence Platform V2 - Contractors Module
   ============================================================ */
(function () {
  'use strict';

  var PAGE_SIZE = 20;
  var currentPage = 1;
  var totalPages = 1;
  var initialized = false;
  var specialtiesLoaded = false;
  var currentView = 'list';

  var TRADE_FIELDS = {
    id: 'Record ID', addr: 'Address', type: 'Permit Type', desc: 'Work Description',
    dt: 'Issued Date', own: 'Owner Name', biz: 'Business Name', con: 'Contact Name',
    caddr: 'Contractor Address', kaddr: 'Contact Address', nb: 'Neighborhood',
    lat: 'Latitude', lng: 'Longitude'
  };

  function init() {
    if (initialized) return;
    initialized = true;
    bindEvents();
    loadContractors();
    loadSpecialties();
  }

  function bindEvents() {
    var searchEl = document.getElementById('contractor-search');
    var specEl = document.getElementById('contractor-specialty');
    var sortEl = document.getElementById('contractor-sort');

    if (searchEl) {
      searchEl.addEventListener('input', App.debounce(function () {
        currentPage = 1;
        loadContractors();
      }, 300));
    }
    if (specEl) {
      specEl.addEventListener('change', function () { currentPage = 1; loadContractors(); });
    }
    if (sortEl) {
      sortEl.addEventListener('change', function () { currentPage = 1; loadContractors(); });
    }

    // Card click delegation
    document.getElementById('contractors-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-contractor]');
      if (card) {
        showContractorDetail(card.getAttribute('data-contractor'));
      }
    });
  }

  function getFilters() {
    return {
      search: (document.getElementById('contractor-search') || {}).value || '',
      specialty: (document.getElementById('contractor-specialty') || {}).value || '',
      sort: (document.getElementById('contractor-sort') || {}).value || 'total_permits',
      page: currentPage,
      limit: PAGE_SIZE
    };
  }

  async function loadSpecialties() {
    if (specialtiesLoaded) return;
    try {
      var data = await App.api('contractor-specialties');
      var specialties = data.specialties || data || [];
      var sel = document.getElementById('contractor-specialty');
      if (!sel) return;
      specialties.forEach(function (s) {
        var name = typeof s === 'string' ? s : (s.name || s.specialty || '');
        if (!name) return;
        var opt = document.createElement('option');
        opt.value = name;
        opt.textContent = name;
        sel.appendChild(opt);
      });
      specialtiesLoaded = true;
    } catch (e) { /* Non-critical */ }
  }

  async function loadContractors() {
    currentView = 'list';
    var listEl = document.getElementById('contractors-list');
    var paginationEl = document.getElementById('contractors-pagination');
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = '';

    App.showLoading(listEl);
    paginationEl.innerHTML = '';

    try {
      var filters = getFilters();
      var data = await App.api('contractors', filters);
      var contractors = data.data || data.contractors || data || [];
      var total = data.total || data.count || contractors.length;
      totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (!contractors.length) {
        App.showEmpty(listEl, 'No contractors match your filters.');
        return;
      }

      renderCards(listEl, contractors);

      App.renderPagination(paginationEl, currentPage, totalPages, function (page) {
        currentPage = page;
        loadContractors();
      });
    } catch (e) {
      App.showError(listEl, 'Failed to load contractors: ' + e.message, loadContractors);
    }
  }

  function renderCards(container, contractors) {
    var html = '';
    contractors.forEach(function (c) {
      var neighborhoods = c.neighborhoods || c.neighborhoods_served || [];
      if (typeof neighborhoods === 'number') {
        neighborhoods = [];
      } else if (typeof neighborhoods === 'string') {
        neighborhoods = neighborhoods.split(',').map(function (s) { return s.trim(); });
      }
      var neighborhoodDisplay = Array.isArray(neighborhoods) && neighborhoods.length > 0
        ? neighborhoods.slice(0, 3).join(', ') + (neighborhoods.length > 3 ? ' +' + (neighborhoods.length - 3) : '')
        : (typeof c.neighborhoods_served === 'number' ? c.neighborhoods_served + ' areas' : '--');

      html +=
        '<div class="card card-clickable" data-contractor="' + App.escapeHtml(c.name || c.contractor_name || '') + '">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(c.name || c.contractor_name || 'Unknown') + '</span>' +
            (c.specialty || c.top_specialty ? '<span class="specialty-badge">' + App.escapeHtml(c.specialty || c.top_specialty) + '</span>' : '') +
          '</div>' +
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Permits</span><span class="metric-value">' + App.formatNumber(c.total_permits || c.permit_count) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Contact</span><span class="metric-value truncate">' + App.escapeHtml(c.contact_name || c.contact || '--') + '</span></div>' +
            '<div class="card-metric" style="grid-column:1/-1;"><span class="metric-label">Address</span><span class="metric-value truncate">' + App.escapeHtml(c.contact_address || c.address || '--') + '</span></div>' +
          '</div>' +
          (neighborhoodDisplay !== '--' ?
            '<div class="card-tags">' +
              '<span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;margin-right:4px;">Areas:</span>' +
              '<span style="font-size:12px;color:var(--text);">' + App.escapeHtml(neighborhoodDisplay) + '</span>' +
            '</div>' : '') +
          '<div class="card-footer">Click to see all permits \u2192</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  async function showContractorDetail(name) {
    if (!name) return;
    currentView = 'detail';

    var listEl = document.getElementById('contractors-list');
    var paginationEl = document.getElementById('contractors-pagination');
    paginationEl.innerHTML = '';

    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = 'none';

    App.showLoading(listEl);

    try {
      var data = await App.api('contractor/' + encodeURIComponent(name), { limit: 50 });
      if (!data.data) throw new Error('No data returned');
      renderContractorDetail(listEl, data.data, data.meta, name);
    } catch (e) {
      App.showError(listEl, 'Failed to load contractor: ' + e.message, function () { showContractorDetail(name); });
    }
  }

  function renderContractorDetail(container, detail, meta, contractorName) {
    var p = detail.profile;
    var trades = detail.trades || [];
    var hoods = detail.neighborhoods || [];
    var linkedPermits = detail.linked_permits || [];

    var html = '<div class="detail-view">';
    html += '<button class="btn-back" onclick="ContractorsModule.backToList()">\u2190 Back to contractors</button>';

    // Header
    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(p.name || 'Unknown') + '</h2>';
    html += '<div class="card-metrics">';
    html += '<div class="card-metric"><span class="metric-label">Total Permits</span><span class="metric-value">' + App.formatNumber(p.total_permits) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Areas Served</span><span class="metric-value">' + App.formatNumber(p.neighborhoods_served) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Properties</span><span class="metric-value">' + App.formatNumber(p.unique_properties) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Owners Served</span><span class="metric-value">' + App.formatNumber(p.unique_owners) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">First Permit</span><span class="metric-value">' + App.formatDate(p.first_permit) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Last Permit</span><span class="metric-value">' + App.formatDate(p.last_permit) + '</span></div>';
    html += '</div>';

    // Permit type tags
    if (p.permit_types) {
      html += '<div class="card-tags" style="margin-top:8px;">';
      Object.keys(p.permit_types).forEach(function (t) {
        html += '<span class="reason-tag">' + App.escapeHtml(t) + ' (' + p.permit_types[t] + ')</span>';
      });
      html += '</div>';
    }
    if (p.contact_address) {
      html += '<div style="margin-top:8px;font-size:12px;color:var(--text-muted);">Address: ' + App.escapeHtml(p.contact_address) + '</div>';
    }
    html += '</div>';

    // Neighborhoods breakdown
    if (hoods.length > 0) {
      html += '<h3>Top Neighborhoods (' + hoods.length + ')</h3>';
      html += '<div class="detail-hoods">';
      hoods.slice(0, 15).forEach(function (h) {
        html += '<div class="hood-row">';
        html += '<span class="hood-name">' + App.escapeHtml(h.name) + '</span>';
        html += '<span class="hood-count">' + h.count + ' permits</span>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Filter pills
    var encName = encodeURIComponent(contractorName);
    html += '<div class="loan-filters">';
    html += '<h3>Trade Permits (' + (meta ? meta.total : trades.length) + ' total)</h3>';
    html += '<div class="filter-pills">';
    html += '<button class="pill active" onclick="ContractorsModule.filterTrades(\'' + encName + '\', \'\')">All</button>';
    if (p.permit_types) {
      Object.keys(p.permit_types).forEach(function (t) {
        html += '<button class="pill" onclick="ContractorsModule.filterTrades(\'' + encName + '\', \'' + encodeURIComponent(t) + '\')">' + App.escapeHtml(t) + '</button>';
      });
    }
    html += '</div></div>';

    // Trade records
    html += '<div id="contractor-trades-container">';
    html += renderTradeCards(trades);
    html += '</div>';

    // Linked building permits
    if (linkedPermits.length > 0) {
      html += '<h3 style="margin-top:16px;">Linked Building Permits (' + linkedPermits.length + ')</h3>';
      html += '<div class="detail-records">';
      linkedPermits.forEach(function (p) {
        html += '<div class="card detail-record">';
        html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(p.addr || '') + '</span>';
        html += '<span class="specialty-badge">' + App.escapeHtml(p.type || '') + '</span></div>';
        html += '<div class="kv-grid">';
        html += '<div class="kv-item"><span class="kv-label">Permit ID</span><span class="kv-value">' + App.escapeHtml(p.id || '') + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Issued</span><span class="kv-value">' + App.formatDate(p.dt) + '</span></div>';
        html += '<div class="kv-item"><span class="kv-label">Description</span><span class="kv-value">' + App.escapeHtml((p.desc || '').substring(0, 100)) + '</span></div>';
        html += '</div></div>';
      });
      html += '</div>';
    }

    // Pagination
    if (meta && meta.pages > 1) {
      html += '<div id="contractor-detail-pagination" class="pagination"></div>';
    }

    html += '</div>';
    container.innerHTML = html;

    if (meta && meta.pages > 1) {
      App.renderPagination(
        document.getElementById('contractor-detail-pagination'),
        meta.page, meta.pages,
        function (page) { loadContractorPage(contractorName, page); }
      );
    }
  }

  function renderTradeCards(trades) {
    if (!trades.length) return '<p class="empty-state">No trades match this filter.</p>';

    var html = '';
    trades.forEach(function (t) {
      html += '<div class="card detail-record">';
      html += '<div class="card-header"><span class="card-title">' + App.escapeHtml(t.addr || 'Unknown') + '</span>';
      html += '<span class="specialty-badge">' + App.escapeHtml(t.type || '') + '</span></div>';
      html += '<div class="kv-grid">';

      Object.keys(TRADE_FIELDS).forEach(function (key) {
        if (t[key] == null || t[key] === '') return;
        var val = t[key];
        if (key === 'dt') val = App.formatDate(val);
        else val = App.escapeHtml(String(val));
        html += '<div class="kv-item"><span class="kv-label">' + TRADE_FIELDS[key] + '</span><span class="kv-value">' + val + '</span></div>';
      });

      html += '</div></div>';
    });
    return html;
  }

  async function loadContractorPage(name, page) {
    var container = document.getElementById('contractor-trades-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    try {
      var data = await App.api('contractor/' + encodeURIComponent(name), { page: page, limit: 50 });
      container.innerHTML = renderTradeCards(data.data.trades || []);
      var pagEl = document.getElementById('contractor-detail-pagination');
      if (pagEl && data.meta) {
        App.renderPagination(pagEl, data.meta.page, data.meta.pages, function (p) { loadContractorPage(name, p); });
      }
    } catch (e) {
      container.innerHTML = '<p class="error">Failed to load: ' + e.message + '</p>';
    }
  }

  function filterTrades(encodedName, encodedPermitType) {
    var name = decodeURIComponent(encodedName);
    var permitType = encodedPermitType ? decodeURIComponent(encodedPermitType) : '';
    document.querySelectorAll('.filter-pills .pill').forEach(function (p) { p.classList.remove('active'); });
    if (event && event.target) event.target.classList.add('active');

    var container = document.getElementById('contractor-trades-container');
    if (!container) return;
    container.innerHTML = '<div class="spinner"></div>';

    var params = { page: 1, limit: 50 };
    if (permitType) params.permit_type = permitType;

    App.api('contractor/' + encodeURIComponent(name), params).then(function (data) {
      container.innerHTML = renderTradeCards(data.data.trades || []);
      var pagEl = document.getElementById('contractor-detail-pagination');
      if (pagEl && data.meta) {
        App.renderPagination(pagEl, data.meta.page, data.meta.pages, function (p) { loadContractorPage(name, p); });
      }
    }).catch(function (e) {
      container.innerHTML = '<p class="error">Failed to filter: ' + e.message + '</p>';
    });
  }

  function backToList() {
    currentView = 'list';
    currentPage = 1;
    loadContractors();
  }

  function refresh() {
    if (currentView === 'list') loadContractors();
  }

  window.ContractorsModule = {
    init: init,
    refresh: refresh,
    showContractorDetail: showContractorDetail,
    filterTrades: filterTrades,
    backToList: backToList
  };

})();
