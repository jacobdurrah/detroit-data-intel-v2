/* Search / Intelligence Report Tab */
(function () {
  'use strict';
  
  var currentReport = null;
  var currentProperties = [];

  window.Search = { init: init };
  window.SearchModule = { init: init };

  function init() {
    var d = new Date();
    var dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    document.getElementById('search-date').value = dateStr;
    document.getElementById('search-date').addEventListener('change', loadReport);
    document.getElementById('search-list').addEventListener('click', handleClick);
    loadReport();
  }

  async function loadReport() {
    var dateEl = document.getElementById('search-date');
    var date = dateEl.value;
    var listEl = document.getElementById('search-list');
    var statsEl = document.getElementById('search-stats');
    
    listEl.innerHTML = '<div class="loading-state"><div class="skeleton-card"></div></div>';
    
    try {
      // Try to load the daily report first
      var res = await fetch('/api/property-reports?date=' + date);
      var json = await res.json();
      
      if (json.data && json.data.report_data) {
        currentReport = json.data.report_data;
        currentProperties = currentReport.properties || [];
        
        // Get feedback for these properties
        var searchRes = await fetch('/api/property-searches?date=' + date + '&limit=100');
        var searchJson = await searchRes.json();
        var feedbackMap = {};
        (searchJson.data || []).forEach(function(s) {
          feedbackMap[s.address] = { id: s.id, feedback: s.feedback || [] };
        });
        
        currentProperties.forEach(function(p) {
          var match = feedbackMap[p.address];
          if (match) {
            p._search_id = match.id;
            p._feedback = match.feedback;
          }
        });
        
        renderReport(listEl, statsEl);
      } else {
        // Fallback: load from property_searches (old format)
        var fallbackRes = await fetch('/api/property-searches?date=' + date + '&limit=50');
        var fallbackJson = await fallbackRes.json();
        if (fallbackJson.data && fallbackJson.data.length > 0) {
          currentReport = null;
          currentProperties = fallbackJson.data;
          renderLegacyList(listEl, statsEl, fallbackJson);
        } else {
          listEl.innerHTML = '<div class="empty-state">No report for ' + date + '. Reports generate daily at 7:30 AM ET.</div>';
          statsEl.textContent = '';
        }
      }
    } catch (err) {
      listEl.innerHTML = '<div class="error-state">Failed to load: ' + err.message + '</div>';
    }
  }

  function renderReport(container, statsEl) {
    var r = currentReport;
    var props = currentProperties;
    
    // Stats
    var graded = props.filter(function(p) { return p.score >= 60; }).length;
    statsEl.innerHTML = '<span class="report-stat">' + (r.funnel ? r.funnel.wide_net : '?') + ' scanned</span> → ' +
      (r.funnel && r.funnel.new_only !== undefined ? '<span class="report-stat">' + r.funnel.new_only + ' new</span> → ' : '') +
      '<span class="report-stat">' + (r.funnel ? r.funnel.target_neighborhoods : '?') + ' target areas</span> → ' +
      '<span class="report-stat">' + (r.funnel ? r.funnel.price_range : '?') + ' in range</span> → ' +
      '<span class="report-stat report-stat-highlight">' + props.length + ' graded</span>';
    
    var html = '';
    
    // Strategy summary
    html += '<div class="report-section">';
    html += '<h2 class="report-heading">📋 Strategy: ' + (r.strategy ? r.strategy.name : 'Dusty Turnkey') + '</h2>';
    html += '<div class="strategy-grid">';
    if (r.strategy) {
      html += strategyRow('Purchase Range', '$' + r.strategy.purchase_range[0].toLocaleString() + ' – $' + r.strategy.purchase_range[1].toLocaleString());
      html += strategyRow('Property Types', r.strategy.property_types.join(', '));
      html += strategyRow('Ideal Layout', r.strategy.ideal_layout);
      html += strategyRow('ARV Target', r.strategy.arv_target);
      html += strategyRow('Total Cash In', r.strategy.total_cash_in);
      html += strategyRow('Refi Timeline', r.strategy.refi_timeline);
      html += strategyRow('Required', r.strategy.required);
    }
    html += '</div></div>';
    
    // Market intel
    if (r.market_intel && r.market_intel.length > 0) {
      html += '<div class="report-section">';
      html += '<h2 class="report-heading">📊 Market Intelligence</h2>';
      html += '<div class="market-grid">';
      var tier1 = r.market_intel.filter(function(m) { return m.tier === 1; });
      var tier2 = r.market_intel.filter(function(m) { return m.tier === 2; });
      
      if (tier1.length) {
        html += '<div class="market-tier"><h3>Tier 1 — Priority</h3>';
        tier1.sort(function(a,b) { return b.median - a.median; });
        tier1.forEach(function(m) {
          html += '<div class="market-row"><span class="market-name">' + App.escapeHtml(m.name) + '</span><span class="market-median">$' + m.median.toLocaleString() + '</span></div>';
        });
        html += '</div>';
      }
      if (tier2.length) {
        html += '<div class="market-tier"><h3>Tier 2 — Watch</h3>';
        tier2.sort(function(a,b) { return b.median - a.median; });
        tier2.forEach(function(m) {
          html += '<div class="market-row"><span class="market-name">' + App.escapeHtml(m.name) + '</span><span class="market-median">$' + m.median.toLocaleString() + '</span></div>';
        });
        html += '</div>';
      }
      html += '</div></div>';
    }
    
    // Funnel
    if (r.funnel) {
      html += '<div class="report-section">';
      html += '<h2 class="report-heading">🔍 Funnel</h2>';
      html += '<div class="funnel-bar">';
      html += funnelStep('Scanned', r.funnel.wide_net, 'funnel-step-1');
      html += '<span class="funnel-arrow">→</span>';
      if (r.funnel.new_only !== undefined) {
        html += funnelStep('New', r.funnel.new_only, 'funnel-step-2');
        html += '<span class="funnel-arrow">→</span>';
      }
      html += funnelStep('Target Areas', r.funnel.target_neighborhoods, 'funnel-step-2');
      html += '<span class="funnel-arrow">→</span>';
      html += funnelStep('In Range', r.funnel.price_range, 'funnel-step-3');
      html += '<span class="funnel-arrow">→</span>';
      html += funnelStep('Graded', props.length, 'funnel-step-4');
      html += '</div></div>';
    }
    
    // Feedback summary
    if (r.feedback_summary && r.feedback_summary.total_feedback > 0) {
      html += '<div class="report-section">';
      html += '<h2 class="report-heading">🧠 Learned from ' + r.feedback_summary.total_feedback + ' reviews</h2>';
      html += '<div class="feedback-summary">';
      if (r.feedback_summary.likes.length) {
        html += '<div class="fb-likes"><strong>Likes:</strong> ' + r.feedback_summary.likes.map(function(l) { return App.escapeHtml(l); }).join(' • ') + '</div>';
      }
      if (r.feedback_summary.dislikes.length) {
        html += '<div class="fb-dislikes"><strong>Avoids:</strong> ' + r.feedback_summary.dislikes.map(function(d) { return App.escapeHtml(d); }).join(' • ') + '</div>';
      }
      html += '</div></div>';
    }
    
    // Properties
    html += '<div class="report-section">';
    html += '<h2 class="report-heading">🏠 Top Picks (' + props.length + ')</h2>';
    
    props.forEach(function(p, idx) {
      html += renderPropertyCard(p, idx);
    });
    
    html += '</div>';
    
    container.innerHTML = html;
  }
  
  function renderPropertyCard(p, idx) {
    var gradeClass = p.grade.startsWith('A') ? 'grade-a' : p.grade.startsWith('B') ? 'grade-b' : 'grade-c';
    var feedbackBorder = '';
    if (p._feedback && p._feedback.length > 0) {
      var hasUp = p._feedback.some(function(f) { return f.feedback === 'up'; });
      var hasDown = p._feedback.some(function(f) { return f.feedback === 'down'; });
      if (hasUp && hasDown) feedbackBorder = ' intel-card-mixed';
      else if (hasUp) feedbackBorder = ' intel-card-up';
      else if (hasDown) feedbackBorder = ' intel-card-down';
    }
    
    var html = '<div class="intel-card' + feedbackBorder + '" data-id="' + (p._search_id || '') + '">';
    
    // Header
    html += '<div class="intel-header">';
    html += '<div class="intel-header-left">';
    html += '<span class="intel-grade ' + gradeClass + '">' + p.grade + '</span>';
    html += '<span class="intel-score">' + p.score + '/100</span>';
    html += '</div>';
    html += '<div class="intel-header-right">';
    html += '<span class="intel-tier">Tier ' + (p.tier || '?') + '</span>';
    if (p.dom) html += '<span class="intel-dom">' + p.dom + ' DOM</span>';
    html += '</div>';
    html += '</div>';
    
    // Address + price
    html += '<h3 class="intel-address">' + App.escapeHtml(p.address) + '</h3>';
    html += '<div class="intel-price-row">';
    html += '<span class="intel-price">' + App.formatCurrency(p.list_price) + '</span>';
    if (p.price_per_sqft) html += '<span class="intel-ppsf">$' + p.price_per_sqft + '/sqft</span>';
    if (p.neighborhood) html += '<span class="intel-neighborhood">' + App.escapeHtml(p.neighborhood) + '</span>';
    html += '</div>';
    
    // Specs
    var specs = [];
    if (p.beds) specs.push(p.beds + ' bd');
    if (p.baths) specs.push(p.baths + ' ba');
    if (p.sqft) specs.push(App.formatNumber(p.sqft) + ' sqft');
    if (p.year_built) specs.push('Built ' + p.year_built);
    if (p.lot_size) specs.push('Lot ' + App.formatNumber(p.lot_size) + ' sqft');
    html += '<div class="intel-specs">' + specs.join(' · ') + '</div>';
    
    // Mechanicals checklist
    if (p.mechanicals) {
      html += '<div class="intel-mechanicals">';
      html += '<h4>Mechanicals</h4>';
      html += mechCheck('Furnace/HVAC', p.mechanicals.furnace);
      html += mechCheck('Roof', p.mechanicals.roof);
      html += mechCheck('Electrical', p.mechanicals.electrical);
      html += mechCheck('Plumbing', p.mechanicals.plumbing);
      html += mechCheck('Water Heater', p.mechanicals.water_heater);
      html += '</div>';
    }
    
    // Positives / Concerns
    if (p.positives && p.positives.length) {
      html += '<div class="intel-positives">';
      p.positives.forEach(function(pos) {
        html += '<div class="intel-pos-item">' + App.escapeHtml(pos) + '</div>';
      });
      html += '</div>';
    }
    if (p.concerns && p.concerns.length) {
      html += '<div class="intel-concerns">';
      p.concerns.forEach(function(c) {
        html += '<div class="intel-concern-item">' + App.escapeHtml(c) + '</div>';
      });
      html += '</div>';
    }
    
    // Deal math
    if (p.deal_math && p.deal_math.purchase) {
      html += '<div class="intel-deal-math">';
      html += '<h4>Deal Math</h4>';
      html += '<div class="deal-grid">';
      html += dealRow('Purchase', '$' + p.deal_math.purchase.toLocaleString());
      html += dealRow('Down (20%)', '$' + p.deal_math.down_payment.toLocaleString());
      html += dealRow('Polish Budget', '$' + p.deal_math.polish_budget.toLocaleString());
      html += dealRow('Total Cash In', '$' + p.deal_math.total_cash_in.toLocaleString());
      if (p.deal_math.estimated_arv) {
        html += dealRow('Est. ARV', '$' + p.deal_math.estimated_arv.toLocaleString(), 'deal-highlight');
        html += dealRow('Equity at ARV', '$' + (p.deal_math.equity_at_arv || 0).toLocaleString(), p.deal_math.equity_at_arv > 30000 ? 'deal-good' : '');
        html += dealRow('Refi Cashout', '$' + (p.deal_math.refi_cashout || 0).toLocaleString(), p.deal_math.refi_cashout > 30000 ? 'deal-good' : p.deal_math.refi_cashout > 0 ? '' : 'deal-bad');
      }
      if (p.deal_math.est_monthly_rent) {
        html += dealRow('Est. Rent', '$' + p.deal_math.est_monthly_rent.toLocaleString() + '/mo');
      }
      html += '</div></div>';
    }
    
    // Permits
    if (p.permits && p.permits.length) {
      html += '<div class="intel-permits">';
      html += '<h4>📋 Permits on File</h4>';
      p.permits.forEach(function(pm) {
        html += '<div class="permit-item">' + App.escapeHtml(pm.type + ' — ' + pm.desc) + ' (' + pm.status + ')</div>';
      });
      html += '</div>';
    }
    
    // Feedback display
    if (p._feedback && p._feedback.length > 0) {
      html += '<div class="intel-feedback">';
      p._feedback.forEach(function(f) {
        var icon = f.feedback === 'up' ? '👍' : '👎';
        html += '<div class="intel-fb-item">' + icon + ' <strong>' + App.escapeHtml(f.user_name) + '</strong>';
        if (f.reason) html += ': ' + App.escapeHtml(f.reason);
        html += '</div>';
      });
      html += '</div>';
    }
    
    // Score breakdown
    if (p.score_breakdown && Object.keys(p.score_breakdown).length > 0) {
      html += '<details class="intel-score-details"><summary>Score breakdown</summary><div class="score-bd-grid">';
      Object.entries(p.score_breakdown).forEach(function(e) {
        var label = e[0].replace(/_/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
        html += '<div class="score-bd-row"><span>' + label + '</span><span class="score-bd-val ' + (e[1] >= 0 ? 'score-bd-pos' : 'score-bd-neg') + '">' + (e[1] > 0 ? '+' : '') + e[1] + '</span></div>';
      });
      html += '</div></details>';
    }
    
    // Actions
    html += '<div class="intel-actions">';
    html += '<button class="btn-intel-vote btn-intel-up" data-id="' + (p._search_id || '') + '" data-type="up">👍 Interested</button>';
    html += '<button class="btn-intel-vote btn-intel-down" data-id="' + (p._search_id || '') + '" data-type="down">👎 Pass</button>';
    html += '<button class="btn-intel-save" data-id="' + (p._search_id || '') + '" data-address="' + App.escapeHtml(p.address) + '" data-neighborhood="' + App.escapeHtml(p.neighborhood || '') + '" data-zip="' + (p.zip || '') + '" data-price="' + (p.list_price || '') + '" data-arv="' + (p.estimated_arv || '') + '">📌 Save</button>';
    if (p.listing_url) html += '<a class="btn-intel-link" href="' + p.listing_url + '" target="_blank" rel="noopener">🔗 Listing</a>';
    html += '</div>';
    
    html += '</div>';
    return html;
  }
  
  function mechCheck(label, checked) {
    return '<span class="mech-item ' + (checked ? 'mech-yes' : 'mech-no') + '">' + (checked ? '✅' : '❌') + ' ' + label + '</span>';
  }
  
  function strategyRow(label, value) {
    return '<div class="strat-row"><span class="strat-label">' + label + '</span><span class="strat-value">' + App.escapeHtml(value) + '</span></div>';
  }
  
  function funnelStep(label, count, cls) {
    return '<div class="funnel-step ' + cls + '"><div class="funnel-count">' + (count || 0).toLocaleString() + '</div><div class="funnel-label">' + label + '</div></div>';
  }
  
  function dealRow(label, value, cls) {
    return '<div class="deal-row ' + (cls || '') + '"><span>' + label + '</span><span>' + value + '</span></div>';
  }
  
  // Legacy list renderer (for old-format data without full report)
  function renderLegacyList(container, statsEl, json) {
    var data = json.data || [];
    statsEl.textContent = data.length + ' listings (legacy view)';
    var html = '';
    data.forEach(function(r) {
      html += '<div class="intel-card"><h3 class="intel-address">' + App.escapeHtml(r.address) + '</h3>';
      html += '<div class="intel-price-row"><span class="intel-price">' + App.formatCurrency(r.list_price) + '</span></div>';
      html += '<div class="intel-specs">' + [r.beds ? r.beds + 'bd' : '', r.baths ? r.baths + 'ba' : '', r.sqft ? r.sqft + 'sqft' : ''].filter(Boolean).join(' · ') + '</div>';
      if (r.listing_url) html += '<a class="btn-intel-link" href="' + r.listing_url + '" target="_blank">🔗 Listing</a>';
      html += '</div>';
    });
    container.innerHTML = html || '<div class="empty-state">No data</div>';
  }
  
  /* ---- Event Handlers ---- */
  
  function handleClick(e) {
    var voteBtn = e.target.closest('.btn-intel-vote');
    if (voteBtn) {
      e.preventDefault();
      var id = voteBtn.getAttribute('data-id');
      var type = voteBtn.getAttribute('data-type');
      if (id) showFeedbackModal(Number(id), type);
      return;
    }
    
    var saveBtn = e.target.closest('.btn-intel-save');
    if (saveBtn) {
      e.preventDefault();
      saveProperty(saveBtn);
      return;
    }
  }
  
  function showFeedbackModal(searchId, type) {
    var existing = document.getElementById('feedback-modal');
    if (existing) existing.remove();

    var modal = document.createElement('div');
    modal.id = 'feedback-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML =
      '<div class="modal-content">' +
        '<h3>' + (type === 'up' ? '👍 Interested' : '👎 Pass') + '</h3>' +
        '<label class="modal-label">Who are you?</label>' +
        '<select id="fb-user" class="filter-select">' +
          '<option value="Jacob">Jacob</option>' +
          '<option value="Kwaku">Kwaku</option>' +
          '<option value="Other">Other</option>' +
        '</select>' +
        '<label class="modal-label">Reason</label>' +
        '<input type="text" id="fb-reason" class="search-input" placeholder="' + (type === 'up' ? 'e.g. Good mechanicals, strong comps' : 'e.g. Too much work, bad area') + '">' +
        '<div class="modal-actions">' +
          '<button class="btn-cancel" id="fb-cancel">Cancel</button>' +
          '<button class="btn-submit" id="fb-submit">Submit</button>' +
        '</div>' +
      '</div>';

    document.body.appendChild(modal);

    document.getElementById('fb-cancel').addEventListener('click', function () { modal.remove(); });
    modal.addEventListener('click', function (e) { if (e.target === modal) modal.remove(); });

    document.getElementById('fb-submit').addEventListener('click', async function () {
      var user = document.getElementById('fb-user').value;
      var reason = document.getElementById('fb-reason').value;
      var btn = this;
      btn.disabled = true;
      btn.textContent = 'Saving...';

      try {
        var res = await fetch('/api/search-feedback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            search_id: searchId,
            user_name: user,
            feedback: type,
            reason: reason || null
          })
        });
        var json = await res.json();
        if (json.error) throw new Error(json.error);
        modal.remove();
        loadReport(); // Refresh
      } catch (err) {
        btn.textContent = 'Failed!';
        setTimeout(function() { btn.textContent = 'Submit'; btn.disabled = false; }, 2000);
      }
    });
  }

  async function saveProperty(btn) {
    var searchId = Number(btn.getAttribute('data-id'));
    var address = btn.getAttribute('data-address');
    var neighborhood = btn.getAttribute('data-neighborhood');
    var zip = btn.getAttribute('data-zip');
    var price = btn.getAttribute('data-price');
    var arv = btn.getAttribute('data-arv');

    btn.disabled = true;
    btn.textContent = '📌 Saving...';

    try {
      var res = await fetch('/api/saved-properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          search_id: searchId || null,
          address: address,
          neighborhood: neighborhood || null,
          zip: zip || null,
          list_price: price ? Number(price) : null,
          estimated_arv: arv ? Number(arv) : null,
          status: 'researching'
        })
      });
      var json = await res.json();
      if (json.error) throw new Error(json.error);
      btn.textContent = '✅ Saved';
    } catch (err) {
      btn.textContent = '❌ Failed';
      setTimeout(function() { btn.textContent = '📌 Save'; btn.disabled = false; }, 2000);
    }
  }

})();
