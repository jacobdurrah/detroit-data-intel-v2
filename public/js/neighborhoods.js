/* ============================================================
   Detroit Data Intelligence Platform V2 - Neighborhoods Module
   ============================================================ */
(function () {
  'use strict';

  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;

    bindEvents();
    loadNeighborhoods();
  }

  function bindEvents() {
    var sortEl = document.getElementById('neighborhood-sort');
    if (sortEl) {
      sortEl.addEventListener('change', function () {
        loadNeighborhoods();
      });
    }

    // Event delegation for card clicks
    document.getElementById('neighborhoods-list').addEventListener('click', function (e) {
      var card = e.target.closest('.card[data-neighborhood]');
      if (card) {
        var name = card.getAttribute('data-neighborhood');
        var lat = card.getAttribute('data-lat');
        var lng = card.getAttribute('data-lng');
        showNeighborhoodOnMap(name, lat, lng);
      }
    });
  }

  async function loadNeighborhoods() {
    var listEl = document.getElementById('neighborhoods-list');
    var sortVal = (document.getElementById('neighborhood-sort') || {}).value || 'score';

    App.showLoading(listEl);

    try {
      var data = await App.api('neighborhoods', { sort: sortVal });
      var neighborhoods = data.data || data.neighborhoods || data || [];

      if (!neighborhoods.length) {
        App.showEmpty(listEl, 'No neighborhood data available.');
        return;
      }

      renderCards(listEl, neighborhoods);

    } catch (e) {
      App.showError(listEl, 'Failed to load neighborhoods: ' + e.message, loadNeighborhoods);
    }
  }

  function renderCards(container, neighborhoods) {
    var html = '';
    neighborhoods.forEach(function (n) {
      var score = Number(n.score) || 0;
      var scoreClass = score >= 70 ? 'score-high' : score >= 40 ? 'score-mid' : 'score-low';
      var lat = n.lat || n.latitude || '';
      var lng = n.lng || n.lon || n.longitude || '';

      html +=
        '<div class="card" data-neighborhood="' + App.escapeHtml(n.name || n.neighborhood || '') + '" data-lat="' + lat + '" data-lng="' + lng + '">' +
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
          '<div class="card-metrics">' +
            '<div class="card-metric"><span class="metric-label">Sales</span><span class="metric-value">' + App.formatNumber(n.sales || n.total_sales) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Med. Price</span><span class="metric-value">' + App.formatCurrency(n.median_price) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Permits</span><span class="metric-value">' + App.formatNumber(n.permits || n.total_permits) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Blight</span><span class="metric-value">' + App.formatNumber(n.blight || n.blight_count) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Rentals</span><span class="metric-value">' + App.formatNumber(n.rentals || n.rental_count) + '</span></div>' +
            '<div class="card-metric"><span class="metric-label">Demos</span><span class="metric-value">' + App.formatNumber(n.demos || n.demo_count) + '</span></div>' +
          '</div>' +
        '</div>';
    });
    container.innerHTML = html;
  }

  function showNeighborhoodOnMap(name, lat, lng) {
    if (window.MapModule && lat && lng) {
      App.switchTab('map');
      setTimeout(function () {
        if (window.MapModule.invalidateSize) window.MapModule.invalidateSize();
      }, 100);
    }
  }

  function refresh() {
    loadNeighborhoods();
  }

  /* --- Exports --- */
  window.NeighborhoodsModule = {
    init: init,
    refresh: refresh
  };

})();
