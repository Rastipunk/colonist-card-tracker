/*
 * Content script (isolated world): receives frames from inject.js, feeds the
 * live tracker, renders the overlay and, with the user's consent, forwards the
 * raw frames of each game to the service worker (recorder).
 */
(function () {
  'use strict';
  if (window.top !== window) return;

  var VERSION = chrome.runtime.getManifest().version;
  var CHANNEL = 'colonist-card-tracker';
  var READY = CHANNEL + '-ready';
  var MAX_FRAMES = 3000;
  var PRELUDE_MAX = 400;
  var BATCH_MS = 2000;
  var BATCH_BYTES = 256 * 1024;

  var tracker = new CCT.Tracker({ maxWorlds: 3000, debug: false });
  var frames = [];
  var buildFrame = null;
  var stats = { frames: 0, gameFrames: 0, textFrames: 0, outFrames: 0, decodeErrors: 0, sockets: 0, lastFrameAt: 0, recorded: 0 };
  var prefs = loadPrefs();
  var settings = { consent: 'unset', endpoint: '', installId: '' };
  var ui = null;
  var renderQueued = false;
  var reconcileTimer = null;
  var dragging = null;
  var sockets = {};
  var lastPhase = 'idle';

  // ---------------------------------------------------------------- i18n
  // All user-visible text lives in _locales/<locale>/messages.json (generated
  // from i18n/*.json). Chrome picks the locale from the browser UI language and
  // falls back to the default locale (en) key by key.
  function msg(key) {
    try { return chrome.i18n.getMessage(key) || key; } catch (e) { return key; }
  }
  var UI_LANG = (function () {
    try { return chrome.i18n.getUILanguage() || navigator.language || 'en'; } catch (e) { return navigator.language || 'en'; }
  })();
  var T = {};
  ['title', 'waiting', 'waitingHint', 'live', 'ended', 'spectator', 'turn', 'bank', 'you', 'bot', 'dice', 'rolls',
    'steals', 'scenarios', 'approx', 'synced', 'desync', 'total', 'totalTitle', 'contradictions', 'dev', 'knights',
    'expVP', 'unknownCol', 'modeRange', 'modeExpected', 'export', 'options', 'minimize', 'close', 'rec', 'recTitle',
    'recOff', 'consentTitle', 'consentText', 'consentYes', 'consentNo', 'consentMore', 'consentDeclined',
    'rateAsk', 'rateDismiss', 'devInHand', 'devPlayed', 'devNone', 'devDeck', 'moreStats', 'round',
    'themeLight', 'themeDark', 'sevens', 'expected', 'mostRolled'
  ].forEach(function (k) { T[k] = msg(k); });
  // Web Store review page of this very install (the id is the store id when installed from the store).
  var RATE_URL = 'https://chromewebstore.google.com/detail/' + chrome.runtime.id + '/reviews';
  var RATE_AFTER_GAMES = 3;

  // Card images (src/icons.js): colonist.io's own cards from its CDN, with a
  // re-discovery step if an asset hash changed and our own drawings as last resort.
  var ICONS = null;
  var iconMode = 'colonist';          // 'colonist' | 'drawn'
  var assetsDiscovered = false;
  function loadAssetMap() {
    try {
      var raw = localStorage.getItem('cct.assets');
      if (raw) { var a = JSON.parse(raw); if (a && a.map && Date.now() - a.ts < 30 * 86400000) return a.map; }
    } catch (e) { /* ignore */ }
    return null;
  }
  function buildIcons() {
    var I = window.CCTIcons;
    if (!I) { ICONS = { res: [], back: '', devBack: '', dev: {} }; return; }
    ICONS = iconMode === 'drawn' ? I.drawn : I.fromAssets(loadAssetMap() || I.colonistDefaults);
  }
  buildIcons();
  /** Re-reads the asset names from colonist's own bundle (only when an image failed). */
  function discoverAssets() {
    if (assetsDiscovered) return Promise.resolve(false);
    assetsDiscovered = true;
    var I = window.CCTIcons;
    return fetch('https://colonist.io/', { credentials: 'omit', cache: 'no-cache' }).then(function (r) { return r.text(); }).then(function (html) {
      var m = html.match(/https:\/\/cdn\.colonist\.io\/dist\/js\/shared\.[0-9a-f]+\.js/);
      if (!m) throw new Error('bundle not found');
      return fetch(m[0], { credentials: 'omit' }).then(function (r) { return r.text(); });
    }).then(function (js) {
      var found = {};
      var re = /assets\/(card_[a-z]+)\.([0-9a-f]+)\.svg/g, x;
      while ((x = re.exec(js))) found[x[1]] = x[1] + '.' + x[2];
      var N = I.colonistNames, map = { res: [], dev: {} };
      for (var i = 0; i < N.res.length; i++) { if (!found[N.res[i]]) throw new Error('missing ' + N.res[i]); map.res.push(found[N.res[i]]); }
      if (!found[N.back] || !found[N.devBack]) throw new Error('missing backs');
      map.back = found[N.back]; map.devBack = found[N.devBack];
      for (var k in N.dev) { if (!found[N.dev[k]]) throw new Error('missing ' + N.dev[k]); map.dev[k] = found[N.dev[k]]; }
      try { localStorage.setItem('cct.assets', JSON.stringify({ ts: Date.now(), map: map })); } catch (e) { /* ignore */ }
      buildIcons();
      return true;
    }).catch(function (e) {
      console.warn('[CCT] card assets discovery failed, using drawn cards', e);
      iconMode = 'drawn';
      buildIcons();
      return true;
    });
  }
  /** Called after each render: if a colonist image fails, re-discover or fall back. */
  function watchIcons(root) {
    if (iconMode !== 'colonist') return;
    var imgs = root.querySelectorAll('img.cct-card');
    for (var i = 0; i < imgs.length; i++) {
      imgs[i].addEventListener('error', function () {
        if (assetsDiscovered) { if (iconMode !== 'drawn') { iconMode = 'drawn'; buildIcons(); queueRender(); } return; }
        discoverAssets().then(function () { queueRender(); });
      }, { once: true });
    }
  }
  var NAMES = ['resLumber', 'resBrick', 'resWool', 'resGrain', 'resOre', 'resCloth', 'resCoin', 'resPaper'].map(msg);
  var DEV_NAMES = { 11: msg('devKnightName'), 12: msg('devVPName'), 13: msg('devMonopolyName'), 14: msg('devRoadBuildingName'), 15: msg('devYearOfPlentyName') };
  var DEV_ORDER = [11, 13, 14, 15, 12];

  // Locale-aware number formatting (decimal separator, percent sign placement).
  var numFmt = (function () {
    try {
      var f1 = new Intl.NumberFormat(UI_LANG, { minimumFractionDigits: 1, maximumFractionDigits: 1 });
      var f2 = new Intl.NumberFormat(UI_LANG, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
      var fp = new Intl.NumberFormat(UI_LANG, { style: 'percent', maximumFractionDigits: 0 });
      return { d1: function (x) { return f1.format(x); }, d2: function (x) { return f2.format(x); }, pct: function (x) { return fp.format(x); } };
    } catch (e) {
      return { d1: function (x) { return x.toFixed(1); }, d2: function (x) { return x.toFixed(2); }, pct: function (x) { return Math.round(x * 100) + '%'; } };
    }
  })();

  // ------------------------------------------------------------- settings

  function rt(msg) {
    return new Promise(function (resolve) {
      try {
        chrome.runtime.sendMessage(msg, function (res) {
          if (chrome.runtime.lastError) { resolve({ ok: false, error: chrome.runtime.lastError.message }); return; }
          resolve(res || { ok: false });
        });
      } catch (e) { resolve({ ok: false, error: String(e) }); }
    });
  }

  function loadSettings() {
    return rt({ type: 'settings.get' }).then(function (s) {
      if (s && s.consent) settings = s;
      queueRender();
    });
  }
  loadSettings();
  try {
    chrome.storage.onChanged.addListener(function (changes, area) {
      if (area !== 'local') return;
      var touched = false;
      ['consent', 'endpoint', 'installId'].forEach(function (k) { if (changes[k]) { settings[k] = changes[k].newValue; touched = true; } });
      if (touched) {
        if (settings.consent === 'accepted') maybeStartRecording();
        queueRender();
      }
    });
  } catch (e) { /* ignore */ }

  // ------------------------------------------------------------- messaging

  function sendReady() {
    try { window.postMessage({ __cct: READY }, '*'); } catch (e) { /* ignore */ }
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window) return;
    var d = ev.data;
    if (!d || d.__cct !== CHANNEL) return;
    var p = d.payload || {};
    switch (d.kind) {
      case 'injected':
      case 'injected-ping':
        sendReady();
        break;
      case 'socket-new':
        socketFor(p.sid, p.url);
        break;
      case 'socket-open':
        stats.sockets++;
        socketFor(p.sid, p.url);
        console.log('[CCT] socket open: ' + p.url);
        queueRender();
        break;
      case 'socket-close':
        onSocketClose(p.sid);
        break;
      case 'frame':
        onFrame(d, p);
        break;
      case 'out-frame':
      case 'out-text':
        stats.outFrames++;
        record(p.sid, d.t, 'out', p.raw);
        break;
      case 'text':
        stats.textFrames++;
        record(p.sid, d.t, 'in', p.raw);
        queueRender();
        break;
      case 'decode-error':
        stats.decodeErrors++;
        console.warn('[CCT] msgpack decode error', p.error);
        record(p.sid, d.t, 'in', p.raw);
        queueRender();
        break;
      default:
        break;
    }
  });
  sendReady();

  function onFrame(d, p) {
    var msg = p.msg;
    stats.frames++;
    stats.lastFrameAt = d.t || Date.now();
    var handled = false;
    try {
      handled = tracker.handleFrame(msg);
    } catch (e) {
      console.error('[CCT] tracker error', e);
    }
    var isBuild = handled && msg.data && msg.data.type === CCT.Protocol.GameMsg.BuildGame;
    if (isBuild) {
      var sock = socketFor(p.sid, p.url);
      sock.buildRaw = { t: d.t, dir: 'in', kind: 'bin', b64: toB64(p.raw) };
      sock.game = true;
      sock.ended = false;
    }
    record(p.sid, d.t, 'in', p.raw);
    if (handled) {
      stats.gameFrames++;
      var rec = { t: d.t, id: msg.id, type: msg.data && msg.data.type, seq: msg.data && msg.data.sequence, msg: msg };
      if (isBuild) {
        buildFrame = rec;
        frames = [];
        console.log('[CCT] game built: ' + tracker.players.map(function (pl) { return pl.username; }).join(', ') +
          ' | mode=' + tracker.mode + ' | me=' + tracker.myColor + ' | logs=' + tracker.processedLogs.size);
        lastPhase = 'live';
        startRecording(p.sid, false);
      } else {
        frames.push(rec);
        if (frames.length > MAX_FRAMES) frames.shift();
      }
      if (tracker.phase === 'ended' && lastPhase !== 'ended') {
        onGameEnded(p.sid);
        prefs.gamesEnded = (prefs.gamesEnded || 0) + 1;
        savePrefs();
      }
      lastPhase = tracker.phase;
      queueRender();
      scheduleReconcile();
    }
  }

  function scheduleReconcile() {
    if (reconcileTimer) clearTimeout(reconcileTimer);
    reconcileTimer = setTimeout(function () {
      reconcileTimer = null;
      try {
        tracker.flushPending();
        tracker.reconcile();
      } catch (e) {
        console.error('[CCT] reconcile error', e);
      }
      queueRender();
    }, 1200);
  }

  // -------------------------------------------------------------- recorder

  function toB64(raw) {
    if (!raw) return '';
    var bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw);
    var s = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }

  function socketFor(sid, url) {
    if (!sockets[sid]) {
      sockets[sid] = { sid: sid, url: url || '', prelude: [], batch: [], batchBytes: 0, timer: null, recording: false, starting: false, ended: false, game: false, buildRaw: null, chain: Promise.resolve() };
    }
    return sockets[sid];
  }

  function record(sid, t, dir, raw) {
    if (sid === undefined || raw === undefined || raw === null) return;
    var sock = socketFor(sid);
    var item = typeof raw === 'string'
      ? { t: t, dir: dir, kind: 'text', text: raw }
      : { t: t, dir: dir, kind: 'bin', b64: toB64(raw) };
    if (sock.recording || sock.starting) {
      sock.batch.push(item);
      sock.batchBytes += item.kind === 'text' ? item.text.length : item.b64.length;
      if (sock.batchBytes >= BATCH_BYTES) flush(sock);
      else if (!sock.timer) sock.timer = setTimeout(function () { flush(sock); }, BATCH_MS);
    } else {
      sock.prelude.push(item);
      if (sock.prelude.length > PRELUDE_MAX) sock.prelude.shift();
    }
  }

  function sessionMeta(extra) {
    var s = tracker.summary();
    var me = (!tracker.isSpectator && tracker.colorToIndex[tracker.myColor] !== undefined) ? tracker.players[tracker.colorToIndex[tracker.myColor]] : null;
    var meta = {
      perspective: tracker.myColor,
      isSpectator: tracker.isSpectator,
      mode: tracker.mode,
      playerCount: tracker.players.length,
      players: tracker.players.map(function (p) { return { color: p.color, username: p.username, isBot: p.isBot }; }),
      myUsername: me ? me.username : null,
      gameSettings: tracker.settings ? { modeSetting: tracker.settings.modeSetting, victoryPointsToWin: tracker.settings.victoryPointsToWin, gameType: tracker.settings.gameType } : null,
      lang: UI_LANG,
      turn: tracker.turn,
      logEntries: tracker.processedLogs.size,
      chatEntries: tracker.chatCount,
      dice: tracker.dice.count,
      unknownSteals: tracker.unknownSteals.length,
      contradictions: s.contradictions,
      winner: tracker.winner,
      winnerColor: tracker.winner !== null ? (tracker.players.filter(function (p) { return p.username === tracker.winner; }).map(function (p) { return p.color; })[0] || null) : null,
      standings: s.standings.map(function (x) { return { rank: x.rank, color: x.color, vp: x.vp, publicVp: x.publicVp }; })
    };
    if (extra) for (var k in extra) meta[k] = extra[k];
    return meta;
  }

  function startRecording(sid, resumed) {
    var sock = socketFor(sid);
    if (settings.consent !== 'accepted') return;
    if (sock.recording || sock.starting) return;
    sock.starting = true;
    var prelude = sock.prelude.slice();
    if (resumed && sock.buildRaw) prelude.unshift(sock.buildRaw);
    sock.prelude = [];
    var meta = sessionMeta({ resumed: !!resumed, url: sock.url });
    sock.chain = sock.chain.then(function () {
      return rt({ type: 'rec.start', sid: sid, gameId: tracker.gameId, t: Date.now(), meta: meta, prelude: prelude });
    }).then(function (res) {
      sock.starting = false;
      if (res && res.ok) {
        sock.recording = true;
        stats.recorded++;
        console.log('[CCT] recording session ' + res.key);
        flush(sock);
      } else {
        sock.batch = [];
        sock.batchBytes = 0;
        console.warn('[CCT] recording not started', res && (res.reason || res.error));
      }
      queueRender();
    });
  }

  /** Consent granted mid-game: start recording the live socket. */
  function maybeStartRecording() {
    for (var sid in sockets) {
      var sock = sockets[sid];
      if (sock.game && !sock.recording && !sock.starting && !sock.ended && tracker.phase === 'live') startRecording(Number(sid), true);
    }
  }

  function flush(sock) {
    if (sock.timer) { clearTimeout(sock.timer); sock.timer = null; }
    if (!sock.recording || !sock.batch.length) return sock.chain;
    var items = sock.batch;
    sock.batch = [];
    sock.batchBytes = 0;
    sock.chain = sock.chain.then(function () {
      return rt({ type: 'rec.frames', sid: sock.sid, items: items, meta: { turn: tracker.turn, logEntries: tracker.processedLogs.size, chatEntries: tracker.chatCount } });
    }).then(function (res) {
      if (res && res.reason === 'no-session') {
        // Service worker lost the session: re-open a (partial) one.
        sock.recording = false;
        sock.batch = items.concat(sock.batch);
        sock.batchBytes = 0;
        startRecording(sock.sid, true);
      }
    });
    return sock.chain;
  }

  function onGameEnded(sid) {
    var sock = sockets[sid];
    if (!sock || !sock.recording) return;
    sock.ended = true;
    flush(sock);
    var meta = sessionMeta();
    sock.chain = sock.chain.then(function () {
      return rt({ type: 'rec.end', sid: sid, reason: 'game-end', meta: meta });
    });
  }

  function onSocketClose(sid) {
    var sock = sockets[sid];
    if (!sock) return;
    if (sock.recording) {
      flush(sock);
      var meta = sessionMeta();
      var reason = sock.ended ? 'game-end' : 'socket-close';
      sock.chain = sock.chain.then(function () {
        return rt({ type: 'rec.end', sid: sid, reason: reason, immediate: true, meta: meta });
      });
      sock.recording = false;
    }
    sock.ended = true;
  }

  window.addEventListener('pagehide', function () {
    for (var sid in sockets) {
      var sock = sockets[sid];
      if (sock.recording && sock.batch.length) flush(sock);
    }
  });

  // ------------------------------------------------------------------ prefs

  function loadPrefs() {
    var p = { minimized: false, mode: 'range', pos: null, hidden: false, gamesEnded: 0, rateDismissed: false, statsOpen: false, theme: 'dark', minWidth: null };
    try {
      var raw = localStorage.getItem('cct.prefs');
      if (raw) {
        var parsed = JSON.parse(raw);
        for (var k in parsed) if (Object.prototype.hasOwnProperty.call(p, k)) p[k] = parsed[k];
      }
    } catch (e) { /* ignore */ }
    return p;
  }

  function savePrefs() {
    try { localStorage.setItem('cct.prefs', JSON.stringify(prefs)); } catch (e) { /* ignore */ }
  }

  // --------------------------------------------------------------------- UI

  function ensureUI() {
    if (ui) return ui;
    var root = document.documentElement;
    if (!root) return null;
    var el = document.createElement('div');
    el.id = 'cct-overlay';
    el.lang = UI_LANG;
    el.dir = msg('@@bidi_dir') === 'rtl' ? 'rtl' : 'ltr';
    el.innerHTML =
      '<div class="cct-head">' +
        '<span class="cct-title">🃏 ' + T.title + '</span>' +
        '<span class="cct-status"></span>' +
        '<span class="cct-rec" hidden title="' + T.recTitle + '">● ' + T.rec + '</span>' +
        '<span class="cct-actions">' +
          '<button data-act="theme" title="' + esc(prefs.theme === 'light' ? T.themeDark : T.themeLight) + '">' + (prefs.theme === 'light' ? '☾' : '☼') + '</button>' +
          '<button data-act="mode" title="' + T.modeExpected + '">%</button>' +
          '<button data-act="export" title="' + T.export + '">⤓</button>' +
          '<button data-act="options" title="' + T.options + '">⚙</button>' +
          '<button data-act="min" title="' + T.minimize + '">–</button>' +
          '<button data-act="close" title="' + T.close + '">×</button>' +
        '</span>' +
      '</div>' +
      '<div class="cct-consent" hidden></div>' +
      '<div class="cct-body"></div>';
    root.appendChild(el);
    ui = {
      root: el,
      head: el.querySelector('.cct-head'),
      status: el.querySelector('.cct-status'),
      rec: el.querySelector('.cct-rec'),
      consent: el.querySelector('.cct-consent'),
      body: el.querySelector('.cct-body'),
      modeBtn: el.querySelector('[data-act="mode"]')
    };
    if (prefs.pos) applyPos(prefs.pos);
    if (prefs.minimized) { el.classList.add('cct-min'); if (prefs.minWidth) el.style.width = prefs.minWidth + 'px'; }
    if (prefs.hidden) el.hidden = true;
    if (prefs.theme === 'light') el.classList.add('cct-light');
    ui.modeBtn.classList.toggle('on', prefs.mode === 'expected');
    ui.themeBtn = el.querySelector('[data-act="theme"]');

    el.querySelector('.cct-actions').addEventListener('click', function (ev) {
      var btn = ev.target.closest('button');
      if (!btn) return;
      ev.stopPropagation();
      switch (btn.getAttribute('data-act')) {
        case 'theme':
          prefs.theme = prefs.theme === 'light' ? 'dark' : 'light';
          el.classList.toggle('cct-light', prefs.theme === 'light');
          ui.themeBtn.textContent = prefs.theme === 'light' ? '☾' : '☼';
          ui.themeBtn.title = prefs.theme === 'light' ? T.themeDark : T.themeLight;
          savePrefs();
          break;
        case 'mode':
          prefs.mode = prefs.mode === 'range' ? 'expected' : 'range';
          ui.modeBtn.classList.toggle('on', prefs.mode === 'expected');
          ui.modeBtn.title = prefs.mode === 'range' ? T.modeExpected : T.modeRange;
          savePrefs();
          render();
          break;
        case 'export':
          exportDiagnostics();
          break;
        case 'options':
          openOptions();
          break;
        case 'min':
          // Keep the panel width while minimized so the buttons stay under the cursor.
          if (!prefs.minimized) { prefs.minWidth = Math.round(el.getBoundingClientRect().width); el.style.width = prefs.minWidth + 'px'; }
          else { prefs.minWidth = null; el.style.width = ''; }
          prefs.minimized = !prefs.minimized;
          el.classList.toggle('cct-min', prefs.minimized);
          savePrefs();
          break;
        case 'close':
          prefs.hidden = true;
          el.hidden = true;
          savePrefs();
          break;
      }
    });

    ui.consent.addEventListener('click', function (ev) {
      var btn = ev.target.closest('button');
      if (!btn) return;
      ev.stopPropagation();
      var act = btn.getAttribute('data-act');
      if (act === 'yes' || act === 'no') {
        settings.consent = act === 'yes' ? 'accepted' : 'declined';
        rt({ type: 'settings.set', patch: { consent: settings.consent, consentAt: Date.now() } });
        if (settings.consent === 'accepted') maybeStartRecording();
        render();
      } else if (act === 'more') {
        openOptions();
      }
    });

    ui.body.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-act]');
      if (!t) return;
      var act = t.getAttribute('data-act');
      if (act === 'stats') {
        prefs.statsOpen = !prefs.statsOpen;
        savePrefs();
        render();
        return;
      }
      if (act === 'rate' || act === 'rate-no') {
        // Either way the invitation is shown only once; the link itself opens normally.
        prefs.rateDismissed = true;
        savePrefs();
        if (act === 'rate-no') { ev.preventDefault(); render(); }
      }
    });

    ui.head.addEventListener('mousedown', function (ev) {
      if (ev.target.closest('button')) return;
      var r = el.getBoundingClientRect();
      dragging = { dx: ev.clientX - r.left, dy: ev.clientY - r.top };
      ev.preventDefault();
    });
    window.addEventListener('mousemove', function (ev) {
      if (!dragging) return;
      applyPos({ left: ev.clientX - dragging.dx, top: ev.clientY - dragging.dy });
    });
    window.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = null;
      var r = el.getBoundingClientRect();
      prefs.pos = { left: r.left, top: r.top };
      savePrefs();
    });
    window.addEventListener('keydown', function (ev) {
      if (ev.altKey && ev.shiftKey && (ev.key === 'C' || ev.key === 'c')) {
        prefs.hidden = !prefs.hidden;
        el.hidden = prefs.hidden;
        savePrefs();
      }
    });
    return ui;
  }

  function openOptions() {
    // A web page cannot navigate to chrome-extension:// URLs (ERR_BLOCKED_BY_CLIENT);
    // the service worker opens the options page on our behalf.
    rt({ type: 'options.open' });
  }

  function applyPos(pos) {
    if (!ui) return;
    var w = ui.root.offsetWidth || 320, h = ui.root.offsetHeight || 40;
    var left = Math.max(0, Math.min(window.innerWidth - Math.min(w, 120), pos.left));
    var top = Math.max(0, Math.min(window.innerHeight - Math.min(h, 40), pos.top));
    ui.root.style.left = left + 'px';
    ui.root.style.top = top + 'px';
    ui.root.style.right = 'auto';
  }

  function queueRender() {
    if (renderQueued) return;
    renderQueued = true;
    var run = function () { renderQueued = false; render(); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 30);
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isRecording() {
    for (var sid in sockets) if (sockets[sid].recording) return true;
    return false;
  }

  function render() {
    if (!ensureUI()) {
      setTimeout(queueRender, 200);
      return;
    }
    var s;
    try { s = tracker.summary(); } catch (e) { console.error('[CCT] summary error', e); return; }
    publishState(s);

    if (settings.consent !== 'accepted') {
      // Consent gates the whole UI: no counts are shown until the user accepts.
      ui.consent.hidden = false;
      var declined = settings.consent === 'declined';
      ui.consent.innerHTML = '<b>' + T.consentTitle + '</b><p>' + (declined ? T.consentDeclined : T.consentText) + '</p>' +
        '<div class="cct-consent-actions"><button data-act="yes" class="primary">' + T.consentYes + '</button>' +
        (declined ? '' : '<button data-act="no">' + T.consentNo + '</button>') +
        '<button data-act="more" class="link">' + T.consentMore + '</button></div>';
      ui.rec.hidden = true;
      ui.status.textContent = s.phase === 'idle' ? T.waiting : (s.phase === 'ended' ? T.ended : T.live);
      ui.status.className = 'cct-status';
      ui.body.innerHTML = '';
      return;
    }
    ui.consent.hidden = true;
    ui.rec.hidden = !isRecording();

    if (s.phase === 'idle') {
      ui.status.textContent = T.waiting;
      ui.status.className = 'cct-status';
      ui.body.innerHTML = '<div class="cct-empty">' + T.waiting + '<small>' + T.waitingHint + '</small></div>';
      return;
    }

    var statusBits = [s.phase === 'ended' ? T.ended : T.live];
    if (s.isSpectator) statusBits.push(T.spectator);
    // The tracker counts player turns (one per end-of-turn separator); people think in
    // rounds, where every player has played once.
    var nPlayers = Math.max(1, s.players.length);
    var round = Math.max(1, Math.ceil(s.turn / nPlayers));
    statusBits.push(T.round + ' ' + round);
    ui.status.textContent = statusBits.join(' · ');
    ui.status.className = 'cct-status ' + (s.phase === 'live' ? 'live' : '');

    var nTypes = s.isCK ? 8 : 5;
    var showUnknown = s.players.some(function (p) { return p.unknown && p.unknown.max > 0; });
    var showDev = !s.isCK;
    var html = '<table class="cct-table"><thead><tr><th class="name"></th>';
    for (var t = 0; t < nTypes; t++) html += '<th class="icon" title="' + esc(NAMES[t]) + '">' + ICONS.res[t] + '</th>';
    if (showUnknown) html += '<th title="' + esc(T.unknownCol) + '">❓</th>';
    html += '<th class="icon" title="' + esc(T.totalTitle) + '">' + ICONS.back + '</th>';
    if (showDev) html += '<th class="icon devcol" title="' + esc(T.dev) + '">' + ICONS.devBack + '</th>';
    html += '</tr></thead><tbody>';

    s.players.forEach(function (p) {
      html += '<tr class="' + (p.isMe ? 'me' : '') + '">';
      html += '<td class="name" title="' + esc(p.username) + '"><span class="cct-dot" style="background:' + p.colorHex + '"></span>' +
        esc(p.username) + (p.isMe ? ' <small>(' + esc(T.you) + ')</small>' : '') + (p.isBot ? ' <small title="' + esc(T.bot) + '">🤖</small>' : '') + '</td>';
      for (var t2 = 0; t2 < nTypes; t2++) html += cellHtml(p.cells ? p.cells[t2] : null);
      if (showUnknown) html += cellHtml(p.unknown);
      html += '<td class="total">' + (p.serverTotal !== null && p.serverTotal !== undefined ? p.serverTotal : (p.modelTotal ? p.modelTotal[0] : '–')) +
        (p.synced === true ? '<span class="ok" title="' + T.synced + '">✓</span>' : (p.synced === false ? '<span class="bad" title="' + T.desync + '">!</span>' : '')) + '</td>';
      if (showDev) {
        // count in hand + the cards this player has played, as small cards
        var counts = {};
        (p.dev.used || []).forEach(function (c) { counts[c] = (counts[c] || 0) + 1; });
        var played = '', playedNames = [];
        DEV_ORDER.concat(Object.keys(counts).map(Number).filter(function (c) { return DEV_ORDER.indexOf(c) < 0; })).forEach(function (c) {
          if (!counts[c]) return;
          var name = DEV_NAMES[c] || ('#' + c);
          playedNames.push(name + (counts[c] > 1 ? ' ×' + counts[c] : ''));
          played += '<span class="cct-devcard" title="' + esc(name) + '">' + (ICONS.dev[c] || '') + (counts[c] > 1 ? '<b>×' + counts[c] + '</b>' : '') + '</span>';
        });
        var vpStr = p.dev.hand > 0 && p.dev.expectedVP > 0 ? T.expVP + ' ' + numFmt.d1(p.dev.expectedVP) : '';
        var devTitle = p.dev.hand + ' ' + T.devInHand + (vpStr ? ' · ' + vpStr : '') + (playedNames.length ? ' · ' + T.devPlayed + ': ' + playedNames.join(', ') : '');
        html += '<td class="devcol" title="' + esc(devTitle) + '"><span class="n">' + p.dev.hand + '</span>' + (played ? '<span class="played">' + played + '</span>' : '') + '</td>';
      }
      html += '</tr>';
    });

    html += '<tr class="bank"><td class="name">🏦 ' + T.bank + '</td>';
    for (var t3 = 0; t3 < nTypes; t3++) {
      html += s.bank.available ? '<td' + (s.bank.cards[t3] === 0 ? ' class="z"' : '') + '>' + s.bank.cards[t3] + '</td>' : '<td class="z">–</td>';
    }
    if (showUnknown) html += '<td></td>';
    html += '<td class="total">' + (s.bank.available ? s.bank.cards.slice(0, nTypes).reduce(function (a, b) { return a + b; }, 0) : '–') + '</td>';
    if (showDev) html += '<td class="devcol" title="' + esc(T.devDeck) + '"><span class="n">' + (s.devBank !== null && s.devBank !== undefined ? s.devBank : '–') + '</span></td>';
    html += '</tr></tbody></table>';

    // Collapsible statistics: dice histogram with expected counts, then key numbers.
    var open = !!prefs.statsOpen;
    html += '<div class="cct-section cct-more' + (open ? ' open' : '') + '"><h4 class="cct-toggle" data-act="stats"><span>' + (open ? '▾' : '▸') + ' ' + esc(T.moreStats) + '</span>' +
      '<span>🎲 ' + s.dice.count + ' ' + esc(T.rolls) + '</span></h4>';
    if (open) {
      var PROB = { 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 7: 6, 8: 5, 9: 4, 10: 3, 11: 2, 12: 1 };
      var n = s.dice.count || 0;
      var maxRoll = 1, mostNum = null;
      for (var r = 2; r <= 12; r++) {
        var cnt = s.dice.hist[r] || 0;
        maxRoll = Math.max(maxRoll, cnt, n * PROB[r] / 36);
        if (cnt > 0 && (mostNum === null || cnt > (s.dice.hist[mostNum] || 0))) mostNum = r;
      }
      var BAR_H = 56;   // px available for the tallest bar
      html += '<div class="cct-dice">';
      for (var r2 = 2; r2 <= 12; r2++) {
        var c = s.dice.hist[r2] || 0;
        var hpx = Math.max(2, Math.round(BAR_H * c / maxRoll));
        var exp = n * PROB[r2] / 36;
        var epx = Math.round(BAR_H * exp / maxRoll);
        html += '<div class="bar' + (r2 === 7 ? ' hot' : '') + '" title="' + r2 + ': ' + c + ' · ' + esc(T.expected) + ' ' + numFmt.d1(exp) + '">' +
          '<b>' + (c || '') + '</b><i style="height:' + hpx + 'px"></i>' +
          (n > 0 ? '<em style="bottom:' + (epx + 14) + 'px"></em>' : '') +
          '<span>' + r2 + '</span></div>';
      }
      html += '</div>';
      var sevens = s.dice.hist[7] || 0;
      var lines = [];
      lines.push('<span>' + esc(T.round) + ' <b>' + round + '</b> · ' + esc(T.turn) + ' <b>' + s.turn + '</b></span>');
      lines.push('<span>' + esc(T.rolls) + ' <b>' + n + '</b>' + (mostNum !== null ? ' · ' + esc(T.mostRolled) + ' <b>' + mostNum + '</b> (×' + s.dice.hist[mostNum] + ')' : '') + '</span>');
      lines.push('<span>' + esc(T.sevens) + ' <b>' + sevens + '</b>' + (n > 0 ? ' (' + numFmt.pct(sevens / n) + ') · ' + numFmt.d1(n / 6) + ' ' + esc(T.expected) : '') + '</span>');
      lines.push('<span>' + s.unknownSteals + ' ' + esc(T.steals) + ' · ' + s.worlds + ' ' + esc(T.scenarios) + (s.approx ? ' (' + esc(T.approx) + ')' : '') +
        (s.contradictions > 0 ? ' · <span class="warn" title="' + esc(T.contradictions) + '">⚠ ' + s.contradictions + '</span>' : '') + '</span>');
      html += '<div class="cct-stats">' + lines.join('') + '</div>';
    }
    html += '</div>';
    html += '<div class="cct-foot cct-version"><span></span><span>v' + VERSION + '</span></div>';
    if ((prefs.gamesEnded || 0) >= RATE_AFTER_GAMES && !prefs.rateDismissed) {
      html += '<div class="cct-rate"><a href="' + RATE_URL + '" target="_blank" rel="noopener" data-act="rate">★ ' + esc(T.rateAsk) + '</a>' +
        '<button data-act="rate-no" title="' + esc(T.rateDismiss) + '">×</button></div>';
    }

    ui.body.innerHTML = html;
    watchIcons(ui.body);
  }

  function cellHtml(m) {
    if (!m) return '<td class="z">–</td>';
    if (m.max === 0) return '<td class="z">0</td>';
    if (m.min === m.max) return '<td><span class="v">' + m.min + '</span></td>';
    var title = distTitle(m);
    if (prefs.mode === 'expected') {
      return '<td title="' + title + '"><span class="e">' + numFmt.d1(m.mean) + '</span></td>';
    }
    var pExtra = 1 - (m.dist[m.min] || 0);
    var extra = m.max - m.min;
    // Number and "+extra" on the first line, probability underneath: column widths stay put.
    return '<td class="rng" title="' + title + '"><span class="v">' + m.min + '</span><span class="x">+' + extra + '</span><span class="p">' + numFmt.pct(pExtra) + '</span></td>';
  }

  function distTitle(m) {
    var parts = [];
    var keys = Object.keys(m.dist).map(Number).sort(function (a, b) { return a - b; });
    for (var i = 0; i < keys.length; i++) parts.push(keys[i] + ': ' + numFmt.pct(m.dist[keys[i]]));
    return 'E=' + numFmt.d2(m.mean) + ' | ' + parts.join(', ');
  }

  /** Mirror a compact summary into the DOM for tooling (tests, live capture). */
  function publishState(s) {
    try {
      var el = document.getElementById('cct-state');
      if (!el) {
        el = document.createElement('script');
        el.type = 'application/json';
        el.id = 'cct-state';
        document.documentElement.appendChild(el);
      }
      el.textContent = JSON.stringify({
        version: VERSION,
        phase: s.phase,
        gameId: s.gameId,
        turn: s.turn,
        players: s.players.map(function (p) {
          return {
            name: p.username, color: p.color, isMe: p.isMe, total: p.serverTotal, synced: p.synced,
            cells: p.cells ? p.cells.map(function (c) { return [c.min, c.max, Math.round(c.mean * 100) / 100]; }) : null,
            dev: p.dev.hand
          };
        }),
        bank: s.bank,
        dice: s.dice.hist,
        unknownSteals: s.unknownSteals,
        worlds: s.worlds,
        contradictions: s.contradictions,
        warnings: s.warnings,
        consent: settings.consent,
        recording: isRecording(),
        stats: stats
      });
    } catch (e) { /* ignore */ }
  }

  function exportDiagnostics() {
    var payload = {
      version: VERSION,
      exportedAt: new Date().toISOString(),
      url: location.href,
      userAgent: navigator.userAgent,
      stats: stats,
      summary: tracker.summary(),
      players: tracker.players,
      warnings: tracker.warnings,
      events: tracker.events,
      unknownSteals: tracker.unknownSteals,
      buildFrame: buildFrame,
      frames: frames
    };
    var name = 'cct-diagnostic-' + (tracker.gameId || 'nogame') + '-' + Date.now() + '.json';
    try {
      var blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = name;
      document.documentElement.appendChild(a);
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
    } catch (e) {
      console.error('[CCT] export failed', e);
    }
  }

  var boot = function () { ensureUI(); render(); };
  if (document.documentElement) boot(); else document.addEventListener('DOMContentLoaded', boot);
  console.log('[CCT] Colonist Card Tracker v' + VERSION + ' loaded');
})();
