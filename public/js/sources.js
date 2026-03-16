/* Sources page — data provenance and methodology */
(function() {
  'use strict';
  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    loadSources();
  }

  async function loadSources() {
    var container = document.getElementById('sources-content');
    if (!container) return;
    App.showLoading(container);

    try {
      var data = await App.api('sources');
      renderSources(container, data);
    } catch(e) {
      App.showError(container, 'Failed to load sources: ' + e.message, loadSources);
    }
  }

  function renderSources(container, data) {
    var html = '<div class="sources-header">';
    html += '<h2>📊 Data Sources & Methodology</h2>';
    html += '<p class="sources-subtitle">Transparency into where every data point comes from, how entities are resolved, and known limitations.</p>';
    html += '</div>';

    // Data freshness warnings
    if (data.data_freshness) {
      html += '<div class="sources-freshness">';
      html += '<h3>⚠️ Data Freshness</h3>';
      html += '<p>' + App.escapeHtml(data.data_freshness.note) + '</p>';
      if (data.data_freshness.known_issues && data.data_freshness.known_issues.length) {
        html += '<h4>Known Issues:</h4><ul class="issues-list">';
        data.data_freshness.known_issues.forEach(function(issue) {
          html += '<li>⚠️ ' + App.escapeHtml(issue) + '</li>';
        });
        html += '</ul>';
      }
      html += '</div>';
    }

    // Tab-by-tab breakdown
    (data.tabs || []).forEach(function(tab) {
      html += '<div class="sources-tab-section">';
      html += '<h3 class="sources-tab-title">' + App.escapeHtml(tab.tab) + '</h3>';
      html += '<p class="sources-tab-desc">' + App.escapeHtml(tab.description) + '</p>';

      (tab.datasets || []).forEach(function(ds) {
        html += '<div class="source-card">';
        html += '<div class="source-card-header">';
        html += '<span class="source-name">' + App.escapeHtml(ds.name) + '</span>';
        if (ds.records) html += '<span class="source-badge">' + App.formatNumber(ds.records) + ' records</span>';
        if (ds.size_mb) html += '<span class="source-badge source-badge-size">' + ds.size_mb + ' MB</span>';
        html += '</div>';

        html += '<div class="source-details">';
        
        if (ds.source) html += '<div class="source-row"><span class="source-label">Source:</span><span class="source-value">' + App.escapeHtml(ds.source) + '</span></div>';
        
        if (ds.url) html += '<div class="source-row"><span class="source-label">URL:</span><a href="' + App.escapeHtml(ds.url) + '" target="_blank" class="source-link">' + App.escapeHtml(ds.url) + '</a></div>';
        
        if (ds.api) html += '<div class="source-row"><span class="source-label">API:</span><code class="source-code">' + App.escapeHtml(ds.api) + '</code></div>';
        
        if (ds.fields) html += '<div class="source-row"><span class="source-label">Fields:</span><span class="source-value">' + App.escapeHtml(ds.fields) + '</span></div>';
        
        if (ds.method) html += '<div class="source-row"><span class="source-label">Method:</span><span class="source-value">' + App.escapeHtml(ds.method) + '</span></div>';
        
        if (ds.years_fetched) html += '<div class="source-row"><span class="source-label">Years:</span><span class="source-value">' + App.escapeHtml(ds.years_fetched) + '</span></div>';
        
        if (ds.years_missing) html += '<div class="source-row"><span class="source-label">Missing:</span><span class="source-value source-warning">' + App.escapeHtml(ds.years_missing) + '</span></div>';

        // Entity resolution steps
        if (ds.entity_resolution && ds.entity_resolution.length) {
          html += '<div class="source-section"><span class="source-label">Entity Resolution:</span>';
          html += '<ol class="source-steps">';
          ds.entity_resolution.forEach(function(step) {
            html += '<li>' + App.escapeHtml(step) + '</li>';
          });
          html += '</ol></div>';
        }

        // Scoring methodology
        if (ds.scoring && ds.scoring.length) {
          html += '<div class="source-section"><span class="source-label">Scoring:</span>';
          html += '<ul class="source-scoring">';
          ds.scoring.forEach(function(s) {
            html += '<li>' + App.escapeHtml(s) + '</li>';
          });
          html += '</ul></div>';
        }

        if (ds.tiers) html += '<div class="source-row"><span class="source-label">Tiers:</span><span class="source-value">' + App.escapeHtml(ds.tiers) + '</span></div>';

        if (ds.notes) html += '<div class="source-row source-notes"><span class="source-label">Notes:</span><span class="source-value">' + App.escapeHtml(ds.notes) + '</span></div>';

        if (ds.modified) html += '<div class="source-row"><span class="source-label">Last Updated:</span><span class="source-value">' + new Date(ds.modified).toLocaleDateString() + '</span></div>';

        html += '</div></div>';
      });

      html += '</div>';
    });

    container.innerHTML = html;
  }

  function refresh() { loadSources(); }

  window.SourcesModule = { init: init, refresh: refresh };
})();
