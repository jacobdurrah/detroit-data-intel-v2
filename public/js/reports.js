/* ============================================================
   Detroit Data Intelligence Platform V2 - Reports Module
   ============================================================ */
(function () {
  'use strict';

  var PAGE_SIZE = 20;
  var currentPage = 1;
  var totalPages = 1;
  var initialized = false;
  var currentVerdict = '';
  var currentView = 'list';

  function init() {
    if (initialized) return;
    initialized = true;

    var pills = document.getElementById('reports-verdict-pills');
    if (pills) {
      pills.addEventListener('click', function (e) {
        var btn = e.target.closest('.pill-btn');
        if (!btn) return;
        pills.querySelectorAll('.pill-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentVerdict = btn.getAttribute('data-verdict') || '';
        currentPage = 1;
        loadReports();
      });
    }

    document.getElementById('reports-list').addEventListener('click', handleClick);
    loadReports();
  }

  function handleClick(e) {
    var btn = e.target.closest('.btn-back');
    if (btn) {
      e.stopPropagation();
      currentView = 'list';
      loadReports();
      return;
    }

    var card = e.target.closest('.prop-card[data-id]');
    if (card && currentView === 'list') {
      showReport(Number(card.getAttribute('data-id')));
    }
  }

  async function loadReports() {
    currentView = 'list';
    var listEl = document.getElementById('reports-list');
    var paginationEl = document.getElementById('reports-pagination');
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = '';

    App.showLoading(listEl);
    paginationEl.innerHTML = '';

    try {
      var params = { page: currentPage, limit: PAGE_SIZE };
      if (currentVerdict) params.verdict = currentVerdict;

      var data = await App.api('property-reports', params);
      var items = data.data || [];
      var meta = data.meta || {};
      var total = meta.total || items.length;
      totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (!items.length) {
        App.showEmpty(listEl, 'No reports generated yet.');
        return;
      }

      renderCards(listEl, items);

      App.renderPagination(paginationEl, currentPage, totalPages, function (page) {
        currentPage = page;
        loadReports();
      });
    } catch (err) {
      App.showError(listEl, 'Failed to load reports: ' + err.message, loadReports);
    }
  }

  function getVerdictClass(verdict) {
    if (verdict === 'BUY') return 'verdict-buy';
    if (verdict === 'WATCH') return 'verdict-watch';
    if (verdict === 'PASS') return 'verdict-pass';
    return '';
  }

  function renderCards(container, items) {
    var html = '';
    items.forEach(function (r) {
      var verdictClass = getVerdictClass(r.verdict);
      var score = Number(r.score) || 0;
      var scoreClass = score >= 75 ? 'score-high' : score >= 50 ? 'score-mid' : 'score-low';

      html += '<div class="prop-card card-clickable" data-id="' + r.id + '">';
      html += '<div class="prop-body">';
      html += '<div class="prop-header-row" style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<span class="prop-address" style="flex:1;">' + App.escapeHtml(r.address || '') + '</span>';
      if (r.verdict) {
        html += '<span class="verdict-badge ' + verdictClass + '">' + App.escapeHtml(r.verdict) + '</span>';
      }
      html += '</div>';

      html += '<div class="prop-specs">';
      html += App.formatDate(r.created_at);
      html += ' &middot; Due Diligence';
      if (score) html += ' &middot; Score: <span class="' + scoreClass + '" style="font-weight:bold;">' + score + '/100</span>';
      html += '</div>';

      if (r.summary) {
        html += '<div class="prop-notes-preview" style="margin-top:6px;color:var(--text-muted);font-size:13px;line-height:1.5;">' + App.escapeHtml(r.summary.substring(0, 200)) + (r.summary.length > 200 ? '...' : '') + '</div>';
      }

      html += '<div class="prop-footer-hint" style="margin-top:8px;font-size:12px;color:var(--accent);">Click for full report →</div>';
      html += '</div>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  async function showReport(id) {
    currentView = 'detail';
    var listEl = document.getElementById('reports-list');
    var paginationEl = document.getElementById('reports-pagination');
    paginationEl.innerHTML = '';

    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = 'none';

    App.showLoading(listEl);

    try {
      var data = await App.api('property-reports', { id: id });
      var report = data.data;
      if (!report) {
        App.showError(listEl, 'Report not found.', function () { currentView = 'list'; loadReports(); });
        return;
      }
      renderReport(listEl, report);
    } catch (err) {
      App.showError(listEl, 'Failed to load report: ' + err.message, function () { currentView = 'list'; loadReports(); });
    }
  }

  function renderReport(container, report) {
    var verdictClass = getVerdictClass(report.verdict);
    var rd = report.report_data || {};
    var score = Number(report.score) || 0;

    var html = '<div class="detail-view">';
    html += '<button class="btn-back">← Back to reports</button>';

    // Header
    html += '<div class="detail-header" style="margin:12px 0;">';
    html += '<h2 style="margin:0 0 8px;font-size:18px;">' + App.escapeHtml(report.address) + '</h2>';
    html += '<div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap;">';
    if (report.verdict) {
      html += '<span class="verdict-badge ' + verdictClass + '" style="font-size:16px;padding:6px 16px;">' + App.escapeHtml(report.verdict) + '</span>';
    }
    html += '<span style="font-size:20px;font-weight:bold;color:' + (score >= 75 ? '#10b981' : score >= 50 ? '#f59e0b' : '#ef4444') + ';">' + score + '/100</span>';
    html += '</div></div>';

    // Summary
    if (report.summary) {
      html += '<div class="detail-section"><h3>Executive Summary</h3>';
      html += '<p style="line-height:1.7;color:var(--text);">' + App.escapeHtml(report.summary) + '</p></div>';
    }

    // Score breakdown
    if (rd.score_breakdown && rd.score_breakdown.length) {
      html += '<div class="detail-section"><h3>Score Breakdown</h3><ul class="report-list">';
      rd.score_breakdown.forEach(function (item) {
        var color = item.startsWith('+') ? '#10b981' : item.startsWith('-') ? '#ef4444' : 'var(--text)';
        html += '<li style="color:' + color + ';margin-bottom:4px;">' + App.escapeHtml(item) + '</li>';
      });
      html += '</ul></div>';
    }

    // Overview table
    if (rd.overview) {
      html += '<div class="detail-section"><h3>Property Overview</h3>';
      html += renderKVTable(rd.overview);
      html += '</div>';
    }

    // Listing intel
    if (rd.listing_intel && rd.listing_intel.length) {
      html += '<div class="detail-section"><h3>Listing Intelligence</h3><ul class="report-list">';
      rd.listing_intel.forEach(function (item) {
        html += '<li style="margin-bottom:4px;">' + App.escapeHtml(item) + '</li>';
      });
      html += '</ul></div>';
    }

    // Valuation
    if (rd.valuation) {
      html += '<div class="detail-section"><h3>Valuation Analysis</h3>';
      html += renderKVTable(rd.valuation);
      html += '</div>';
    }

    // Sales history
    if (rd.sales_history && rd.sales_history.length) {
      html += '<div class="detail-section"><h3>Sales &amp; Foreclosure History</h3>';
      html += '<table class="report-table"><thead><tr><th>Date</th><th>Event</th><th>Amount</th></tr></thead><tbody>';
      rd.sales_history.forEach(function (h) {
        html += '<tr><td>' + App.escapeHtml(h.date || '') + '</td><td>' + App.escapeHtml(h.event || '') + '</td><td>' + App.escapeHtml(h.amount || '') + '</td></tr>';
      });
      html += '</tbody></table></div>';
    }

    // Comps
    if (rd.comps && rd.comps.length) {
      html += '<div class="detail-section"><h3>Comparable Sales</h3>';
      html += '<table class="report-table"><thead><tr><th>Address</th><th>Date</th><th>Price</th><th>$/SqFt</th></tr></thead><tbody>';
      rd.comps.forEach(function (c) {
        html += '<tr><td>' + App.escapeHtml(c.address || '') + '</td><td>' + App.escapeHtml(c.date || '') + '</td><td>' + App.escapeHtml(c.price || '') + '</td><td>' + App.escapeHtml(c.psf || '') + '</td></tr>';
      });
      html += '</tbody></table>';
      if (rd.comp_notes && rd.comp_notes.length) {
        html += '<ul class="report-list" style="margin-top:8px;">';
        rd.comp_notes.forEach(function (n) { html += '<li>' + App.escapeHtml(n) + '</li>'; });
        html += '</ul>';
      }
      html += '</div>';
    }

    // Neighborhood
    if (rd.neighborhood) {
      html += '<div class="detail-section"><h3>Neighborhood Analysis</h3>';
      html += renderKVTable(rd.neighborhood);
      html += '</div>';
    }

    // Seller/Agent
    if (rd.seller_agent && rd.seller_agent.length) {
      html += '<div class="detail-section"><h3>Seller &amp; Agent Profile</h3><ul class="report-list">';
      rd.seller_agent.forEach(function (item) { html += '<li>' + App.escapeHtml(item) + '</li>'; });
      html += '</ul></div>';
    }

    // Financials
    if (rd.financials) {
      html += '<div class="detail-section"><h3>Financial Model (BRRRR)</h3>';
      html += renderKVTable(rd.financials);
      html += '</div>';
    }

    // Risks
    if (rd.risks && rd.risks.length) {
      html += '<div class="detail-section"><h3>Risk Factors</h3><ul class="report-list">';
      rd.risks.forEach(function (r) { html += '<li style="color:#f59e0b;">⚠️ ' + App.escapeHtml(r) + '</li>'; });
      html += '</ul></div>';
    }

    // Recommendation
    if (rd.recommendations) {
      html += '<div class="detail-section"><h3>Recommendation</h3>';
      html += '<p style="line-height:1.7;color:var(--text);background:var(--surface);padding:12px;border-radius:8px;border-left:4px solid var(--accent);">' + App.escapeHtml(rd.recommendations) + '</p></div>';
    }

    html += '</div>';
    container.innerHTML = html;
    container.scrollTop = 0;
  }

  function renderKVTable(obj) {
    var html = '<div class="kv-grid">';
    Object.keys(obj).forEach(function (k) {
      html += '<div class="kv-item"><span class="kv-label">' + App.escapeHtml(k) + '</span><span class="kv-value">' + App.escapeHtml(String(obj[k])) + '</span></div>';
    });
    html += '</div>';
    return html;
  }

  window.ReportsModule = {
    init: init,
    refresh: loadReports
  };

})();
