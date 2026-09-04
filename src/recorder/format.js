/*
 * CCTR container format + anonymiser. Pure functions: usable from the
 * extension service worker, from Node tests and (mirrored) from Python.
 *
 * Container (before gzip):
 *   "CCTR" | u8 version=1 | u32 metaLen | meta JSON (utf-8)
 *   then records until EOF:
 *     varint dtMs (since previous record) | u8 flags | varint len | bytes
 *   flags: bit0 = outbound (client -> server), bit1 = text frame (utf-8 JSON/text)
 */
var CCT = globalThis.CCT || (globalThis.CCT = {});

CCT.Format = (function () {
  'use strict';

  var MAGIC = [0x43, 0x43, 0x54, 0x52]; // "CCTR"
  var VERSION = 1;
  var FLAG_OUT = 1;
  var FLAG_TEXT = 2;

  var enc = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;
  var dec = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;
  function utf8(s) { return enc ? enc.encode(s) : new Uint8Array(Buffer.from(s, 'utf8')); }
  function fromUtf8(b) { return dec ? dec.decode(b) : Buffer.from(b).toString('utf8'); }

  // ------------------------------------------------------------- writing

  function Writer() {
    this.buf = new Uint8Array(64 * 1024);
    this.pos = 0;
  }
  Writer.prototype.ensure = function (n) {
    if (this.pos + n <= this.buf.length) return;
    var size = this.buf.length * 2;
    while (size < this.pos + n) size *= 2;
    var nb = new Uint8Array(size);
    nb.set(this.buf.subarray(0, this.pos));
    this.buf = nb;
  };
  Writer.prototype.u8 = function (b) { this.ensure(1); this.buf[this.pos++] = b & 0xff; };
  Writer.prototype.u32 = function (n) {
    this.ensure(4);
    this.buf[this.pos++] = (n >>> 24) & 0xff; this.buf[this.pos++] = (n >>> 16) & 0xff;
    this.buf[this.pos++] = (n >>> 8) & 0xff; this.buf[this.pos++] = n & 0xff;
  };
  Writer.prototype.varint = function (n) {
    n = Math.max(0, Math.floor(n));
    while (n >= 0x80) { this.u8((n & 0x7f) | 0x80); n = Math.floor(n / 128); }
    this.u8(n);
  };
  Writer.prototype.bytes = function (b) { this.ensure(b.length); this.buf.set(b, this.pos); this.pos += b.length; };
  Writer.prototype.result = function () { return this.buf.slice(0, this.pos); };

  /**
   * records: [{ t: epochMs, dir: 'in'|'out', kind: 'bin'|'text', bytes: Uint8Array }]
   * sorted by t. meta: JSON-serialisable object.
   */
  function writeContainer(meta, records) {
    var w = new Writer();
    for (var i = 0; i < MAGIC.length; i++) w.u8(MAGIC[i]);
    w.u8(VERSION);
    var metaBytes = utf8(JSON.stringify(meta));
    w.u32(metaBytes.length);
    w.bytes(metaBytes);
    var last = records.length ? records[0].t : 0;
    for (var r = 0; r < records.length; r++) {
      var rec = records[r];
      var dt = Math.max(0, rec.t - last);
      last = rec.t;
      w.varint(dt);
      w.u8((rec.dir === 'out' ? FLAG_OUT : 0) | (rec.kind === 'text' ? FLAG_TEXT : 0));
      w.varint(rec.bytes.length);
      w.bytes(rec.bytes);
    }
    return w.result();
  }

  // ------------------------------------------------------------- reading

  function readContainer(u8, startEpochMs) {
    if (!(u8 instanceof Uint8Array)) u8 = new Uint8Array(u8);
    var pos = 0;
    for (var i = 0; i < MAGIC.length; i++) if (u8[pos++] !== MAGIC[i]) throw new Error('CCTR: bad magic');
    var version = u8[pos++];
    if (version !== VERSION) throw new Error('CCTR: unsupported version ' + version);
    var metaLen = ((u8[pos] << 24) | (u8[pos + 1] << 16) | (u8[pos + 2] << 8) | u8[pos + 3]) >>> 0;
    pos += 4;
    var meta = JSON.parse(fromUtf8(u8.subarray(pos, pos + metaLen)));
    pos += metaLen;
    function varint() {
      var n = 0, mul = 1, b;
      do { b = u8[pos++]; n += (b & 0x7f) * mul; mul *= 128; } while (b & 0x80);
      return n;
    }
    var records = [];
    var t = typeof startEpochMs === 'number' ? startEpochMs : (meta.startedAt || 0);
    while (pos < u8.length) {
      t += varint();
      var flags = u8[pos++];
      var len = varint();
      records.push({ t: t, dir: (flags & FLAG_OUT) ? 'out' : 'in', kind: (flags & FLAG_TEXT) ? 'text' : 'bin', bytes: u8.subarray(pos, pos + len) });
      pos += len;
    }
    return { version: version, meta: meta, records: records };
  }

  // ---------------------------------------------------------- anonymiser

  var NAME_KEY = /username|nickname|displayname/i;
  var ID_KEY = /userid|sessionid|steamid|googleid|appleid|deviceid|installid/i;
  var DROP_KEY = /picture|avatar|discord|email|token|password|phone|address|ipaddr|^ip$/i;
  var NAME_LIST_KEY = /usernames$/i;

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x) && !(x instanceof Uint8Array) && !(x instanceof Date); }

  /** Collect candidate usernames (values under username-like keys) from a decoded frame. */
  function collectNames(value, out) {
    out = out || new Set();
    (function walk(v) {
      if (Array.isArray(v)) { for (var i = 0; i < v.length; i++) walk(v[i]); return; }
      if (!isObj(v)) return;
      for (var k in v) {
        var x = v[k];
        if (typeof x === 'string' && (NAME_KEY.test(k) || NAME_LIST_KEY.test(k))) { if (x.trim()) out.add(x); }
        else if (Array.isArray(x) && NAME_LIST_KEY.test(k)) { for (var j = 0; j < x.length; j++) if (typeof x[j] === 'string' && x[j].trim()) out.add(x[j]); }
        else walk(x);
      }
    })(value);
    return out;
  }

  function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /**
   * Build a scrubber from name -> pseudonym and id -> pseudonym maps.
   * Any string anywhere in a frame gets known names replaced (chat text
   * mentions), username keys are mapped, id keys hashed, sensitive keys dropped.
   */
  function makeScrubber(nameMap, idHash) {
    var names = Array.from(nameMap.keys()).filter(function (n) { return n.length >= 3; })
      .sort(function (a, b) { return b.length - a.length; });
    var re = names.length ? new RegExp(names.map(escapeRe).join('|'), 'gi') : null;
    var lower = new Map();
    nameMap.forEach(function (v, k) { lower.set(k.toLowerCase(), v); });

    function pseudoFor(s) {
      if (nameMap.has(s)) return nameMap.get(s);
      var l = lower.get(s.toLowerCase());
      return l !== undefined ? l : idHash(s);
    }
    function scrubText(s) {
      if (!re) return s;
      return s.replace(re, function (m) { return lower.get(m.toLowerCase()) || 'p_x'; });
    }
    function scrub(v) {
      if (typeof v === 'string') return scrubText(v);
      if (Array.isArray(v)) { var a = new Array(v.length); for (var i = 0; i < v.length; i++) a[i] = scrub(v[i]); return a; }
      if (!isObj(v)) return v;
      var o = {};
      for (var k in v) {
        var x = v[k];
        if (DROP_KEY.test(k)) { o[k] = null; continue; }
        if (NAME_KEY.test(k) || NAME_LIST_KEY.test(k)) {
          if (typeof x === 'string') o[k] = x.trim() ? pseudoFor(x) : x;
          else if (Array.isArray(x)) o[k] = x.map(function (y) { return typeof y === 'string' ? pseudoFor(y) : scrub(y); });
          else o[k] = scrub(x);
          continue;
        }
        if (ID_KEY.test(k)) {
          o[k] = (typeof x === 'string' || typeof x === 'number') ? idHash(String(x)) : scrub(x);
          continue;
        }
        o[k] = scrub(x);
      }
      return o;
    }
    return scrub;
  }

  /** Salted SHA-256 based pseudonym, async (WebCrypto) with Node fallback. */
  function makeHasher(salt, prefix) {
    prefix = prefix || 'p_';
    var cache = new Map();
    return async function (input) {
      var key = String(input);
      if (cache.has(key)) return cache.get(key);
      var data = utf8(salt + '|' + key.toLowerCase());
      var hex;
      if (typeof crypto !== 'undefined' && crypto.subtle) {
        var digest = new Uint8Array(await crypto.subtle.digest('SHA-256', data));
        hex = Array.from(digest.subarray(0, 6)).map(function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
      } else {
        // Node < 19 or test environments without WebCrypto
        hex = require('crypto').createHash('sha256').update(data).digest('hex').slice(0, 12);
      }
      var out = prefix + hex;
      cache.set(key, out);
      return out;
    };
  }

  /**
   * Anonymise decoded frames: [{ t, dir, kind, value }] -> same shape with
   * scrubbed values. `hash` is an async function (see makeHasher).
   */
  async function anonymiseFrames(frames, hash) {
    var names = new Set();
    for (var i = 0; i < frames.length; i++) collectNames(frames[i].value, names);
    var nameMap = new Map();
    var arr = Array.from(names);
    for (var j = 0; j < arr.length; j++) nameMap.set(arr[j], await hash(arr[j]));

    // ids are hashed lazily; precompute by walking once so scrub can stay sync
    var ids = new Set();
    (function walk(v) {
      if (Array.isArray(v)) { v.forEach(walk); return; }
      if (!isObj(v)) return;
      for (var k in v) {
        var x = v[k];
        if (ID_KEY.test(k) && (typeof x === 'string' || typeof x === 'number')) ids.add(String(x));
        else walk(x);
      }
    })(frames.map(function (f) { return f.value; }));
    var idMap = new Map();
    var idArr = Array.from(ids);
    for (var m = 0; m < idArr.length; m++) idMap.set(idArr[m], await hash(idArr[m]));
    var scrub = makeScrubber(nameMap, function (s) { return idMap.get(s) || 'p_unknown'; });

    return {
      frames: frames.map(function (f) { return { t: f.t, dir: f.dir, kind: f.kind, value: scrub(f.value) }; }),
      nameMap: nameMap
    };
  }

  return {
    VERSION: VERSION,
    FLAG_OUT: FLAG_OUT,
    FLAG_TEXT: FLAG_TEXT,
    writeContainer: writeContainer,
    readContainer: readContainer,
    collectNames: collectNames,
    makeScrubber: makeScrubber,
    makeHasher: makeHasher,
    anonymiseFrames: anonymiseFrames,
    utf8: utf8,
    fromUtf8: fromUtf8
  };
})();
