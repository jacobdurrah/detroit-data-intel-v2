/* ============================================================
   Detroit Data Intelligence Platform V2 - Saved Properties Module
   ============================================================ */
(function () {
  'use strict';

  var PAGE_SIZE = 20;
  var currentPage = 1;
  var totalPages = 1;
  var initialized = false;
  var currentStatus = '';
  var currentView = 'list';

  function init() {
    if (initialized) return;
    initialized = true;

    var pills = document.getElementById('saved-status-pills');
    if (pills) {
      pills.addEventListener('click', function (e) {
        var btn = e.target.closest('.pill-btn');
        if (!btn) return;
        pills.querySelectorAll('.pill-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        currentStatus = btn.getAttribute('data-status') || '';
        currentPage = 1;
        loadSaved();
      });
    }

    document.getElementById('saved-list').addEventListener('click', handleClick);

    // Add Property form
    var addBtn = document.getElementById('btn-add-property');
    var addForm = document.getElementById('add-property-form');
    var cancelBtn = document.getElementById('btn-cancel-add');
    var saveBtn = document.getElementById('btn-save-new-property');

    if (addBtn && addForm) {
      addBtn.addEventListener('click', function () {
        addForm.style.display = addForm.style.display === 'none' ? 'block' : 'none';
      });
      if (cancelBtn) {
        cancelBtn.addEventListener('click', function () {
          addForm.style.display = 'none';
        });
      }
      if (saveBtn) {
        saveBtn.addEventListener('click', addNewProperty);
      }
    }

    loadSaved();
  }

  async function addNewProperty() {
    var address = document.getElementById('add-property-address').value.trim();
    if (!address) { alert('Please enter an address'); return; }

    var price = document.getElementById('add-property-price').value;
    var neighborhood = document.getElementById('add-property-neighborhood').value.trim();

    var saveBtn = document.getElementById('btn-save-new-property');
    saveBtn.textContent = 'Saving...';
    saveBtn.disabled = true;

    try {
      var resp = await fetch('/api/saved-properties', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address: address,
          list_price: price ? Number(price) : null,
          neighborhood: neighborhood || null,
          status: 'researching',
          notes: 'Manually added — DD report requested'
        })
      });
      var result = await resp.json();
      if (result.error) throw new Error(result.error);

      document.getElementById('add-property-address').value = '';
      document.getElementById('add-property-price').value = '';
      document.getElementById('add-property-neighborhood').value = '';
      document.getElementById('add-property-form').style.display = 'none';
      saveBtn.textContent = 'Save & Request DD Report';
      saveBtn.disabled = false;
      loadSaved();
    } catch (err) {
      alert('Failed to save: ' + err.message);
      saveBtn.textContent = 'Save & Request DD Report';
      saveBtn.disabled = false;
    }
  }

  function handleClick(e) {
    var btn;

    // Status change
    btn = e.target.closest('.btn-status-change');
    if (btn) {
      e.stopPropagation();
      changeStatus(Number(btn.getAttribute('data-id')), btn.getAttribute('data-new-status'));
      return;
    }

    // Back button
    btn = e.target.closest('.btn-back');
    if (btn) {
      e.stopPropagation();
      currentView = 'list';
      loadSaved();
      return;
    }

    // Save notes
    btn = e.target.closest('.btn-save-notes');
    if (btn) {
      e.stopPropagation();
      saveNotes(Number(btn.getAttribute('data-id')));
      return;
    }

    // Card click for detail
    var card = e.target.closest('.prop-card[data-id]');
    if (card && currentView === 'list') {
      showDetail(Number(card.getAttribute('data-id')));
    }
  }

  async function loadSaved() {
    currentView = 'list';
    var listEl = document.getElementById('saved-list');
    var paginationEl = document.getElementById('saved-pagination');
    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = '';

    App.showLoading(listEl);
    paginationEl.innerHTML = '';

    try {
      var params = { page: currentPage, limit: PAGE_SIZE };
      if (currentStatus) params.status = currentStatus;

      var data = await App.api('saved-properties', params);
      var items = data.data || [];
      var meta = data.meta || {};
      var total = meta.total || items.length;
      totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

      if (!items.length) {
        App.showEmpty(listEl, 'No saved properties' + (currentStatus ? ' with status "' + currentStatus + '"' : '') + '.');
        return;
      }

      renderCards(listEl, items);

      App.renderPagination(paginationEl, currentPage, totalPages, function (page) {
        currentPage = page;
        loadSaved();
      });
    } catch (err) {
      App.showError(listEl, 'Failed to load saved properties: ' + err.message, loadSaved);
    }
  }

  function getStatusClass(status) {
    var map = {
      researching: 'status-researching',
      offer_pending: 'status-offer',
      under_contract: 'status-contract',
      closed: 'status-closed',
      passed: 'status-passed'
    };
    return map[status] || '';
  }

  function getStatusLabel(status) {
    var map = {
      researching: 'Researching',
      offer_pending: 'Offer Pending',
      under_contract: 'Under Contract',
      closed: 'Closed',
      passed: 'Passed'
    };
    return map[status] || status;
  }

  function renderCards(container, items) {
    var html = '';
    items.forEach(function (item) {
      var photos = item.photos || [];
      var thumb = photos.length ? photos[0] : '';
      var statusClass = getStatusClass(item.status);

      html += '<div class="prop-card card-clickable" data-id="' + item.id + '">';

      html += '<div class="prop-thumb">';
      if (thumb) {
        html += '<img src="' + App.escapeHtml(thumb) + '" alt="Photo" loading="lazy">';
      } else {
        html += '<div class="prop-thumb-placeholder"><svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="M21 15l-5-5L5 21"/></svg></div>';
      }
      html += '<span class="saved-status-badge ' + statusClass + '">' + App.escapeHtml(getStatusLabel(item.status)) + '</span>';
      html += '</div>';

      html += '<div class="prop-body">';
      html += '<div class="prop-address">' + App.escapeHtml(item.address) + '</div>';
      html += '<div class="prop-price">' + App.formatCurrency(item.list_price) + '</div>';
      if (item.neighborhood) {
        html += '<div class="prop-neighborhood">' + App.escapeHtml(item.neighborhood) + '</div>';
      }

      var metrics = [];
      if (item.offer_price) metrics.push('Offer: ' + App.formatCurrency(item.offer_price));
      if (item.estimated_arv) metrics.push('ARV: ' + App.formatCurrency(item.estimated_arv));
      if (item.estimated_rehab) metrics.push('Rehab: ' + App.formatCurrency(item.estimated_rehab));
      if (metrics.length) {
        html += '<div class="prop-specs">' + metrics.join(' &middot; ') + '</div>';
      }

      if (item.notes) {
        html += '<div class="prop-notes-preview">' + App.escapeHtml(item.notes.substring(0, 100)) + (item.notes.length > 100 ? '...' : '') + '</div>';
      }

      html += '<div class="prop-footer-hint">Click for details \u2192</div>';
      html += '</div>';
      html += '</div>';
    });
    container.innerHTML = html;
  }

  async function showDetail(id) {
    currentView = 'detail';
    var listEl = document.getElementById('saved-list');
    var paginationEl = document.getElementById('saved-pagination');
    paginationEl.innerHTML = '';

    var filterBar = listEl.closest('.tab-panel').querySelector('.filter-bar');
    if (filterBar) filterBar.style.display = 'none';

    App.showLoading(listEl);

    try {
      var data = await App.api('saved-properties', { page: 1, limit: 1 });
      // Fetch all to find by ID (simpler than adding ID endpoint)
      var allData = await App.api('saved-properties', { page: 1, limit: 100 });
      var items = allData.data || [];
      var item = items.find(function (i) { return i.id === id; });

      if (!item) {
        App.showError(listEl, 'Property not found.', function () { currentView = 'list'; loadSaved(); });
        return;
      }

      renderDetail(listEl, item);
    } catch (err) {
      App.showError(listEl, 'Failed to load property: ' + err.message, function () { currentView = 'list'; loadSaved(); });
    }
  }

  function renderDetail(container, item) {
    var statusClass = getStatusClass(item.status);
    var photos = item.photos || [];

    var html = '<div class="detail-view">';
    html += '<button class="btn-back">\u2190 Back to saved</button>';

    html += '<div class="detail-header">';
    html += '<h2>' + App.escapeHtml(item.address) + '</h2>';
    html += '<span class="saved-status-badge ' + statusClass + '" style="display:inline-block;margin-bottom:8px;">' + App.escapeHtml(getStatusLabel(item.status)) + '</span>';
    html += '</div>';

    // Photos
    if (photos.length) {
      html += '<div class="detail-photos">';
      photos.forEach(function (url) {
        html += '<img src="' + App.escapeHtml(url) + '" alt="Photo" class="detail-photo" loading="lazy">';
      });
      html += '</div>';
    }

    // Key metrics
    html += '<div class="card-metrics">';
    html += '<div class="card-metric"><span class="metric-label">List Price</span><span class="metric-value">' + App.formatCurrency(item.list_price) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Offer Price</span><span class="metric-value">' + App.formatCurrency(item.offer_price) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Est. ARV</span><span class="metric-value">' + App.formatCurrency(item.estimated_arv) + '</span></div>';
    html += '<div class="card-metric"><span class="metric-label">Est. Rehab</span><span class="metric-value">' + App.formatCurrency(item.estimated_rehab) + '</span></div>';
    html += '</div>';

    if (item.neighborhood) {
      html += '<div style="color:var(--text-muted);margin:8px 0;">Neighborhood: ' + App.escapeHtml(item.neighborhood) + '</div>';
    }

    // Status changer
    html += '<div class="detail-section">';
    html += '<h3>Change Status</h3>';
    html += '<div class="status-pills">';
    var statuses = ['researching', 'offer_pending', 'under_contract', 'closed', 'passed'];
    statuses.forEach(function (s) {
      var active = item.status === s ? ' active' : '';
      html += '<button class="pill-btn btn-status-change ' + getStatusClass(s) + active + '" data-id="' + item.id + '" data-new-status="' + s + '">' + getStatusLabel(s) + '</button>';
    });
    html += '</div></div>';

    // Notes
    html += '<div class="detail-section">';
    html += '<h3>Notes</h3>';
    html += '<textarea id="saved-notes-input" class="notes-textarea" placeholder="Add your notes...">' + App.escapeHtml(item.notes || '') + '</textarea>';
    html += '<button class="btn-submit btn-save-notes" data-id="' + item.id + '">Save Notes</button>';
    html += '</div>';

    // Placeholders
    html += '<div class="detail-section">';
    html += '<h3>Rehab Plan</h3>';
    html += '<div class="placeholder-section">Coming soon</div>';
    html += '</div>';

    html += '<div class="detail-section">';
    html += '<h3>Contractor Bids</h3>';
    html += '<div class="placeholder-section">Coming soon</div>';
    html += '</div>';

    html += '</div>';
    container.innerHTML = html;
  }

  async function changeStatus(id, newStatus) {
    try {
      await fetch('/api/saved-properties?id=' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus })
      });
      // Reload detail
      showDetail(id);
    } catch (err) {
      alert('Failed to update status: ' + err.message);
    }
  }

  async function saveNotes(id) {
    var textarea = document.getElementById('saved-notes-input');
    if (!textarea) return;

    try {
      await fetch('/api/saved-properties?id=' + id, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: textarea.value })
      });
      var btn = document.querySelector('.btn-save-notes[data-id="' + id + '"]');
      if (btn) {
        btn.textContent = 'Saved!';
        setTimeout(function () { btn.textContent = 'Save Notes'; }, 1500);
      }
    } catch (err) {
      alert('Failed to save notes: ' + err.message);
    }
  }

  window.SavedModule = {
    init: init,
    refresh: loadSaved
  };

})();
