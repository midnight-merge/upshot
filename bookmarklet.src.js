(function () {
  'use strict';

  var VIEWER_URL = 'https://YOUR_GITHUB_USERNAME.github.io/export-chat/view.html';
  var OPENAI_API_KEY = '%%API_KEY%%';
  var MAX_WORDS = 12000;

  // --- Site-specific message extractors ---
  var SITES = {
    'chat.openai.com': function () {
      var nodes = document.querySelectorAll('[data-message-author-role]');
      var msgs = [];
      nodes.forEach(function (n) {
        var role = n.getAttribute('data-message-author-role');
        var text = n.innerText.trim();
        if (text) msgs.push({ role: role === 'user' ? 'user' : 'assistant', content: text });
      });
      return msgs;
    },
    'claude.ai': function () {
      var msgs = [];
      // User turns
      document.querySelectorAll('[data-testid="user-message"]').forEach(function (n) {
        var text = n.innerText.trim();
        if (text) msgs.push({ role: 'user', content: text });
      });
      // Build interleaved list by DOM order
      var all = [];
      document.querySelectorAll('[data-testid="user-message"], .font-claude-message').forEach(function (n) {
        var isUser = n.hasAttribute('data-testid') && n.getAttribute('data-testid') === 'user-message';
        var text = n.innerText.trim();
        if (text) all.push({ role: isUser ? 'user' : 'assistant', content: text });
      });
      return all.length ? all : msgs;
    },
    'gemini.google.com': function () {
      var msgs = [];
      document.querySelectorAll('.conversation-container .exchange, .user-query-bubble-with-background, .model-response-text').forEach(function (n) {
        var isUser = n.classList.contains('user-query-bubble-with-background') ||
                     (n.closest && n.closest('.user-query'));
        var text = n.innerText.trim();
        if (text) msgs.push({ role: isUser ? 'user' : 'assistant', content: text });
      });
      return msgs;
    }
  };

  function extractMessages() {
    var host = location.hostname;
    for (var site in SITES) {
      if (host.indexOf(site) !== -1) {
        var msgs = SITES[site]();
        if (msgs.length) return msgs;
      }
    }
    // Generic fallback: grab all text from main
    var container = document.querySelector('main') || document.body;
    var text = container.innerText.trim();
    if (text) return [{ role: 'assistant', content: text }];
    return [];
  }

  function trimMessages(msgs) {
    var wordCount = 0;
    var trimmed = [];
    // Work backwards from most recent
    for (var i = msgs.length - 1; i >= 0; i--) {
      var words = msgs[i].content.split(/\s+/).length;
      if (wordCount + words > MAX_WORDS) break;
      wordCount += words;
      trimmed.unshift(msgs[i]);
    }
    return { messages: trimmed, truncated: trimmed.length < msgs.length };
  }

  function detectSource() {
    var host = location.hostname;
    if (host.indexOf('chat.openai.com') !== -1) return 'chatgpt';
    if (host.indexOf('claude.ai') !== -1) return 'claude';
    if (host.indexOf('gemini.google.com') !== -1) return 'gemini';
    return 'unknown';
  }

  function showToast(msg, isError) {
    var el = document.createElement('div');
    el.textContent = msg;
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99999',
      'padding:12px 20px', 'border-radius:8px', 'font-size:14px',
      'font-family:system-ui,sans-serif', 'font-weight:500',
      'box-shadow:0 4px 20px rgba(0,0,0,0.2)',
      isError ? 'background:#ef4444;color:#fff' : 'background:#18181b;color:#fff'
    ].join(';');
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, isError ? 5000 : 3000);
  }

  function showLoader() {
    var el = document.createElement('div');
    el.id = '__export_chat_loader';
    el.innerHTML = '<div style="display:flex;align-items:center;gap:10px"><div style="width:18px;height:18px;border:2px solid rgba(255,255,255,0.3);border-top-color:#fff;border-radius:50%;animation:__spin 0.7s linear infinite"></div><span>Exporting conversation…</span></div>';
    el.style.cssText = [
      'position:fixed', 'bottom:24px', 'right:24px', 'z-index:99999',
      'padding:14px 20px', 'border-radius:10px',
      'background:#18181b', 'color:#fff',
      'font-size:14px', 'font-family:system-ui,sans-serif',
      'box-shadow:0 4px 24px rgba(0,0,0,0.25)'
    ].join(';');
    var style = document.createElement('style');
    style.textContent = '@keyframes __spin{to{transform:rotate(360deg)}}';
    document.head.appendChild(style);
    document.body.appendChild(el);
    return function () { el.remove(); style.remove(); };
  }

  function lzCompress(str) {
    // Inline LZ-based compression using URI encoding for size reduction
    // We use a simple approach: encode as UTF-16 pairs compressed via repeated substring encoding
    // For simplicity in a bookmarklet, we use encodeURIComponent + btoa on the JSON
    // A full LZ-string would need the library; we base64-encode with unescape trick for unicode safety
    return btoa(unescape(encodeURIComponent(str)));
  }

  function buildViewerUrl(payload) {
    var json = JSON.stringify(payload);
    var encoded = lzCompress(json);
    return VIEWER_URL + '#data=' + encoded;
  }

  async function summarise(messages, source, truncated) {
    var conversation = messages.map(function (m) {
      return (m.role === 'user' ? 'User: ' : 'Assistant: ') + m.content;
    }).join('\n\n');

    var prompt = 'Analyse this AI conversation and respond with valid JSON only, no markdown fences:\n' +
      '{\n' +
      '  "title": "concise title for the conversation (max 10 words)",\n' +
      '  "topics": [{ "name": "topic name", "description": "one sentence" }],\n' +
      '  "lastTopic": "name of the last distinct topic discussed",\n' +
      '  "summary": "3-5 paragraph prose summary of the full conversation",\n' +
      '  "keyTakeaways": ["takeaway 1", "takeaway 2", "takeaway 3"]\n' +
      '}\n\n' +
      (truncated ? '[Note: conversation was trimmed to fit limits — earlier messages may be missing]\n\n' : '') +
      'Conversation:\n' + conversation;

    var resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + OPENAI_API_KEY
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        response_format: { type: 'json_object' },
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500
      })
    });

    if (!resp.ok) {
      var err = await resp.json().catch(function () { return {}; });
      throw new Error((err.error && err.error.message) || 'OpenAI API error ' + resp.status);
    }

    var data = await resp.json();
    return JSON.parse(data.choices[0].message.content);
  }

  async function run() {
    var msgs = extractMessages();
    if (!msgs.length) {
      showToast('No conversation found on this page.', true);
      return;
    }

    var removeLoader = showLoader();

    try {
      var result = trimMessages(msgs);
      var summary = await summarise(result.messages, detectSource(), result.truncated);

      var payload = Object.assign({}, summary, {
        source: detectSource(),
        timestamp: new Date().toISOString(),
        messages: result.messages,
        truncated: result.truncated
      });

      var url = buildViewerUrl(payload);
      removeLoader();
      window.open(url, '_blank');
    } catch (err) {
      removeLoader();
      showToast('Export failed: ' + err.message, true);
    }
  }

  run();
})();
