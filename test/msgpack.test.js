'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadMsgpack } = require('./load');

const mp = loadMsgpack();

// Tiny reference encoder (enough for round-trip tests).
function encode(v) {
  const out = [];
  const push = (...b) => out.push(...b);
  const u16 = (n) => push((n >> 8) & 0xff, n & 0xff);
  const u32 = (n) => push((n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff);
  function enc(x) {
    if (x === null) return push(0xc0);
    if (x === true) return push(0xc3);
    if (x === false) return push(0xc2);
    if (typeof x === 'number') {
      if (Number.isInteger(x)) {
        if (x >= 0 && x <= 0x7f) return push(x);
        if (x < 0 && x >= -32) return push(0x100 + x);
        if (x >= 0 && x <= 0xff) return push(0xcc, x);
        if (x >= 0 && x <= 0xffff) { push(0xcd); return u16(x); }
        if (x >= 0 && x <= 0xffffffff) { push(0xce); return u32(x); }
        if (x < 0 && x >= -128) return push(0xd0, x & 0xff);
        if (x < 0 && x >= -32768) { push(0xd1); return u16(x & 0xffff); }
        if (x < 0 && x >= -2147483648) { push(0xd2); return u32(x >>> 0); }
        // int64
        push(0xd3);
        const big = BigInt(x);
        const hi = Number((big >> 32n) & 0xffffffffn), lo = Number(big & 0xffffffffn);
        u32(hi); return u32(lo);
      }
      push(0xcb);
      const b = new Uint8Array(new Float64Array([x]).buffer);
      return push(...Array.from(b).reverse());
    }
    if (typeof x === 'string') {
      const bytes = Buffer.from(x, 'utf8');
      if (bytes.length <= 31) push(0xa0 | bytes.length);
      else if (bytes.length <= 0xff) push(0xd9, bytes.length);
      else { push(0xda); u16(bytes.length); }
      return push(...bytes);
    }
    if (x instanceof Uint8Array) {
      push(0xc4, x.length);
      return push(...x);
    }
    if (x instanceof Date) {
      const sec = Math.floor(x.getTime() / 1000);
      const nsec = (x.getTime() - sec * 1000) * 1e6;
      if (nsec === 0 && sec < 0x100000000) { push(0xd6, 0xff); return u32(sec); }
      push(0xd7, 0xff);
      const hi = (nsec * 4 + Math.floor(sec / 0x100000000)) >>> 0;
      u32(hi); return u32(sec >>> 0);
    }
    if (Array.isArray(x)) {
      if (x.length <= 15) push(0x90 | x.length);
      else { push(0xdc); u16(x.length); }
      return x.forEach(enc);
    }
    const keys = Object.keys(x);
    if (keys.length <= 15) push(0x80 | keys.length);
    else { push(0xde); u16(keys.length); }
    for (const k of keys) {
      const nk = Number(k);
      enc(Number.isInteger(nk) && String(nk) === k ? nk : k);
      enc(x[k]);
    }
  }
  enc(v);
  return new Uint8Array(out);
}

test('round-trips a colonist-like frame with integer map keys', () => {
  const src = {
    id: 130,
    data: {
      type: 91,
      sequence: 4711,
      payload: {
        diff: {
          playerStates: { 1: { resourceCards: { 0: 7 } }, 3: { resourceCards: { 1: 2, 4: 1 } } },
          gameLogState: { 212: { text: { type: 47, playerColor: 1, cardsToBroadcast: [1, 1, 4], distributionType: 1 } } },
          bankState: { resourceCards: { 1: 12, 2: 19, 3: 15, 4: 9, 5: 17 } },
          tradeState: { activeOffers: { abc: null } }
        },
        timeLeftInState: 42.5
      }
    }
  };
  const bytes = encode(src);
  const decoded = mp.decode(bytes.buffer);
  assert.deepEqual(decoded, {
    id: 130,
    data: {
      type: 91,
      sequence: 4711,
      payload: {
        diff: {
          playerStates: { '1': { resourceCards: { '0': 7 } }, '3': { resourceCards: { '1': 2, '4': 1 } } },
          gameLogState: { '212': { text: { type: 47, playerColor: 1, cardsToBroadcast: [1, 1, 4], distributionType: 1 } } },
          bankState: { resourceCards: { '1': 12, '2': 19, '3': 15, '4': 9, '5': 17 } },
          tradeState: { activeOffers: { abc: null } }
        },
        timeLeftInState: 42.5
      }
    }
  });
});

test('decodes all integer widths, negatives, floats, strings and binaries', () => {
  const src = [0, 1, 127, 128, 255, 256, 65535, 65536, 4294967295, 4294967296, -1, -32, -33, -128, -129, -32768, -32769, -2147483648, -2147483649,
    3.25, -0.5, 'héllo wörld ✓', 'x'.repeat(40), new Uint8Array([1, 2, 3]), true, false, null];
  const decoded = mp.decode(encode(src));
  assert.equal(decoded.length, src.length);
  for (let i = 0; i < src.length; i++) {
    if (src[i] instanceof Uint8Array) assert.deepEqual(Array.from(decoded[i]), Array.from(src[i]));
    else assert.equal(decoded[i], src[i]);
  }
});

test('decodes the timestamp extension into Date', () => {
  const d1 = new Date(1700000000 * 1000);
  const d2 = new Date(1700000000 * 1000 + 250);
  const decoded = mp.decode(encode([d1, d2]));
  assert.ok(decoded[0] instanceof Date);
  assert.equal(decoded[0].getTime(), d1.getTime());
  assert.ok(decoded[1] instanceof Date);
  assert.equal(Math.round(decoded[1].getTime()), d2.getTime());
});

test('rejects truncated input', () => {
  assert.throws(() => mp.decode(new Uint8Array([0x92, 0x01])));
});

test('does not allow __proto__ keys to pollute objects', () => {
  const bytes = encode({ __proto__: { polluted: true }, ok: 1 });
  const decoded = mp.decode(bytes);
  assert.equal(decoded.ok, 1);
  assert.equal(({}).polluted, undefined);
});
