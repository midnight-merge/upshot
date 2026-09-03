(function () {
  'use strict';

  var VIEWER_URL = '__VIEWER_URL__';
  var MAX_WORDS = 12000;

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
      var all = [];
      document.querySelectorAll('[data-testid="user-message"], .font-claude-message').forEach(function (n) {
        var isUser = n.getAttribute('data-testid') === 'user-message';
        var text = n.innerText.trim();
        if (text) all.push({ role: isUser ? 'user' : 'assistant', content: text });
      });
      return all;
    },
    'gemini.google.com': function () {
      var msgs = [];
      document.querySelectorAll('.user-query-bubble-with-background, .model-response-text').forEach(function (n) {
        var isUser = n.classList.contains('user-query-bubble-with-background');
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
    var container = document.querySelector('main') || document.body;
    return [{ role: 'assistant', content: container.innerText.trim() }];
  }

  function trimMessages(msgs) {
    var wordCount = 0;
    var trimmed = [];
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
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;z-index:99999;padding:12px 20px;border-radius:8px;font-size:14px;font-family:system-ui,sans-serif;font-weight:500;box-shadow:0 4px 20px rgba(0,0,0,0.2);' + (isError ? 'background:#ef4444;color:#fff' : 'background:#18181b;color:#fff');
    document.body.appendChild(el);
    setTimeout(function () { el.remove(); }, isError ? 5000 : 3000);
  }

  function encode(str) {
    return btoa(unescape(encodeURIComponent(str)));
  }

  var msgs = extractMessages();
  if (!msgs.length || (msgs.length === 1 && !msgs[0].content)) {
    showToast('No conversation found on this page.', true);
    return;
  }

  var result = trimMessages(msgs);
  var payload = {
    source: detectSource(),
    timestamp: new Date().toISOString(),
    messages: result.messages,
    truncated: result.truncated
  };

  var url = VIEWER_URL + '#raw=' + encode(JSON.stringify(payload));
  window.open(url, '_blank');

})();
