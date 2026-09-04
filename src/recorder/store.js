/*
 * IndexedDB store for the recorder (runs in the extension service worker).
 *
 *   sessions: { key, gameId, sid, status, startedAt, endedAt, meta, frames,
 *               rawBytes, blob(ArrayBuffer|null), blobBytes, uploadedAt,
 *               attempts, lastError, partial }
 *   frames:   { id (auto), session, t, dir, kind, bytes(ArrayBuffer) }  index: session
 *
 * status: recording -> finalizing -> pending -> uploaded | failed | local
 */
var CCT = globalThis.CCT || (globalThis.CCT = {});

CCT.Store = (function () {
  'use strict';

  var DB_NAME = 'cct-recorder';
  var DB_VERSION = 1;
  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains('sessions')) db.createObjectStore('sessions', { keyPath: 'key' });
        if (!db.objectStoreNames.contains('frames')) {
          var fs = db.createObjectStore('frames', { keyPath: 'id', autoIncrement: true });
          fs.createIndex('session', 'session', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { dbPromise = null; reject(req.error); };
    });
    return dbPromise;
  }

  function tx(stores, mode, fn) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction(stores, mode);
        var result;
        t.oncomplete = function () { resolve(result); };
        t.onerror = function () { reject(t.error); };
        t.onabort = function () { reject(t.error || new Error('aborted')); };
        result = fn(t);
      });
    });
  }

  function reqp(req) {
    return new Promise(function (resolve, reject) {
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
  }

  function putSession(session) {
    return tx(['sessions'], 'readwrite', function (t) { t.objectStore('sessions').put(session); });
  }

  function getSession(key) {
    return open().then(function (db) { return reqp(db.transaction('sessions').objectStore('sessions').get(key)); });
  }

  function listSessions() {
    return open().then(function (db) { return reqp(db.transaction('sessions').objectStore('sessions').getAll()); });
  }

  function deleteSession(key) {
    return deleteFrames(key).then(function () {
      return tx(['sessions'], 'readwrite', function (t) { t.objectStore('sessions').delete(key); });
    });
  }

  function addFrames(sessionKey, frames) {
    return tx(['frames'], 'readwrite', function (t) {
      var store = t.objectStore('frames');
      for (var i = 0; i < frames.length; i++) {
        var f = frames[i];
        store.add({ session: sessionKey, t: f.t, dir: f.dir, kind: f.kind, bytes: f.bytes });
      }
    });
  }

  function getFrames(sessionKey) {
    return open().then(function (db) {
      var idx = db.transaction('frames').objectStore('frames').index('session');
      return reqp(idx.getAll(IDBKeyRange.only(sessionKey)));
    }).then(function (rows) {
      rows.sort(function (a, b) { return a.id - b.id; });
      return rows;
    });
  }

  function deleteFrames(sessionKey) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var t = db.transaction('frames', 'readwrite');
        var idx = t.objectStore('frames').index('session');
        var req = idx.openKeyCursor(IDBKeyRange.only(sessionKey));
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) return;
          t.objectStore('frames').delete(cur.primaryKey);
          cur.continue();
        };
        t.oncomplete = function () { resolve(); };
        t.onerror = function () { reject(t.error); };
      });
    });
  }

  function countFrames(sessionKey) {
    return open().then(function (db) {
      return reqp(db.transaction('frames').objectStore('frames').index('session').count(IDBKeyRange.only(sessionKey)));
    });
  }

  return {
    putSession: putSession,
    getSession: getSession,
    listSessions: listSessions,
    deleteSession: deleteSession,
    addFrames: addFrames,
    getFrames: getFrames,
    deleteFrames: deleteFrames,
    countFrames: countFrames
  };
})();
