/*
 * MAIN-world script: wraps window.WebSocket so every frame exchanged with
 * colonist.io (both directions) is forwarded to the extension content script
 * through window.postMessage. Incoming binary frames are also decoded
 * (msgpack) for the live tracker. Nothing is modified or injected into the
 * connection.
 */
(function () {
  'use strict';
  if (window.__cctInjected) return;
  window.__cctInjected = true;

  var CHANNEL = 'colonist-card-tracker';
  var READY = CHANNEL + '-ready';
  var NativeWS = window.WebSocket;
  if (!NativeWS) return;

  var ready = false;
  var buffer = [];
  var seq = 0;
  var socketSerial = 0;

  function post(kind, payload) {
    var msg = { __cct: CHANNEL, kind: kind, seq: seq++, t: Date.now(), payload: payload };
    if (!ready) {
      buffer.push(msg);
      if (buffer.length > 5000) buffer.shift();
      return;
    }
    try { window.postMessage(msg, '*'); } catch (e) { /* non-cloneable payload */ }
  }

  window.addEventListener('message', function (ev) {
    if (ev.source !== window || !ev.data || ev.data.__cct !== READY) return;
    if (ready) return;
    ready = true;
    var pending = buffer;
    buffer = [];
    for (var i = 0; i < pending.length; i++) {
      try { window.postMessage(pending[i], '*'); } catch (e) { /* ignore */ }
    }
  });

  function toBytes(data) {
    if (data instanceof ArrayBuffer) return new Uint8Array(data.slice(0));
    if (ArrayBuffer.isView(data)) return new Uint8Array(data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength));
    return null;
  }

  function handleIncoming(sid, url, data) {
    if (typeof data === 'string') {
      var parsed = null;
      try { parsed = JSON.parse(data); } catch (e) { /* plain text */ }
      post('text', { sid: sid, url: url, data: parsed !== null ? parsed : data, raw: data });
      return;
    }
    var bytes = toBytes(data);
    if (!bytes) return;
    var decoded;
    try {
      decoded = window.CCTMsgpack.decode(bytes);
    } catch (e) {
      post('decode-error', { sid: sid, url: url, error: String(e), bytes: bytes.length, raw: bytes });
      return;
    }
    post('frame', { sid: sid, url: url, msg: decoded, raw: bytes });
  }

  function handleOutgoing(sid, url, data) {
    if (typeof data === 'string') {
      post('out-text', { sid: sid, url: url, raw: data });
      return;
    }
    var bytes = toBytes(data);
    if (!bytes) return;
    var decoded = null;
    try { decoded = window.CCTMsgpack.decode(bytes); } catch (e) { /* keep raw only */ }
    post('out-frame', { sid: sid, url: url, msg: decoded, raw: bytes });
  }

  function tap(ws) {
    var sid = ++socketSerial;
    var url = String(ws.url || '');
    ws.addEventListener('message', function (ev) {
      var data = ev.data;
      if (typeof Blob !== 'undefined' && data instanceof Blob) {
        data.arrayBuffer().then(function (b) { handleIncoming(sid, url, b); });
      } else {
        handleIncoming(sid, url, data);
      }
    });
    ws.addEventListener('open', function () { post('socket-open', { sid: sid, url: url }); });
    ws.addEventListener('close', function (ev) { post('socket-close', { sid: sid, url: url, code: ev.code }); });
    var nativeSend = ws.send;
    ws.send = function (data) {
      try { handleOutgoing(sid, url, data); } catch (e) { /* never break the page */ }
      return nativeSend.apply(this, arguments);
    };
    post('socket-new', { sid: sid, url: url });
  }

  function WrappedWebSocket(url, protocols) {
    var ws = protocols === undefined ? new NativeWS(url) : new NativeWS(url, protocols);
    try { tap(ws); } catch (e) { /* never break the page */ }
    return ws;
  }
  WrappedWebSocket.prototype = NativeWS.prototype;
  WrappedWebSocket.CONNECTING = NativeWS.CONNECTING;
  WrappedWebSocket.OPEN = NativeWS.OPEN;
  WrappedWebSocket.CLOSING = NativeWS.CLOSING;
  WrappedWebSocket.CLOSED = NativeWS.CLOSED;
  try { Object.defineProperty(WrappedWebSocket, 'name', { value: 'WebSocket' }); } catch (e) { /* ignore */ }

  window.WebSocket = WrappedWebSocket;

  post('injected', { at: Date.now() });
  try { window.postMessage({ __cct: CHANNEL, kind: 'injected-ping' }, '*'); } catch (e) { /* ignore */ }
})();
