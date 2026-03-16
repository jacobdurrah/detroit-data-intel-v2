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
      specEl.addEventListener('change', function () {
        currentPage = 1;
        loadContractors();
      });
    }

    if (sortEl) {
      sortEl.addEventListener('change', function () {
        currentPage = 1;
        loadContractors();
      });
    }
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
    } catch (e) {
      // Non-critical, ignore
    }
  }

  async function loadContractors() {
    var listEl = document.getElementById('contractors-list');
    var paginationEl = document.getElementById('contractors-pagination');

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
      if (typeof neighborhoods === 'string') {
        neighborhoods = neighborhoods.split(',').map(function (s) { return s.trim(); });
      }
      var neighborhoodDisplay = Array.isArray(neighborhoods) ? neighborhoods.slice(0, 3).join(', ') : '--';
      if (Array.isArray(neighborhoods) && neighborhoods.length > 3) {
        neighborhoodDisplay += ' +' + (neighborhoods.length - 3);
      }

      html +=
        '<div class="card">' +
          '<div class="card-header">' +
            '<span class="card-title">' + App.escapeHtml(c.name || c.contractor_name || 'Unknown') + '</span>' +
            (c.specialty ? '<span class="specialty-badge">' + App.escapeHtml(c.specialty) + '</span>' : '') +
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
        '</div>';
    });
    container.innerHTML = html;
  }

  function refresh() {
    currentPage = 1;
    loadContractors();
  }

  /* --- Exports --- */
  window.ContractorsModule = {
    init: init,
    refresh: refresh
  };

})();
