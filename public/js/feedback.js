/* ============================================================
   Feedback System — Ctrl+Click any element to provide feedback
   ============================================================ */
(function() {
  'use strict';

  var feedbackPanel = null;
  var targetElement = null;
  var targetInfo = {};

  function init() {
    // Create feedback FAB (left side, above chat FAB)
    var fab = document.createElement('div');
    fab.id = 'feedback-fab';
    fab.innerHTML = '📝';
    fab.title = 'Give feedback (or Ctrl+Click any element)';
    fab.onclick = function() { showFeedbackPanel(); };
    document.body.appendChild(fab);

    // Create feedback panel
    feedbackPanel = document.createElement('div');
    feedbackPanel.id = 'feedback-panel';
    feedbackPanel.classList.add('fb-hidden');
    feedbackPanel.innerHTML = 
      '<div class="fb-header">' +
        '<span>📝 Feedback</span>' +
        '<button onclick="FeedbackModule.close()" class="fb-close">✕</button>' +
      '</div>' +
      '<div class="fb-body">' +
        '<div id="fb-target-info" class="fb-target-info"></div>' +
        '<div class="fb-type-select">' +
          '<button class="fb-type active" data-type="bug" onclick="FeedbackModule.setType(this)">🐛 Bug</button>' +
          '<button class="fb-type" data-type="feature" onclick="FeedbackModule.setType(this)">💡 Feature</button>' +
          '<button class="fb-type" data-type="ux" onclick="FeedbackModule.setType(this)">🎨 UX</button>' +
          '<button class="fb-type" data-type="data" onclick="FeedbackModule.setType(this)">📊 Data</button>' +
        '</div>' +
        '<textarea id="fb-text" placeholder="What should be fixed or improved?" rows="4"></textarea>' +
        '<button id="fb-submit" onclick="FeedbackModule.submit()">Submit Feedback</button>' +
        '<div id="fb-status"></div>' +
      '</div>';
    document.body.appendChild(feedbackPanel);

    // Ctrl+Click handler
    document.addEventListener('click', function(e) {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        highlightElement(e.target);
        showFeedbackPanel(e.target);
      }
    }, true);

    // Add banner
    var banner = document.createElement('div');
    banner.id = 'feedback-banner';
    banner.innerHTML = '💡 <strong>Ctrl+Click</strong> any element to give feedback';
    banner.onclick = function() { banner.style.display = 'none'; };
    document.body.appendChild(banner);
    setTimeout(function() { banner.style.opacity = '0'; setTimeout(function() { banner.style.display = 'none'; }, 500); }, 8000);
  }

  var feedbackType = 'bug';

  function setType(btn) {
    document.querySelectorAll('.fb-type').forEach(function(b) { b.classList.remove('active'); });
    btn.classList.add('active');
    feedbackType = btn.dataset.type;
  }

  function highlightElement(el) {
    // Remove previous highlight
    document.querySelectorAll('.fb-highlighted').forEach(function(e) { e.classList.remove('fb-highlighted'); });
    el.classList.add('fb-highlighted');
    targetElement = el;
  }

  function showFeedbackPanel(el) {
    feedbackPanel.classList.remove('fb-hidden');
    var infoEl = document.getElementById('fb-target-info');
    
    if (el) {
      targetInfo = {
        tag: el.tagName,
        text: (el.textContent || '').substring(0, 100),
        classes: el.className.replace('fb-highlighted', '').trim(),
        id: el.id,
        page: getCurrentTab(),
      };
      infoEl.innerHTML = '<strong>Target:</strong> ' + 
        (targetInfo.id ? '#' + targetInfo.id : targetInfo.tag) + 
        (targetInfo.text ? ' — "' + targetInfo.text.substring(0, 50) + '..."' : '');
      infoEl.style.display = 'block';
    } else {
      targetInfo = { page: getCurrentTab() };
      infoEl.innerHTML = '<strong>Page:</strong> ' + getCurrentTab();
      infoEl.style.display = 'block';
    }
    
    document.getElementById('fb-text').focus();
  }

  function getCurrentTab() {
    var active = document.querySelector('.tab-btn.active');
    return active ? active.textContent.trim() : 'unknown';
  }

  function close() {
    feedbackPanel.classList.add('fb-hidden');
    document.querySelectorAll('.fb-highlighted').forEach(function(e) { e.classList.remove('fb-highlighted'); });
    document.getElementById('fb-text').value = '';
    document.getElementById('fb-status').innerHTML = '';
  }

  async function submit() {
    var text = document.getElementById('fb-text').value.trim();
    if (!text) {
      document.getElementById('fb-status').innerHTML = '<span class="fb-error">Please enter your feedback</span>';
      return;
    }

    var btn = document.getElementById('fb-submit');
    btn.disabled = true;
    btn.textContent = 'Sending...';

    try {
      var resp = await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          page: targetInfo.page || getCurrentTab(),
          element: targetInfo.id || targetInfo.tag || null,
          feedback: '[' + feedbackType + '] ' + text + (targetInfo.text ? '\n\nElement text: ' + targetInfo.text.substring(0, 200) : ''),
          timestamp: new Date().toISOString(),
        }),
      });

      if (resp.ok) {
        document.getElementById('fb-status').innerHTML = '<span class="fb-success">✅ Feedback submitted! Thank you.</span>';
        document.getElementById('fb-text').value = '';
        setTimeout(close, 2000);
      } else {
        throw new Error('Server error');
      }
    } catch(e) {
      document.getElementById('fb-status').innerHTML = '<span class="fb-error">Failed to submit. Try again.</span>';
    }
    
    btn.disabled = false;
    btn.textContent = 'Submit Feedback';
  }

  document.addEventListener('DOMContentLoaded', init);

  window.FeedbackModule = {
    close: close,
    submit: submit,
    setType: setType,
  };
})();
