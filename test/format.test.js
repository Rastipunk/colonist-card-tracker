'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const { loadEngine, loadMsgpack, loadScript } = require('./load');

const CCT = loadEngine();
const mp = loadMsgpack();
loadScript('src/recorder/format.js');
const F = CCT.Format;

test('msgpack encode/decode round-trip keeps colonist shapes (int keys, bin, date, ext)', () => {
  const src = {
    id: 130,
    data: { type: 91, sequence: 12, payload: { diff: { playerStates: { '1': { resourceCards: { '0': 3 } }, '12': { resourceCards: {} } }, gameLogState: { '7': { text: { type: 47, cardsToBroadcast: [1, 4], distributionType: 1 } } } }, timeLeftInState: 12.5 } },
    neg: -5, big: 4294967297, f: -0.25, s: 'ñandú ✓', arr: new Array(20).fill(1), bin: new Uint8Array([9, 8, 7]),
    when: new Date(1700000000000), ext: { type: 5, data: new Uint8Array([1, 2]) }, nil: null, t: true, f2: false
  };
  const bytes = mp.encode(src);
  const back = mp.decode(bytes);
  assert.equal(back.id, 130);
  assert.deepEqual(back.data, src.data);
  assert.equal(back.neg, -5);
  assert.equal(back.big, 4294967297);
  assert.equal(back.f, -0.25);
  assert.equal(back.s, src.s);
  assert.equal(back.arr.length, 20);
  assert.deepEqual(Array.from(back.bin), [9, 8, 7]);
  assert.equal(back.when.getTime(), 1700000000000);
  assert.equal(back.ext.type, 5);
  assert.deepEqual(Array.from(back.ext.data), [1, 2]);
  assert.equal(back.nil, null);
  // integer-looking keys are written as msgpack integers (0x01 fixint) not strings
  const small = mp.encode({ '1': 2 });
  assert.deepEqual(Array.from(small), [0x81, 0x01, 0x02]);
});

test('container round-trip preserves records, timing and flags', () => {
  const t0 = 1725000000000;
  const records = [
    { t: t0, dir: 'in', kind: 'text', bytes: F.utf8('{"type":"Connected"}') },
    { t: t0 + 5, dir: 'in', kind: 'bin', bytes: new Uint8Array([0x81, 0x01, 0x02]) },
    { t: t0 + 300000, dir: 'out', kind: 'bin', bytes: new Uint8Array(70000).fill(7) },
    { t: t0 + 300000, dir: 'out', kind: 'text', bytes: new Uint8Array(0) }
  ];
  const meta = { format: 1, gameId: 'abc', startedAt: t0, players: [{ color: 1, pseudo: 'p_1' }] };
  const bytes = F.writeContainer(meta, records);
  const gz = zlib.gzipSync(bytes);
  const back = F.readContainer(zlib.gunzipSync(gz));
  assert.equal(back.version, 1);
  assert.deepEqual(back.meta, meta);
  assert.equal(back.records.length, 4);
  back.records.forEach((r, i) => {
    assert.equal(r.t, records[i].t);
    assert.equal(r.dir, records[i].dir);
    assert.equal(r.kind, records[i].kind);
    assert.deepEqual(Array.from(r.bytes), Array.from(records[i].bytes));
  });
});

test('anonymiser maps usernames, ids, drops secrets and scrubs chat mentions', async () => {
  const hash = F.makeHasher('test-salt');
  const frames = [
    { t: 1, dir: 'in', kind: 'bin', value: { id: 130, data: { type: 4, payload: { playerUserStates: [
      { userId: 'u-123', username: 'Simone1294', selectedColor: 2, profilePictureUrl: 'https://x/y.png', isBot: false },
      { userId: 'u-777', username: 'Rastipunk', selectedColor: 1, icon: 3, isBot: false }
    ], reconnectToken: 'secret', gameSettings: { name: 'Base', id: 42 } } } } },
    { t: 2, dir: 'in', kind: 'bin', value: { id: 130, data: { type: 91, payload: { diff: { gameChatState: { '3': { text: { key: 'x', options: { value: 'gg SIMONE1294, rastipunk wants ore' } }, username: 'Rastipunk' } } } } } } },
    { t: 3, dir: 'in', kind: 'text', value: { type: 'SessionEstablished', userSessionId: 'sess-1' } },
    { t: 4, dir: 'in', kind: 'bin', value: { data: { payload: { playerUsernames: ['Simone1294', 'Nobody'] } } } }
  ];
  const { frames: out, nameMap } = await F.anonymiseFrames(frames, hash);
  const p1 = nameMap.get('Simone1294');
  const p2 = nameMap.get('Rastipunk');
  assert.match(p1, /^p_[0-9a-f]{12}$/);
  assert.notEqual(p1, p2);
  const users = out[0].value.data.payload.playerUserStates;
  assert.equal(users[0].username, p1);
  assert.equal(users[1].username, p2);
  assert.match(users[0].userId, /^p_[0-9a-f]{12}$/);
  assert.equal(users[0].profilePictureUrl, null);
  assert.equal(users[1].icon, 3);
  assert.equal(out[0].value.data.payload.reconnectToken, null);
  assert.equal(out[0].value.data.payload.gameSettings.name, 'Base');
  assert.equal(out[0].value.data.payload.gameSettings.id, 42);
  const chat = out[1].value.data.payload.diff.gameChatState['3'];
  assert.equal(chat.username, p2);
  assert.equal(chat.text.options.value, `gg ${p1}, ${p2} wants ore`);
  assert.match(out[2].value.userSessionId, /^p_/);
  assert.deepEqual(out[3].value.data.payload.playerUsernames, [p1, nameMap.get('Nobody')]);
  assert.equal(JSON.stringify(out).includes('Simone'), false);
  assert.equal(JSON.stringify(out).includes('u-123'), false);
  // same salt => same pseudonym, different salt => different
  const again = await F.makeHasher('test-salt')('Simone1294');
  assert.equal(again, p1);
  const other = await F.makeHasher('other')('Simone1294');
  assert.notEqual(other, p1);
});
