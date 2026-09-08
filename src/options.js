(function () {
  'use strict';

  var PRIVACY_URL = 'https://github.com/Rastipunk/colonist-card-tracker/blob/main/PRIVACY.md';

  // All text comes from _locales/<locale>/messages.json (see i18n/ and
  // tools/i18n-build.mjs). Elements carry data-i18n="<key>".
  function msg(key) {
    try { return chrome.i18n.getMessage(key) || key; } catch (e) { return key; }
  }
  var T = {
    saved: msg('saved'),
    deleteAllConfirm: msg('deleteAllConfirm'),
    partial: msg('partial'),
    exportBtn: msg('exportBtn'),
    deleteBtn: msg('deleteBtn'),
    status: function (s) { var m = chrome.i18n.getMessage('status_' + s); return m || s; }
  };
  try { document.documentElement.lang = chrome.i18n.getUILanguage(); } catch (e) { /* ignore */ }
  document.documentElement.dir = msg('@@bidi_dir') === 'rtl' ? 'rtl' : 'ltr';
  document.querySelectorAll('[data-i18n]').forEach(function (el) {
    el.textContent = msg(el.getAttribute('data-i18n'));
  });

  function rt(msg) {
    return new Promise(function (resolve) {
      chrome.runtime.sendMessage(msg, function (res) {
        if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
        resolve(res || {});
      });
    });
  }

  function $(id) { return document.getElementById(id); }

  function fmtBytes(n) {
    if (!n) return '–';
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
    return (n / 1024 / 1024).toFixed(2) + ' MB';
  }

  function fmtDate(t) {
    if (!t) return '–';
    var d = new Date(t);
    try { return d.toLocaleString(undefined, { dateStyle: 'short', timeStyle: 'short' }); } catch (e) { return d.toLocaleString(); }
  }

  function render(stats) {
    if (!stats || !stats.settings) return;
    $('version').textContent = 'v' + stats.version;
    $('installId').textContent = stats.settings.installId;
    document.querySelectorAll('input[name="consent"]').forEach(function (r) { r.checked = r.value === stats.settings.consent; });
    $('endpoint').value = stats.settings.endpoint || '';
    $('keepLocal').checked = !!stats.settings.keepLocal;
    $('privacyLink').href = PRIVACY_URL;

    var tbody = $('sessions').querySelector('tbody');
    tbody.innerHTML = '';
    $('empty').hidden = stats.sessions.length > 0;
    stats.sessions.forEach(function (s) {
      var tr = document.createElement('tr');
      var err = s.lastError ? ' title="' + String(s.lastError).replace(/"/g, '&quot;') + '"' : '';
      tr.innerHTML =
        '<td>' + fmtDate(s.startedAt) + '</td>' +
        '<td><code>' + (s.gameId || '?') + '</code>' + (s.partial ? ' <small>(' + T.partial + ')</small>' : '') + '</td>' +
        '<td>' + (s.players || '–') + '</td>' +
        '<td>' + s.frames + '</td>' +
        '<td>' + fmtBytes(s.blobBytes || s.rawBytes) + '</td>' +
        '<td class="status-' + s.status + '"' + err + '>' + T.status(s.status) + (s.attempts > 1 ? ' (' + s.attempts + ')' : '') + '</td>' +
        '<td>' + (s.hasBlob ? '<button class="small" data-export="' + s.key + '">' + T.exportBtn + '</button>' : '') +
          '<button class="small danger" data-delete="' + s.key + '">' + T.deleteBtn + '</button></td>';
      tbody.appendChild(tr);
    });
  }

  function refresh() { return rt({ type: 'stats.get' }).then(render); }

  document.querySelectorAll('input[name="consent"]').forEach(function (r) {
    r.addEventListener('change', function () {
      rt({ type: 'settings.set', patch: { consent: r.value, consentAt: Date.now() } }).then(refresh);
    });
  });

  $('save').addEventListener('click', function () {
    var patch = { endpoint: $('endpoint').value.trim().replace(/\/+$/, ''), keepLocal: $('keepLocal').checked };
    var token = $('token').value.trim();
    if (token) patch.token = token;
    rt({ type: 'settings.set', patch: patch }).then(function () {
      $('token').value = '';
      var ok = document.createElement('span');
      ok.id = 'saved';
      ok.textContent = T.saved;
      $('save').after(ok);
      setTimeout(function () { ok.remove(); }, 2000);
      return refresh();
    });
  });
  $('keepLocal').addEventListener('change', function () {
    rt({ type: 'settings.set', patch: { keepLocal: $('keepLocal').checked } });
  });

  $('retry').addEventListener('click', function () { rt({ type: 'upload.retry' }).then(render); });
  $('refresh').addEventListener('click', refresh);
  $('deleteAll').addEventListener('click', function () {
    if (!confirm(T.deleteAllConfirm)) return;
    rt({ type: 'session.deleteAll' }).then(render);
  });

  $('sessions').addEventListener('click', function (ev) {
    var btn = ev.target.closest('button');
    if (!btn) return;
    if (btn.dataset.export) {
      rt({ type: 'session.export', key: btn.dataset.export }).then(function (res) {
        if (!res.ok) return;
        var bin = atob(res.b64);
        var bytes = new Uint8Array(bin.length);
        for (var i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        var a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([bytes], { type: 'application/gzip' }));
        a.download = res.name;
        document.body.appendChild(a);
        a.click();
        setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
      });
    } else if (btn.dataset.delete) {
      rt({ type: 'session.delete', key: btn.dataset.delete }).then(render);
    }
  });

  refresh();
  setInterval(refresh, 10000);
})();
