'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadEngine, frame, log, hidden } = require('./load');

const CCT = loadEngine();
const P = CCT.Protocol;
const L = P.Log;
const C = P.Card;
const G = P.GameMsg;

const RED = 1, BLUE = 2, ORANGE = 3, GREEN = 4;

function buildGamePayload(opts = {}) {
  const logs = opts.logs || [];
  const gameLogState = {};
  logs.forEach((e, i) => { gameLogState[i] = e; });
  return {
    gameState: {
      playerStates: opts.playerStates || {
        [RED]: { resourceCards: hidden(0) },
        [BLUE]: { resourceCards: {} },
        [ORANGE]: { resourceCards: hidden(0) },
        [GREEN]: { resourceCards: hidden(0) }
      },
      bankState: { hideBankCards: false, resourceCards: { 1: 19, 2: 19, 3: 19, 4: 19, 5: 19 } },
      gameLogState,
      mechanicDevelopmentCardsState: { bankDevelopmentCards: { 10: 25 }, players: {} }
    },
    playOrder: [RED, BLUE, ORANGE, GREEN],
    playerColor: opts.me === undefined ? BLUE : opts.me,
    playerUserStates: [
      { userId: 'u1', username: 'Ana', selectedColor: RED, isBot: false },
      { userId: 'u2', username: 'Yo', selectedColor: BLUE, isBot: false },
      { userId: 'u3', username: 'Bot1', selectedColor: ORANGE, isBot: true },
      { userId: 'u4', username: 'Bot2', selectedColor: GREEN, isBot: true }
    ],
    gameSettings: { modeSetting: P.Mode.Classic },
    timeLeftInState: 30
  };
}

function newGame(opts) {
  const t = new CCT.Tracker();
  assert.equal(t.handleFrame(frame(G.BuildGame, buildGamePayload(opts), 100)), true);
  return t;
}

function update(t, diff) {
  const ok = t.handleFrame(frame(G.GameStateUpdated, { diff, timeLeftInState: 10 }, t.seqExpected));
  assert.equal(ok, true);
  return t;
}
function logs(t, entries, extra) {
  const gameLogState = {};
  entries.forEach((e) => { gameLogState[++t.__logIdx] = e; });
  return update(t, Object.assign({ gameLogState }, extra || {}));
}

function cellOf(t, name, typeIdx) {
  const s = t.summary();
  const p = s.players.find((x) => x.username === name);
  return p.cells[typeIdx];
}

test('BuildGame sets up players, me, and replays the log', () => {
  const t = newGame({
    logs: [
      log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Lumber, C.Brick, C.Ore], distributionType: 0 }),
      log(L.ResourceDistribution, { playerColor: BLUE, cardsToBroadcast: [C.Wool, C.Wool], distributionType: 0 })
    ],
    playerStates: {
      [RED]: { resourceCards: hidden(3) },
      [BLUE]: { resourceCards: { [C.Wool]: 2 } },
      [ORANGE]: { resourceCards: hidden(0) },
      [GREEN]: { resourceCards: hidden(0) }
    }
  });
  t.__logIdx = 1;
  assert.equal(t.phase, 'live');
  assert.equal(t.players.length, 4);
  assert.equal(t.players[1].username, 'Yo');
  assert.equal(t.isSpectator, false);
  assert.equal(cellOf(t, 'Ana', 0).min, 1);
  assert.equal(cellOf(t, 'Ana', 4).min, 1);
  assert.equal(cellOf(t, 'Yo', 2).min, 2);
});

test('public events: distribution, build, trade, bank, discard, dev card', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [
    log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Lumber, C.Brick, C.Wool, C.Grain, C.Ore, C.Ore], distributionType: 1 }),
    log(L.BuiltPiece, { playerColor: RED, pieceEnum: P.Piece.Road }),
  ]);
  assert.equal(cellOf(t, 'Ana', 0).min, 0);
  assert.equal(cellOf(t, 'Ana', 1).min, 0);
  logs(t, [
    log(L.PlayerTradedWithPlayer, { playerColor: RED, acceptingPlayerColor: ORANGE, givenCardEnums: [C.Wool], receivedCardEnums: [] }),
  ]);
  assert.equal(cellOf(t, 'Ana', 2).min, 0);
  assert.equal(cellOf(t, 'Bot1', 2).min, 1);
  logs(t, [
    log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Ore, C.Ore], distributionType: 1 }),
    log(L.PlayerTradedWithBank, { playerColor: RED, givenCardEnums: [C.Ore, C.Ore, C.Ore, C.Ore], receivedCardEnums: [C.Wool] }),
  ]);
  assert.equal(cellOf(t, 'Ana', 4).min, 0);
  assert.equal(cellOf(t, 'Ana', 2).min, 1);
  logs(t, [
    log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Ore, C.Grain, C.Grain], distributionType: 1 }),
    log(L.BoughtDevelopmentCard, { playerColor: RED }),
  ]);
  assert.equal(cellOf(t, 'Ana', 2).min, 0);
  assert.equal(cellOf(t, 'Ana', 3).min, 2);
  assert.equal(cellOf(t, 'Ana', 4).min, 0);
  const s = t.summary();
  assert.equal(s.players[0].dev.hand, 1);
  logs(t, [log(L.PlayerDiscarded, { playerColor: RED, cardEnums: [C.Grain] })]);
  assert.equal(cellOf(t, 'Ana', 3).min, 1);
  assert.equal(t.worlds.contradictions, 0);
});

test('steals: known (me involved) and closed (opponents) with later resolution', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [
    log(L.ResourceDistribution, { playerColor: ORANGE, cardsToBroadcast: [C.Lumber, C.Grain], distributionType: 1 }),
    log(L.ResourceDistribution, { playerColor: BLUE, cardsToBroadcast: [C.Brick], distributionType: 1 }),
    // Ana steals from me: "Ana stole brick from you"
    log(L.StolenResourceCardVictim, { playerColor: RED, cardEnums: [C.Brick] }),
  ]);
  assert.equal(cellOf(t, 'Ana', 1).min, 1);
  assert.equal(cellOf(t, 'Yo', 1).max, 0);
  // I steal from Bot1: "You stole lumber from Bot1"
  logs(t, [log(L.StolenResourceCardThief, { playerColor: ORANGE, cardEnums: [C.Lumber] })]);
  assert.equal(cellOf(t, 'Yo', 0).min, 1);
  assert.equal(cellOf(t, 'Bot1', 0).max, 0);
  // Bot1 now holds 1 grain. Ana steals from Bot1 (closed to me): certain outcome, 1 world.
  logs(t, [log(L.StolenResourceCardClosed, { playerColorThief: RED, playerColorVictim: ORANGE, cardBacks: [0] })]);
  assert.equal(t.worlds.size(), 1);
  assert.equal(cellOf(t, 'Ana', 3).min, 1);
  assert.equal(t.unknownSteals.length, 1);
  // Give Bot1 lumber+ore, Bot2 steals from Bot1: uncertain
  logs(t, [
    log(L.ResourceDistribution, { playerColor: ORANGE, cardsToBroadcast: [C.Lumber, C.Ore], distributionType: 1 }),
    log(L.StolenResourceCardClosed, { playerColorThief: GREEN, playerColorVictim: ORANGE, cardBacks: [0] }),
  ]);
  assert.equal(t.worlds.size(), 2);
  const bot2Lumber = cellOf(t, 'Bot2', 0);
  assert.equal(bot2Lumber.min, 0);
  assert.equal(bot2Lumber.max, 1);
  assert.ok(Math.abs(bot2Lumber.dist[1] - 0.5) < 1e-9);
  // Bot1 later builds a road: needs lumber+brick... give brick first
  logs(t, [
    log(L.ResourceDistribution, { playerColor: ORANGE, cardsToBroadcast: [C.Brick], distributionType: 1 }),
    log(L.BuiltPiece, { playerColor: ORANGE, pieceEnum: P.Piece.Road }),
  ]);
  // Bot1 must have kept the lumber => Bot2 stole ore
  assert.equal(t.worlds.size(), 1);
  assert.equal(cellOf(t, 'Bot2', 4).min, 1);
  assert.equal(cellOf(t, 'Bot2', 0).max, 0);
  assert.equal(t.worlds.contradictions, 0);
});

test('monopoly count and trade offers prune worlds', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [
    log(L.ResourceDistribution, { playerColor: ORANGE, cardsToBroadcast: [C.Wool, C.Grain], distributionType: 1 }),
    log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Wool], distributionType: 1 }),
    log(L.StolenResourceCardClosed, { playerColorThief: GREEN, playerColorVictim: ORANGE, cardBacks: [0] }),
  ]);
  assert.equal(t.worlds.size(), 2);
  // Bot2 plays monopoly on wool and collects 2 => Bot1 still had its wool => Bot2 stole the grain
  logs(t, [
    log(L.PlayerPlayedDevelopmentCard, { playerColor: GREEN, cardEnum: C.Monopoly }),
    log(L.PlayerStoleUsingMonopoly, { playerColor: GREEN, amountStolen: 2, cardEnum: C.Wool }),
  ]);
  assert.equal(t.worlds.size(), 1);
  assert.equal(cellOf(t, 'Bot2', 2).min, 2);
  assert.equal(cellOf(t, 'Bot2', 3).min, 1);
  assert.equal(cellOf(t, 'Bot1', 2).max, 0);
  assert.equal(cellOf(t, 'Ana', 2).max, 0);

  // Offer evidence
  logs(t, [
    log(L.ResourceDistribution, { playerColor: ORANGE, cardsToBroadcast: [C.Ore, C.Lumber], distributionType: 1 }),
    log(L.StolenResourceCardClosed, { playerColorThief: GREEN, playerColorVictim: ORANGE, cardBacks: [0] }),
  ]);
  assert.equal(t.worlds.size(), 2);
  logs(t, [log(L.PlayerWantsToTradeWith, { playerColor: GREEN, wantedCardEnums: [C.AnyResource], offeredCardEnums: [C.Ore] })]);
  assert.equal(t.worlds.size(), 1);
  assert.equal(cellOf(t, 'Bot2', 4).min, 1);
  assert.equal(cellOf(t, 'Bot1', 0).min, 1);
});

test('road building makes the next two roads free, reset at turn separator', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [
    log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Lumber, C.Brick], distributionType: 1 }),
    log(L.PlayerPlayedDevelopmentCard, { playerColor: RED, cardEnum: C.RoadBuilding }),
    log(L.BuiltPiece, { playerColor: RED, pieceEnum: P.Piece.Road }),
    log(L.BuiltPiece, { playerColor: RED, pieceEnum: P.Piece.Road }),
  ]);
  assert.equal(cellOf(t, 'Ana', 0).min, 1);
  assert.equal(cellOf(t, 'Ana', 1).min, 1);
  logs(t, [log(L.BuiltPiece, { playerColor: RED, pieceEnum: P.Piece.Road })]);
  assert.equal(cellOf(t, 'Ana', 0).min, 0);
  assert.equal(t.worlds.contradictions, 0);
});

test('dice histogram from RolledDice entries', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [
    log(L.RolledDice, { playerColor: RED, firstDice: 3, secondDice: 4 }),
    log(L.RolledDice, { playerColor: BLUE, firstDice: 6, secondDice: 6 }),
    log(L.DiceRolledAutomatically, { firstDice: 1, secondDice: 1 }),
  ]);
  assert.equal(t.dice.count, 3);
  assert.equal(t.dice.hist[7], 1);
  assert.equal(t.dice.hist[12], 1);
  assert.equal(t.dice.hist[2], 1);
});

test('reconcile: server totals confirm the model and repair unseen changes', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Lumber, C.Brick], distributionType: 1 })],
    { playerStates: { [RED]: { resourceCards: hidden(2) } } });
  t.reconcile();
  assert.equal(t.players[0].synced, true);
  assert.equal(t.players[0].serverTotal, 2);

  // Server says Ana has 4 cards but we saw nothing: 2 unknown-type cards
  update(t, { playerStates: { [RED]: { resourceCards: hidden(4) } } });
  t.reconcile();
  assert.equal(t.players[0].synced, false);
  assert.equal(t.players[0].desync, 1);
  const s = t.summary();
  assert.equal(s.players[0].unknown.min, 2);
  assert.deepEqual(t.worlds.totals(0), [4, 4]);

  // Ana then builds a settlement (needs wool+grain we did not see): unknowns cover it
  logs(t, [log(L.BuiltPiece, { playerColor: RED, pieceEnum: P.Piece.Settlement })],
    { playerStates: { [RED]: { resourceCards: hidden(0) } } });
  t.reconcile();
  assert.equal(t.worlds.contradictions, 0);
  assert.deepEqual(t.worlds.totals(0), [0, 0]);
  assert.equal(t.players[0].synced, true);
});

test('reconcile: my own hand is fully visible and enforced exactly', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [
    log(L.ResourceDistribution, { playerColor: ORANGE, cardsToBroadcast: [C.Lumber, C.Ore], distributionType: 1 }),
    log(L.StolenResourceCardClosed, { playerColorThief: RED, playerColorVictim: ORANGE, cardBacks: [0] }),
  ]);
  // server tells me my hand exactly (empty) and Ana has 1 hidden card
  update(t, { playerStates: { [BLUE]: { resourceCards: {} }, [RED]: { resourceCards: hidden(1) } } });
  t.reconcile();
  assert.equal(t.players[1].synced, true);
  assert.equal(t.players[0].synced, true);
  assert.equal(t.worlds.size(), 2);
});

test('null in a diff deletes keys (merge-patch semantics)', () => {
  const t = newGame();
  update(t, { bankState: { resourceCards: { 1: null, 2: 5 } } });
  const b = t.bankInfo();
  assert.equal(b.cards[0], 0);
  assert.equal(b.cards[1], 5);
  assert.equal(b.cards[2], 19);
});

test('out-of-order frames are re-sequenced', () => {
  const t = newGame();
  const gain = (i, cards) => ({ gameLogState: { [i]: log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: cards, distributionType: 1 }) } });
  const spend = (i) => ({ gameLogState: { [i]: log(L.BuiltPiece, { playerColor: RED, pieceEnum: P.Piece.Road }) } });
  // frame 102 (spend) arrives before 101 (gain)
  t.handleFrame(frame(G.GameStateUpdated, { diff: spend(1), timeLeftInState: 1 }, 102));
  assert.equal(t.worlds.contradictions, 0);
  t.handleFrame(frame(G.GameStateUpdated, { diff: gain(0, [C.Lumber, C.Brick]), timeLeftInState: 1 }, 101));
  assert.equal(t.worlds.contradictions, 0);
  assert.equal(cellOf(t, 'Ana', 0).min, 0);
  assert.equal(t.seqExpected, 103);
  // duplicates are ignored
  assert.equal(t.handleFrame(frame(G.GameStateUpdated, { diff: gain(0, [C.Lumber]), timeLeftInState: 1 }, 101)), false);
});

test('frames from other channels are ignored once the game channel is known', () => {
  const t = newGame();
  const before = t.summary();
  const ok = t.handleFrame(frame(G.GameStateUpdated, { diff: { gameLogState: { 5: log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Ore], distributionType: 1 }) } } }, 101, 133));
  assert.equal(ok, false);
  assert.deepEqual(t.summary().players[0].cells, before.players[0].cells);
});

test('spectator: closed steals still tracked, thief/victim variants ignored safely', () => {
  const t = newGame({ me: 0 });
  assert.equal(t.isSpectator, true);
  t.__logIdx = -1;
  logs(t, [
    log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Ore], distributionType: 1 }),
    log(L.StolenResourceCardClosed, { playerColorThief: GREEN, playerColorVictim: RED, cardBacks: [0] }),
    log(L.StolenResourceCardThief, { playerColor: RED, cardEnums: [C.Ore] }),
  ]);
  assert.equal(cellOf(t, 'Bot2', 4).min, 1);
  assert.ok(t.warnings.some((w) => w.code === 'steal-unattributed'));
});

test('dev card expectations use the remaining deck composition', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [
    log(L.ResourceDistribution, { playerColor: RED, cardsToBroadcast: [C.Wool, C.Grain, C.Ore, C.Wool, C.Grain, C.Ore], distributionType: 1 }),
    log(L.BoughtDevelopmentCard, { playerColor: RED }),
    log(L.BoughtDevelopmentCard, { playerColor: RED }),
    log(L.PlayerPlayedDevelopmentCard, { playerColor: RED, cardEnum: C.Knight }),
  ]);
  const s = t.summary();
  assert.equal(s.players[0].dev.hand, 1);
  assert.equal(s.players[0].dev.knights, 1);
  assert.equal(s.devPool.unknown, 24);
  assert.ok(Math.abs(s.players[0].dev.expectedVP - 5 / 24) < 1e-9);
  // server data wins when present (fixture still says 25)...
  assert.equal(s.devBank, 25);
  update(t, { mechanicDevelopmentCardsState: { bankDevelopmentCards: { 10: 23 }, players: { [RED]: { developmentCards: { 10: 1 }, developmentCardsUsed: [C.Knight] } } } });
  const s2 = t.summary();
  assert.equal(s2.devBank, 23);
  assert.equal(s2.players[0].dev.hand, 1);
  assert.deepEqual(s2.players[0].dev.used, [C.Knight]);
  // ...and the log-derived count is the fallback without server data
  delete t.state.mechanicDevelopmentCardsState;
  assert.equal(t.summary().devBank, 23);
});

test('game end is detected from the log and from GameEndState', () => {
  const t = newGame();
  t.__logIdx = -1;
  logs(t, [log(L.PlayerWonTheGame, { playerColor: GREEN })]);
  assert.equal(t.phase, 'ended');
  assert.equal(t.winner, 'Bot2');
  const t2 = newGame();
  t2.handleFrame(frame(G.GameEndState, { winner: 1 }, 101));
  assert.equal(t2.phase, 'ended');
});

test('standings are computed from victoryPointsState and the winner', () => {
  const t = newGame();
  t.__logIdx = -1;
  update(t, { playerStates: {
    [RED]: { victoryPointsState: { 0: 2, 1: 2, 4: 1 } },      // 2+4+2 = 8
    [BLUE]: { victoryPointsState: { 0: 3, 2: 2 } },           // 3 + 2 private = 5
    [ORANGE]: { victoryPointsState: { 0: 2, 3: 1 } },         // 2 + 2 = 4
    [GREEN]: { victoryPointsState: { 0: 5, 1: 2, 2: 1 } }     // 5+4+1 = 10
  } });
  logs(t, [log(L.PlayerWonTheGame, { playerColor: GREEN })]);
  const st = t.summary().standings;
  assert.deepEqual(st.map((x) => [x.rank, x.color, x.vp]), [[1, GREEN, 10], [2, RED, 8], [3, BLUE, 5], [4, ORANGE, 4]]);
  assert.equal(st[0].winner, true);
  assert.equal(st[2].publicVp, 3);
});
