/*
 * Service worker: owns the recorder storage, anonymisation, compression and
 * upload. The content script only forwards raw frames and session events.
 */
importScripts('msgpack.js', 'recorder/format.js', 'recorder/store.js');

(function () {
  'use strict';

  var VERSION = chrome.runtime.getManifest().version;
  // Set this to your ingest URL before publishing (users can override it in options).
  var DEFAULT_ENDPOINT = '';
  var DEFAULT_TOKEN = '';
  var MAX_ATTEMPTS = 40;
  var END_GRACE_MS = 20000;
  var RETRY_ALARM = 'cct-upload-retry';

  var F = CCT.Format;
  var S = CCT.Store;

  // ------------------------------------------------------------- settings

  function randomHex(n) {
    var a = new Uint8Array(n);
    crypto.getRandomValues(a);
    return Array.from(a).map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  function getSettings() {
    return new Promise(function (resolve) {
      chrome.storage.local.get(['consent', 'endpoint', 'token', 'installId', 'salt', 'keepLocal'], function (v) {
        var changed = false;
        if (!v.installId) { v.installId = randomHex(8); changed = true; }
        if (!v.salt) { v.salt = randomHex(16); changed = true; }
        if (!v.consent) { v.consent = 'unset'; changed = true; }
        if (v.endpoint === undefined) { v.endpoint = DEFAULT_ENDPOINT; changed = true; }
        if (v.token === undefined) { v.token = DEFAULT_TOKEN; changed = true; }
        if (v.keepLocal === undefined) { v.keepLocal = false; changed = true; }
        if (changed) chrome.storage.local.set(v);
        resolve(v);
      });
    });
  }

  function setSettings(patch) {
    return new Promise(function (resolve) { chrome.storage.local.set(patch, resolve); });
  }

  chrome.runtime.onInstalled.addListener(function () {
    getSettings();
    chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 15 });
  });
  chrome.runtime.onStartup.addListener(function () {
    chrome.alarms.create(RETRY_ALARM, { periodInMinutes: 15 });
    recoverInterrupted();
  });

  // ------------------------------------------------------------- helpers

  function b64ToBytes(b64) {
    var bin = atob(b64);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function bytesToB64(bytes) {
    var s = '';
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) s += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
    return btoa(s);
  }

  async function gzip(bytes) {
    var cs = new CompressionStream('gzip');
    var writer = cs.writable.getWriter();
    writer.write(bytes);
    writer.close();
    var buf = await new Response(cs.readable).arrayBuffer();
    return new Uint8Array(buf);
  }

  function sessionKey(gameId, perspective, installId) {
    return String(gameId) + '-' + String(perspective) + '-' + installId + '-' + Date.now().toString(36);
  }

  // ------------------------------------------------------------- sessions

  // sid -> session key. Kept in chrome.storage.session so it survives the
  // service worker being suspended mid-game.
  var activeCache = null;
  var endTimers = {};
  var writeQueue = Promise.resolve();

  function loadActive() {
    if (activeCache) return Promise.resolve(activeCache);
    return new Promise(function (resolve) {
      chrome.storage.session.get(['active'], function (v) {
        activeCache = (v && v.active) || {};
        resolve(activeCache);
      });
    });
  }
  function saveActive() {
    return new Promise(function (resolve) { chrome.storage.session.set({ active: activeCache || {} }, resolve); });
  }
  async function getActive(sid) { var a = await loadActive(); return a[sid] || null; }
  async function setActive(sid, key) { var a = await loadActive(); if (key) a[sid] = key; else delete a[sid]; await saveActive(); }
  async function activeKeys() { var a = await loadActive(); return Object.keys(a).map(function (k) { return a[k]; }); }

  function queued(fn) {
    writeQueue = writeQueue.then(fn, fn);
    return writeQueue;
  }

  function decodeItems(items) {
    return items.map(function (it) {
      return {
        t: it.t,
        dir: it.dir,
        kind: it.kind,
        bytes: it.kind === 'text' ? F.utf8(it.text).buffer : b64ToBytes(it.b64).buffer
      };
    });
  }

  async function startSession(msg) {
    var settings = await getSettings();
    if (settings.consent !== 'accepted') return { ok: false, reason: 'no-consent' };
    if (await getActive(msg.sid)) await endSession({ sid: msg.sid, reason: 'restart' }, true);
    var key = sessionKey(msg.gameId || 'unknown', msg.meta && msg.meta.perspective, settings.installId);
    var session = {
      key: key,
      gameId: msg.gameId || null,
      sid: msg.sid,
      status: 'recording',
      startedAt: msg.t || Date.now(),
      endedAt: null,
      meta: msg.meta || {},
      frames: 0,
      rawBytes: 0,
      blob: null,
      blobBytes: 0,
      uploadedAt: null,
      attempts: 0,
      lastError: null,
      partial: !!(msg.meta && msg.meta.resumed)
    };
    await S.putSession(session);
    await setActive(msg.sid, key);
    if (Array.isArray(msg.prelude) && msg.prelude.length) await appendFrames({ sid: msg.sid, items: msg.prelude });
    return { ok: true, key: key };
  }

  async function appendFrames(msg) {
    var key = await getActive(msg.sid);
    if (!key) return { ok: false, reason: 'no-session' };
    var frames = decodeItems(msg.items || []);
    if (!frames.length) return { ok: true };
    await S.addFrames(key, frames);
    var session = await S.getSession(key);
    if (session) {
      session.frames += frames.length;
      for (var i = 0; i < frames.length; i++) session.rawBytes += frames[i].bytes.byteLength;
      if (msg.meta) session.meta = Object.assign({}, session.meta, msg.meta);
      await S.putSession(session);
    }
    return { ok: true };
  }

  async function endSession(msg, immediate) {
    var key = await getActive(msg.sid);
    if (!key) return { ok: false, reason: 'no-session' };
    var session = await S.getSession(key);
    if (session) {
      if (msg.meta) session.meta = Object.assign({}, session.meta, msg.meta);
      session.meta.endReason = msg.reason;
      session.endingAt = session.endingAt || Date.now();
      await S.putSession(session);
    }
    if (endTimers[msg.sid]) clearTimeout(endTimers[msg.sid]);
    if (immediate) {
      await setActive(msg.sid, null);
      await finalizeSession(key);
      return { ok: true };
    }
    // Keep collecting for a short grace period (end-game frames, replay data).
    endTimers[msg.sid] = setTimeout(function () {
      delete endTimers[msg.sid];
      queued(async function () {
        if ((await getActive(msg.sid)) === key) await setActive(msg.sid, null);
        await finalizeSession(key);
      });
    }, END_GRACE_MS);
    return { ok: true, graceMs: END_GRACE_MS };
  }

  async function finalizeSession(key) {
    var session = await S.getSession(key);
    if (!session || session.status !== 'recording') return;
    session.status = 'finalizing';
    session.endedAt = session.endedAt || Date.now();
    await S.putSession(session);
    try {
      var settings = await getSettings();
      var rows = await S.getFrames(key);
      var hash = F.makeHasher(settings.salt);
      var decoded = [];
      var undecodable = [];
      for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        var bytes = new Uint8Array(r.bytes);
        if (r.kind === 'text') {
          var text = F.fromUtf8(bytes);
          var parsed = null;
          try { parsed = JSON.parse(text); } catch (e) { parsed = null; }
          decoded.push({ t: r.t, dir: r.dir, kind: 'text', value: parsed !== null ? parsed : text, wasJson: parsed !== null });
        } else {
          try {
            decoded.push({ t: r.t, dir: r.dir, kind: 'bin', value: CCTMsgpack.decode(bytes) });
          } catch (e) {
            undecodable.push({ t: r.t, dir: r.dir, kind: 'bin', value: null, raw: bytes });
          }
        }
      }
      var anon = await F.anonymiseFrames(decoded, hash);
      var records = anon.frames.map(function (f, idx) {
        var src = decoded[idx];
        if (f.kind === 'text') {
          var out = src.wasJson ? JSON.stringify(f.value) : String(f.value);
          return { t: f.t, dir: f.dir, kind: 'text', bytes: F.utf8(out) };
        }
        return { t: f.t, dir: f.dir, kind: 'bin', bytes: CCTMsgpack.encode(f.value) };
      });
      // Frames that could not be decoded are dropped rather than leaking raw bytes.
      var meta = Object.assign({}, session.meta, {
        format: 1,
        recorder: VERSION,
        gameId: session.gameId,
        installId: settings.installId,
        startedAt: session.startedAt,
        endedAt: session.endedAt,
        frames: records.length,
        droppedUndecodable: undecodable.length,
        partial: session.partial,
        players: Array.isArray(session.meta.players) ? session.meta.players.map(function (p) {
          return { color: p.color, pseudo: anon.nameMap.get(p.username) || null, isBot: !!p.isBot };
        }) : undefined,
        perspectivePseudo: session.meta.myUsername ? (anon.nameMap.get(session.meta.myUsername) || null) : null,
        winnerPseudo: session.meta.winner ? (anon.nameMap.get(session.meta.winner) || null) : null
      });
      delete meta.myUsername;
      delete meta.winner;
      if (Array.isArray(meta.players)) meta.players.forEach(function (p) { delete p.username; });
      var container = F.writeContainer(meta, records);
      var gz = await gzip(container);
      session.blob = gz.buffer;
      session.blobBytes = gz.length;
      session.meta = meta;
      session.status = 'pending';
      await S.putSession(session);
      await S.deleteFrames(key);
      await uploadSession(key);
    } catch (e) {
      session.status = 'failed';
      session.lastError = String(e && e.stack || e);
      await S.putSession(session);
    }
  }

  async function uploadSession(key) {
    var session = await S.getSession(key);
    if (!session || session.status !== 'pending' || !session.blob) return { ok: false };
    var settings = await getSettings();
    if (!settings.endpoint) {
      session.status = 'local';
      await S.putSession(session);
      return { ok: false, reason: 'no-endpoint' };
    }
    session.attempts++;
    try {
      var res = await fetch(settings.endpoint.replace(/\/+$/, '') + '/ingest', {
        method: 'POST',
        headers: {
          'content-type': 'application/octet-stream',
          'x-cct-version': VERSION,
          'x-cct-install': settings.installId,
          'x-cct-game': String(session.gameId || ''),
          'x-cct-key': session.key,
          'x-cct-token': settings.token || ''
        },
        body: session.blob
      });
      if (res.ok || res.status === 409) {
        session.status = 'uploaded';
        session.uploadedAt = Date.now();
        session.lastError = null;
        if (!settings.keepLocal) { session.blob = null; }
        await S.putSession(session);
        return { ok: true };
      }
      throw new Error('HTTP ' + res.status);
    } catch (e) {
      session.lastError = String(e && e.message || e);
      if (session.attempts >= MAX_ATTEMPTS) session.status = 'failed';
      await S.putSession(session);
      return { ok: false, reason: session.lastError };
    }
  }

  async function retryPending() {
    var sessions = await S.listSessions();
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      if ((s.status === 'pending' || s.status === 'local') && s.blob) {
        var settings = await getSettings();
        if (!settings.endpoint) continue;
        s.status = 'pending';
        await S.putSession(s);
        await uploadSession(s.key);
      }
    }
  }

  /**
   * Sessions left in 'recording' by a crash/reload become partial captures;
   * sessions whose grace period expired while the worker slept get finalized.
   */
  async function recoverInterrupted() {
    var sessions = await S.listSessions();
    var live = await activeKeys();
    for (var i = 0; i < sessions.length; i++) {
      var s = sessions[i];
      var stale = s.status === 'recording' && s.endingAt && Date.now() - s.endingAt > END_GRACE_MS * 2;
      var orphan = s.status === 'recording' && live.indexOf(s.key) < 0;
      if (stale || orphan) {
        if (orphan && !s.endingAt) { s.partial = true; s.meta = Object.assign({}, s.meta, { endReason: 'interrupted' }); }
        await S.putSession(s);
        var a = await loadActive();
        for (var sid in a) if (a[sid] === s.key) delete a[sid];
        await saveActive();
        await finalizeSession(s.key);
      } else if (s.status === 'finalizing') {
        s.status = 'recording';
        await S.putSession(s);
        await finalizeSession(s.key);
      }
    }
  }

  chrome.alarms.onAlarm.addListener(function (alarm) {
    if (alarm.name === RETRY_ALARM) queued(function () { return retryPending().then(recoverInterrupted); });
  });

  // ------------------------------------------------------------- messaging

  async function stats() {
    var sessions = await S.listSessions();
    var settings = await getSettings();
    return {
      version: VERSION,
      settings: { consent: settings.consent, endpoint: settings.endpoint, installId: settings.installId, keepLocal: settings.keepLocal, hasToken: !!settings.token },
      sessions: sessions.map(function (s) {
        return {
          key: s.key, gameId: s.gameId, status: s.status, startedAt: s.startedAt, endedAt: s.endedAt,
          frames: s.frames, rawBytes: s.rawBytes, blobBytes: s.blobBytes, uploadedAt: s.uploadedAt,
          attempts: s.attempts, lastError: s.lastError, partial: s.partial, hasBlob: !!s.blob,
          players: s.meta && s.meta.players ? s.meta.players.length : null, mode: s.meta ? s.meta.mode : null
        };
      }).sort(function (a, b) { return b.startedAt - a.startedAt; })
    };
  }

  chrome.runtime.onMessage.addListener(function (msg, sender, sendResponse) {
    if (!msg || typeof msg.type !== 'string') return false;
    var p;
    switch (msg.type) {
      case 'settings.get': p = getSettings().then(function (s) { return { consent: s.consent, endpoint: s.endpoint, installId: s.installId, keepLocal: s.keepLocal }; }); break;
      case 'settings.set': p = setSettings(msg.patch || {}).then(function () { return { ok: true }; }); break;
      case 'rec.start': p = queued(function () { return startSession(msg); }); break;
      case 'rec.frames': p = queued(function () { return appendFrames(msg); }); break;
      case 'rec.end': p = queued(function () { return endSession(msg, !!msg.immediate); }); break;
      case 'rec.active': p = getActive(msg.sid).then(function (k) { return { key: k }; }); break;
      case 'stats.get': p = stats(); break;
      case 'upload.retry': p = queued(retryPending).then(stats); break;
      case 'session.export':
        p = S.getSession(msg.key).then(function (s) {
          if (!s || !s.blob) return { ok: false };
          return { ok: true, b64: bytesToB64(new Uint8Array(s.blob)), name: s.key + '.cctr.gz' };
        });
        break;
      case 'session.delete': p = S.deleteSession(msg.key).then(stats); break;
      case 'session.deleteAll':
        p = S.listSessions().then(function (list) {
          return Promise.all(list.map(function (s) { return S.deleteSession(s.key); }));
        }).then(stats);
        break;
      default:
        return false;
    }
    p.then(sendResponse, function (e) { sendResponse({ ok: false, error: String(e && e.message || e) }); });
    return true;
  });

  recoverInterrupted();
})();
