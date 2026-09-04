'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine } = require('./load');

const CCT = loadEngine();
const K = CCT.WorldSet.K;
const UNK = CCT.WorldSet.UNK;

// lumber, brick, wool, grain, ore, cloth, coin, paper, unknown
function v(l = 0, b = 0, w = 0, g = 0, o = 0) { return [l, b, w, g, o, 0, 0, 0, 0]; }

function cell(ws, p, t) { return ws.marginals()[p][t]; }

test('hidden steal branches with exact probabilities', () => {
  const ws = new CCT.WorldSet(2);
  ws.add(1, v(2, 0, 0, 1, 0)); // victim: 2 lumber, 1 grain
  ws.steal(0, 1, 1);
  assert.equal(ws.size(), 2);
  const lumber = cell(ws, 0, 0);
  const grain = cell(ws, 0, 3);
  assert.equal(lumber.min, 0); assert.equal(lumber.max, 1);
  assert.ok(Math.abs(lumber.dist[1] - 2 / 3) < 1e-9);
  assert.ok(Math.abs(grain.dist[1] - 1 / 3) < 1e-9);
  assert.ok(Math.abs(lumber.mean - 2 / 3) < 1e-9);
  // totals are certain even when types are not
  assert.deepEqual(ws.totals(0), [1, 1]);
  assert.deepEqual(ws.totals(1), [2, 2]);
});

test('later spending resolves a hidden steal', () => {
  const ws = new CCT.WorldSet(2);
  ws.add(1, v(1, 0, 0, 1, 0)); // victim: 1 lumber, 1 grain
  ws.steal(0, 1, 1);
  assert.equal(ws.size(), 2);
  // Thief now spends a grain (only possible if the stolen card was grain)
  const ok = ws.add(0, v(0, 0, 0, -1, 0));
  assert.equal(ok, true);
  assert.equal(ws.size(), 1);
  assert.equal(cell(ws, 1, 0).min, 1); // victim kept the lumber for sure
  assert.equal(cell(ws, 1, 3).max, 0);
});

test('victim spending also resolves a hidden steal', () => {
  const ws = new CCT.WorldSet(2);
  ws.add(1, v(1, 0, 0, 1, 0));
  ws.steal(0, 1, 1);
  ws.add(1, v(-1, 0, 0, 0, 0)); // victim still had the lumber => grain was stolen
  assert.equal(ws.size(), 1);
  assert.equal(cell(ws, 0, 3).min, 1);
});

test('monopoly count prunes impossible worlds', () => {
  const ws = new CCT.WorldSet(3);
  ws.add(2, v(0, 0, 1, 1, 0)); // player2: 1 wool 1 grain
  ws.add(0, v(0, 0, 1, 0, 0)); // player0: 1 wool
  ws.steal(1, 2, 1);           // player1 stole wool or grain from player2
  assert.equal(ws.size(), 2);
  // player1 plays monopoly on wool and gets 2 => player2 kept its wool => the stolen card was grain
  ws.monopoly(1, 2, 2);
  assert.equal(ws.size(), 1);
  assert.equal(cell(ws, 1, 2).min, 2);
  assert.equal(cell(ws, 1, 3).min, 1);
  assert.equal(cell(ws, 0, 2).max, 0);
  assert.equal(cell(ws, 2, 2).max, 0);
  assert.equal(cell(ws, 2, 3).max, 0);
});

test('trade offers are evidence of holding cards', () => {
  const ws = new CCT.WorldSet(2);
  ws.add(1, v(1, 0, 0, 1, 0));
  ws.steal(0, 1, 1);
  ws.requireAtLeast(0, v(1, 0, 0, 0, 0)); // thief offers lumber
  assert.equal(ws.size(), 1);
  assert.equal(cell(ws, 0, 0).min, 1);
});

test('contradiction is clamped, counted and does not throw', () => {
  const ws = new CCT.WorldSet(1);
  const ok = ws.add(0, v(-1, 0, 0, 0, 0));
  assert.equal(ok, false);
  assert.equal(ws.contradictions, 1);
  assert.equal(cell(ws, 0, 0).min, 0);
  assert.equal(ws.size(), 1);
});

test('unknown-type cards cover shortfalls', () => {
  const ws = new CCT.WorldSet(1);
  const u = v(); u[UNK] = 2;
  ws.add(0, u);
  const ok = ws.add(0, v(-1, -1, 0, 0, 0));
  assert.equal(ok, true);
  assert.equal(cell(ws, 0, UNK).min, 0);
  assert.deepEqual(ws.totals(0), [0, 0]);
});

test('adjustTotal adds unknowns for surplus and branches for shortfall', () => {
  const ws = new CCT.WorldSet(1);
  ws.add(0, v(1, 1, 0, 0, 0));
  ws.adjustTotal(0, 4);
  assert.equal(cell(ws, 0, UNK).min, 2);
  ws.adjustTotal(0, 1);
  assert.deepEqual(ws.totals(0), [1, 1]);
  assert.ok(ws.size() >= 2);
});

test('requireTotal prunes to matching worlds', () => {
  const ws = new CCT.WorldSet(2);
  ws.add(1, v(1, 1, 0, 0, 0));
  ws.adjustTotal(1, 1); // branch: lost lumber or brick
  assert.equal(ws.size(), 2);
  assert.equal(ws.requireTotal(1, 1), true);
  assert.equal(ws.requireTotal(1, 5), false);
});

test('worlds are capped and merged', () => {
  const ws = new CCT.WorldSet(3, { maxWorlds: 50 });
  ws.add(1, v(3, 3, 3, 3, 3));
  ws.add(2, v(3, 3, 3, 3, 3));
  for (let i = 0; i < 12; i++) ws.steal(0, i % 2 ? 1 : 2, 1);
  assert.ok(ws.size() <= 50);
  assert.equal(ws.approx, true);
  let sum = 0;
  ws.worlds.forEach((wd) => { sum += wd.w; });
  assert.ok(Math.abs(sum - 1) < 1e-9);
});

test('addPlayer extends every world', () => {
  const ws = new CCT.WorldSet(1);
  ws.add(0, v(1));
  ws.addPlayer();
  assert.equal(ws.n, 2);
  assert.deepEqual(ws.totals(1), [0, 0]);
  assert.equal(ws.marginals()[0].length, K);
});
