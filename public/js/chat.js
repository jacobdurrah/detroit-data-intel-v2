/* ============================================================
   Detroit Data Intelligence Platform V2 - Chat Module
   ============================================================ */
(function () {
  'use strict';

  var initialized = false;
  var isOpen = false;
  var isLoading = false;

  function init() {
    if (initialized) return;
    initialized = true;

    bindEvents();
  }

  function bindEvents() {
    var fab = document.getElementById('chat-fab');
    var closeBtn = document.getElementById('chat-close');
    var sendBtn = document.getElementById('chat-send');
    var inputEl = document.getElementById('chat-input');
    var suggestionsEl = document.getElementById('chat-suggestions');

    if (fab) {
      fab.addEventListener('click', function () {
        toggleChat();
      });
    }

    if (closeBtn) {
      closeBtn.addEventListener('click', function () {
        closeChat();
      });
    }

    if (sendBtn) {
      sendBtn.addEventListener('click', function () {
        sendMessage();
      });
    }

    if (inputEl) {
      inputEl.addEventListener('keydown', function (e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
        }
      });
    }

    // Suggestion clicks
    if (suggestionsEl) {
      suggestionsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('.suggestion');
        if (btn) {
          var text = btn.textContent.trim();
          if (inputEl) inputEl.value = text;
          sendMessage();
        }
      });
    }

    // Event delegation for "Show on Map" buttons inside chat
    document.getElementById('chat-messages').addEventListener('click', function (e) {
      var btn = e.target.closest('.btn-map');
      if (btn) {
        var pointsStr = btn.getAttribute('data-points');
        if (pointsStr && window.MapModule) {
          try {
            var points = JSON.parse(pointsStr);
            window.MapModule.showOnMap(points, 'sales');
          } catch (err) {
            console.warn('Failed to parse map points:', err);
          }
        }
      }
    });
  }

  function toggleChat() {
    if (isOpen) {
      closeChat();
    } else {
      openChat();
    }
  }

  function openChat() {
    var panel = document.getElementById('chat-panel');
    var fab = document.getElementById('chat-fab');
    if (panel) panel.classList.remove('hidden');
    if (fab) fab.style.display = 'none';
    isOpen = true;

    // Focus input
    var inputEl = document.getElementById('chat-input');
    if (inputEl) {
      setTimeout(function () { inputEl.focus(); }, 150);
    }
  }

  function closeChat() {
    var panel = document.getElementById('chat-panel');
    var fab = document.getElementById('chat-fab');
    if (panel) panel.classList.add('hidden');
    if (fab) fab.style.display = '';
    isOpen = false;
  }

  async function sendMessage() {
    if (isLoading) return;

    var inputEl = document.getElementById('chat-input');
    var text = (inputEl ? inputEl.value.trim() : '');
    if (!text) return;

    // Clear input
    inputEl.value = '';

    // Add user message
    appendMessage('user', text);

    // Show typing indicator
    var typingEl = showTyping();
    isLoading = true;

    try {
      var res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: text })
      });

      if (!res.ok) {
        throw new Error('Chat error ' + res.status);
      }

      var data = await res.json();

      // Remove typing indicator
      removeTyping(typingEl);

      // Render bot response
      renderBotResponse(data);

    } catch (e) {
      removeTyping(typingEl);
      appendMessage('bot', 'Sorry, something went wrong. Please try again.');
      console.warn('Chat error:', e);
    } finally {
      isLoading = false;
    }
  }

  function appendMessage(role, text) {
    var messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    var msgEl = document.createElement('div');
    msgEl.className = 'chat-msg ' + role;
    msgEl.innerHTML = '<p>' + App.escapeHtml(text) + '</p>';
    messagesEl.appendChild(msgEl);
    scrollToBottom();
  }

  function renderBotResponse(data) {
    var messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return;

    var msgEl = document.createElement('div');
    msgEl.className = 'chat-msg bot';

    var html = '';

    // Answer text
    var answer = data.answer || data.message || data.text || '';
    if (answer) {
      html += '<p>' + formatAnswerText(answer) + '</p>';
    }

    // Data table
    var tableData = data.data || data.table || data.results || null;
    if (Array.isArray(tableData) && tableData.length > 0) {
      html += renderDataTable(tableData);
    }

    // Show on Map button
    var mapPoints = data.mapPoints || data.map_points || data.points || null;
    if (Array.isArray(mapPoints) && mapPoints.length > 0) {
      var pointsJson = JSON.stringify(mapPoints);
      // Escape for HTML attribute
      var escapedPoints = pointsJson.replace(/"/g, '&quot;');
      html +=
        '<button class="btn-map" data-points="' + escapedPoints + '">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/></svg>' +
          'Show on Map (' + mapPoints.length + ' points)' +
        '</button>';
    }

    if (!html) {
      html = '<p>No response received.</p>';
    }

    msgEl.innerHTML = html;
    messagesEl.appendChild(msgEl);
    scrollToBottom();
  }

  function formatAnswerText(text) {
    // Basic Markdown-like formatting
    var escaped = App.escapeHtml(text);
    // Bold **text**
    escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    // Line breaks
    escaped = escaped.replace(/\n/g, '<br>');
    return escaped;
  }

  function renderDataTable(data) {
    if (!data.length) return '';

    var keys = Object.keys(data[0]);
    var html = '<div class="chat-data-table"><table>';

    // Header
    html += '<thead><tr>';
    keys.forEach(function (k) {
      html += '<th>' + App.escapeHtml(k) + '</th>';
    });
    html += '</tr></thead>';

    // Rows (max 10 for chat)
    html += '<tbody>';
    var maxRows = Math.min(data.length, 10);
    for (var i = 0; i < maxRows; i++) {
      html += '<tr>';
      keys.forEach(function (k) {
        var val = data[i][k];
        var display = val;
        if (typeof val === 'number') {
          // Detect currency-like keys
          if (/price|spend|volume|amount|cost/i.test(k)) {
            display = App.formatCurrency(val);
          } else if (/rate|percent/i.test(k)) {
            display = App.formatPercent(val, 2);
          } else {
            display = App.formatNumber(val);
          }
        } else {
          display = App.escapeHtml(String(val != null ? val : '--'));
        }
        html += '<td>' + display + '</td>';
      });
      html += '</tr>';
    }
    html += '</tbody></table>';

    if (data.length > 10) {
      html += '<p style="font-size:11px;color:var(--text-muted);margin-top:6px;">Showing 10 of ' + data.length + ' results</p>';
    }

    html += '</div>';
    return html;
  }

  function showTyping() {
    var messagesEl = document.getElementById('chat-messages');
    if (!messagesEl) return null;

    var el = document.createElement('div');
    el.className = 'chat-typing';
    el.innerHTML = '<span></span><span></span><span></span>';
    messagesEl.appendChild(el);
    scrollToBottom();
    return el;
  }

  function removeTyping(el) {
    if (el && el.parentNode) {
      el.parentNode.removeChild(el);
    }
  }

  function scrollToBottom() {
    var messagesEl = document.getElementById('chat-messages');
    if (messagesEl) {
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  }

  /* --- Exports --- */
  window.ChatModule = {
    init: init,
    open: openChat,
    close: closeChat,
    toggle: toggleChat
  };

})();
