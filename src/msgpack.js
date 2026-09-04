/*
 * Minimal MessagePack decoder (spec-complete for decoding).
 * Runs in the page MAIN world. No dependencies; the only global it defines is
 * CCTMsgpack. colonist.io encodes every WebSocket frame with @msgpack/msgpack;
 * this decoder produces the same JS shapes (maps -> plain objects with string
 * keys, ext type -1 -> Date).
 */
(function (root) {
  'use strict';

  var textDecoder = typeof TextDecoder !== 'undefined' ? new TextDecoder('utf-8') : null;

  function utf8(bytes) {
    if (textDecoder) return textDecoder.decode(bytes);
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    try { return decodeURIComponent(escape(s)); } catch (e) { return s; }
  }

  function decode(input) {
    var u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
    var view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    var pos = 0;

    function u16() { var v = view.getUint16(pos); pos += 2; return v; }
    function u32() { var v = view.getUint32(pos); pos += 4; return v; }
    function u64() { var hi = view.getUint32(pos), lo = view.getUint32(pos + 4); pos += 8; return hi * 4294967296 + lo; }
    function i64() { var hi = view.getInt32(pos), lo = view.getUint32(pos + 4); pos += 8; return hi * 4294967296 + lo; }

    function str(n) { var s = utf8(u8.subarray(pos, pos + n)); pos += n; return s; }
    function bin(n) { var b = u8.slice(pos, pos + n); pos += n; return b; }
    function arr(n) { var a = new Array(n); for (var i = 0; i < n; i++) a[i] = read(); return a; }
    function map(n) {
      var o = {};
      for (var i = 0; i < n; i++) {
        var k = read();
        var v = read();
        if (k === '__proto__') continue;
        o[typeof k === 'string' ? k : String(k)] = v;
      }
      return o;
    }
    function ext(n) {
      var type = view.getInt8(pos); pos += 1;
      var data = u8.slice(pos, pos + n); pos += n;
      if (type === -1) return timestamp(data);
      return { type: type, data: data };
    }
    function timestamp(d) {
      var dv = new DataView(d.buffer, d.byteOffset, d.byteLength);
      if (d.length === 4) return new Date(dv.getUint32(0) * 1000);
      if (d.length === 8) {
        var hi = dv.getUint32(0), lo = dv.getUint32(4);
        var nsec = hi >>> 2;
        var sec = (hi & 3) * 4294967296 + lo;
        return new Date(sec * 1000 + nsec / 1e6);
      }
      if (d.length === 12) {
        var ns = dv.getUint32(0);
        var shi = dv.getInt32(4), slo = dv.getUint32(8);
        return new Date((shi * 4294967296 + slo) * 1000 + ns / 1e6);
      }
      return { type: -1, data: d };
    }

    function read() {
      if (pos >= u8.length) throw new Error('msgpack: unexpected end of input');
      var b = u8[pos++];
      if (b <= 0x7f) return b;
      if (b >= 0xe0) return b - 0x100;
      if (b >= 0xa0 && b <= 0xbf) return str(b - 0xa0);
      if (b >= 0x90 && b <= 0x9f) return arr(b - 0x90);
      if (b >= 0x80 && b <= 0x8f) return map(b - 0x80);
      switch (b) {
        case 0xc0: return null;
        case 0xc2: return false;
        case 0xc3: return true;
        case 0xc4: return bin(u8[pos++]);
        case 0xc5: return bin(u16());
        case 0xc6: return bin(u32());
        case 0xc7: return ext(u8[pos++]);
        case 0xc8: return ext(u16());
        case 0xc9: return ext(u32());
        case 0xca: { var f = view.getFloat32(pos); pos += 4; return f; }
        case 0xcb: { var d = view.getFloat64(pos); pos += 8; return d; }
        case 0xcc: return u8[pos++];
        case 0xcd: return u16();
        case 0xce: return u32();
        case 0xcf: return u64();
        case 0xd0: { var i8 = view.getInt8(pos); pos += 1; return i8; }
        case 0xd1: { var i16 = view.getInt16(pos); pos += 2; return i16; }
        case 0xd2: { var i32 = view.getInt32(pos); pos += 4; return i32; }
        case 0xd3: return i64();
        case 0xd4: return ext(1);
        case 0xd5: return ext(2);
        case 0xd6: return ext(4);
        case 0xd7: return ext(8);
        case 0xd8: return ext(16);
        case 0xd9: return str(u8[pos++]);
        case 0xda: return str(u16());
        case 0xdb: return str(u32());
        case 0xdc: return arr(u16());
        case 0xdd: return arr(u32());
        case 0xde: return map(u16());
        case 0xdf: return map(u32());
      }
      throw new Error('msgpack: invalid byte 0x' + b.toString(16) + ' at ' + (pos - 1));
    }

    return read();
  }

  // ------------------------------------------------------------------ encode

  var textEncoder = typeof TextEncoder !== 'undefined' ? new TextEncoder() : null;

  function utf8Bytes(s) {
    if (textEncoder) return textEncoder.encode(s);
    var e = unescape(encodeURIComponent(s));
    var out = new Uint8Array(e.length);
    for (var i = 0; i < e.length; i++) out[i] = e.charCodeAt(i);
    return out;
  }

  var INT_KEY = /^(0|-?[1-9][0-9]{0,15})$/;

  /**
   * Encode a JS value. Mirrors decode(): plain objects become maps (keys that
   * look like canonical integers are written as integers, which is how
   * colonist encodes them on the wire), Uint8Array -> bin, Date -> timestamp
   * ext, { type, data } from decode() -> ext.
   */
  function encode(value) {
    var buf = new Uint8Array(1024);
    var pos = 0;

    function ensure(n) {
      if (pos + n <= buf.length) return;
      var size = buf.length * 2;
      while (size < pos + n) size *= 2;
      var nb = new Uint8Array(size);
      nb.set(buf.subarray(0, pos));
      buf = nb;
    }
    function w8(b) { ensure(1); buf[pos++] = b & 0xff; }
    function w16(n) { ensure(2); buf[pos++] = (n >>> 8) & 0xff; buf[pos++] = n & 0xff; }
    function w32(n) { ensure(4); buf[pos++] = (n >>> 24) & 0xff; buf[pos++] = (n >>> 16) & 0xff; buf[pos++] = (n >>> 8) & 0xff; buf[pos++] = n & 0xff; }
    function wbytes(b) { ensure(b.length); buf.set(b, pos); pos += b.length; }
    function w64(n) {
      var hi = Math.floor(n / 4294967296);
      var lo = n - hi * 4294967296;
      if (n < 0) { hi = Math.floor(n / 4294967296); lo = n - hi * 4294967296; }
      w32(hi >>> 0); w32(lo >>> 0);
    }
    function wfloat64(n) { ensure(8); new DataView(buf.buffer, buf.byteOffset + pos, 8).setFloat64(0, n); pos += 8; }

    function wint(n) {
      if (n >= 0) {
        if (n <= 0x7f) return w8(n);
        if (n <= 0xff) { w8(0xcc); return w8(n); }
        if (n <= 0xffff) { w8(0xcd); return w16(n); }
        if (n <= 0xffffffff) { w8(0xce); return w32(n); }
        w8(0xcf); return w64(n);
      }
      if (n >= -32) return w8(0x100 + n);
      if (n >= -128) { w8(0xd0); return w8(n & 0xff); }
      if (n >= -32768) { w8(0xd1); return w16(n & 0xffff); }
      if (n >= -2147483648) { w8(0xd2); return w32(n >>> 0); }
      w8(0xd3); return w64(n);
    }

    function wstr(s) {
      var b = utf8Bytes(s);
      if (b.length <= 31) w8(0xa0 | b.length);
      else if (b.length <= 0xff) { w8(0xd9); w8(b.length); }
      else if (b.length <= 0xffff) { w8(0xda); w16(b.length); }
      else { w8(0xdb); w32(b.length); }
      wbytes(b);
    }

    function wbin(b) {
      if (b.length <= 0xff) { w8(0xc4); w8(b.length); }
      else if (b.length <= 0xffff) { w8(0xc5); w16(b.length); }
      else { w8(0xc6); w32(b.length); }
      wbytes(b);
    }

    function wext(type, data) {
      var n = data.length;
      if (n === 1) w8(0xd4);
      else if (n === 2) w8(0xd5);
      else if (n === 4) w8(0xd6);
      else if (n === 8) w8(0xd7);
      else if (n === 16) w8(0xd8);
      else if (n <= 0xff) { w8(0xc7); w8(n); }
      else if (n <= 0xffff) { w8(0xc8); w16(n); }
      else { w8(0xc9); w32(n); }
      w8(type & 0xff);
      wbytes(data);
    }

    function wdate(d) {
      var ms = d.getTime();
      var sec = Math.floor(ms / 1000);
      var nsec = Math.round((ms - sec * 1000) * 1e6);
      if (sec >= 0 && sec < 4294967296) {
        if (nsec === 0) {
          var b4 = new Uint8Array(4);
          new DataView(b4.buffer).setUint32(0, sec);
          return wext(-1, b4);
        }
        if (sec < 17179869184) {
          var b8 = new Uint8Array(8);
          var dv = new DataView(b8.buffer);
          dv.setUint32(0, ((nsec * 4) + Math.floor(sec / 4294967296)) >>> 0);
          dv.setUint32(4, sec >>> 0);
          return wext(-1, b8);
        }
      }
      var b12 = new Uint8Array(12);
      var dv12 = new DataView(b12.buffer);
      dv12.setUint32(0, nsec);
      var hi = Math.floor(sec / 4294967296);
      dv12.setInt32(4, hi);
      dv12.setUint32(8, (sec - hi * 4294967296) >>> 0);
      return wext(-1, b12);
    }

    function write(v) {
      if (v === null || v === undefined) return w8(0xc0);
      switch (typeof v) {
        case 'boolean': return w8(v ? 0xc3 : 0xc2);
        case 'number':
          if (Number.isInteger(v) && Math.abs(v) <= 9007199254740991) return wint(v);
          w8(0xcb); return wfloat64(v);
        case 'string': return wstr(v);
        case 'bigint': return wint(Number(v));
        case 'object':
          if (v instanceof Uint8Array) return wbin(v);
          if (v instanceof ArrayBuffer) return wbin(new Uint8Array(v));
          if (ArrayBuffer.isView(v)) return wbin(new Uint8Array(v.buffer, v.byteOffset, v.byteLength));
          if (v instanceof Date) return wdate(v);
          if (Array.isArray(v)) {
            if (v.length <= 15) w8(0x90 | v.length);
            else if (v.length <= 0xffff) { w8(0xdc); w16(v.length); }
            else { w8(0xdd); w32(v.length); }
            for (var i = 0; i < v.length; i++) write(v[i]);
            return;
          }
          if (typeof v.type === 'number' && v.data instanceof Uint8Array && Object.keys(v).length === 2) {
            return wext(v.type, v.data);
          }
          var keys = Object.keys(v);
          if (keys.length <= 15) w8(0x80 | keys.length);
          else if (keys.length <= 0xffff) { w8(0xde); w16(keys.length); }
          else { w8(0xdf); w32(keys.length); }
          for (var j = 0; j < keys.length; j++) {
            var k = keys[j];
            if (INT_KEY.test(k)) wint(Number(k)); else wstr(k);
            write(v[k]);
          }
          return;
        default:
          return w8(0xc0);
      }
    }

    write(value);
    return buf.slice(0, pos);
  }

  root.CCTMsgpack = { decode: decode, encode: encode };
})(typeof globalThis !== 'undefined' ? globalThis : this);
