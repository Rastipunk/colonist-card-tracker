/*
 * Tracker: turns decoded colonist.io game frames into a card count.
 *
 *  - BuildGame (type 4) carries the full game state, including the complete
 *    log so far, so a page refresh mid-game rebuilds everything.
 *  - GameStateUpdated (type 91) carries a JSON-merge-patch style diff. New log
 *    entries arrive under diff.gameLogState; per-player hand sizes under
 *    diff.playerStates[color].resourceCards; bank under diff.bankState.
 *
 * Every log entry is structured ({ text: { type, playerColor, cardEnums... } }),
 * so nothing here depends on the rendered DOM or on the UI language.
 */
var CCT = globalThis.CCT || (globalThis.CCT = {});

CCT.Tracker = (function () {
  'use strict';

  var P = CCT.Protocol;
  var L = P.Log;
  var Card = P.Card;
  var K = P.K;
  var UNK = P.UNKNOWN;
  var MAX_EVENTS = 600;
  var MAX_WARNINGS = 200;

  function isObj(x) { return x !== null && typeof x === 'object' && !Array.isArray(x); }

  function clone(x) {
    if (typeof structuredClone === 'function') return structuredClone(x);
    return JSON.parse(JSON.stringify(x));
  }

  /** JSON-merge-patch as implemented by the colonist client. */
  function merge(target, patch) {
    for (var k in patch) {
      if (!Object.prototype.hasOwnProperty.call(patch, k)) continue;
      var v = patch[k];
      if (v === null || v === undefined) {
        delete target[k];
      } else if (isObj(v)) {
        if (!isObj(target[k])) target[k] = {};
        merge(target[k], v);
      } else {
        target[k] = v;
      }
    }
    return target;
  }

  function zeros() { return new Array(K).fill(0); }

  function vec(enums) {
    var v = zeros();
    if (!Array.isArray(enums)) return v;
    for (var i = 0; i < enums.length; i++) {
      var idx = P.typeIndex(Number(enums[i]));
      if (idx >= 0) v[idx]++;
    }
    return v;
  }

  function neg(v) { return v.map(function (x) { return -x; }); }
  function isZero(v) { for (var i = 0; i < v.length; i++) if (v[i]) return false; return true; }

  /** Normalise a card container ({enum: count}, [enum...] or {cards: [...]}) to {enum: count}. */
  function cardCounts(x) {
    var out = {};
    if (Array.isArray(x)) {
      for (var i = 0; i < x.length; i++) { var e = Number(x[i]); if (Number.isFinite(e)) out[e] = (out[e] || 0) + 1; }
      return out;
    }
    if (!isObj(x)) return out;
    if (Array.isArray(x.cards)) return cardCounts(x.cards);
    for (var k in x) {
      var n = Number(x[k]);
      var key = Number(k);
      if (Number.isFinite(n) && Number.isFinite(key)) out[key] = (out[key] || 0) + n;
    }
    return out;
  }

  function sumCards(x) {
    if (x === null || typeof x !== 'object') return null;
    var c = cardCounts(x);
    var s = 0;
    for (var k in c) s += c[k];
    return s;
  }

  function Tracker(opts) {
    this.opts = opts || {};
    this.reset();
  }

  Tracker.prototype.reset = function () {
    this.phase = 'idle'; // idle | live | ended
    this.channelId = null;
    this.gameId = null;
    this.state = null;
    this.settings = null;
    this.mode = null;
    this.players = [];
    this.colorToIndex = {};
    this.myColor = null;
    this.isSpectator = true;
    this.worlds = null;
    this.processedLogs = new Set();
    this.lastLogIndex = -1;
    this.turn = 0;
    this.dice = { hist: {}, count: 0, byPlayer: {} };
    this.dev = { deck: null, players: {} };
    this.unknownSteals = [];
    this.freeRoads = {};
    this.warnings = [];
    this.events = [];
    this.pendingReconcile = false;
    this.seqExpected = null;
    this.seqPending = new Map();
    this.winner = null;
    this.builtAt = null;
    this.chatCount = 0;
  };

  Tracker.prototype.warn = function (code, info) {
    this.warnings.push({ t: Date.now(), code: code, info: info });
    if (this.warnings.length > MAX_WARNINGS) this.warnings.shift();
    if (this.opts.debug && typeof console !== 'undefined') console.warn('[CCT] ' + code, info);
  };

  Tracker.prototype.event = function (index, desc) {
    this.events.push({ i: index, d: desc });
    if (this.events.length > MAX_EVENTS) this.events.shift();
  };

  // ---------------------------------------------------------------- frames

  /**
   * Feed one decoded WebSocket frame ({ id, data }). Returns true when the
   * frame belonged to the game channel and was consumed.
   */
  Tracker.prototype.handleFrame = function (msg) {
    if (!isObj(msg)) return false;
    var d = msg.data;
    if (!isObj(d) || typeof d.type !== 'number') return false;
    var id = msg.id;
    if (this.channelId !== null && id !== undefined && String(id) !== String(this.channelId)) return false;
    var p = d.payload;

    if (d.type === P.GameMsg.BuildGame && isObj(p) && isObj(p.gameState)) {
      this.channelId = id === undefined ? null : id;
      this.buildGame(p);
      this.seqExpected = typeof d.sequence === 'number' ? d.sequence + 1 : null;
      this.seqPending.clear();
      return true;
    }
    if (d.type === P.GameMsg.FirstGameState && isObj(p) && p.databaseGameId != null) {
      this.gameId = p.databaseGameId;
      if (id !== undefined) this.channelId = id;
      return true;
    }
    if (this.phase === 'idle') return false;

    if (typeof d.sequence === 'number' && this.seqExpected !== null) {
      if (d.sequence < this.seqExpected) return false;
      if (d.sequence > this.seqExpected) {
        this.seqPending.set(d.sequence, d);
        if (this.seqPending.size > 25) this.flushPending();
        return true;
      }
      this._dispatch(d);
      this.seqExpected = d.sequence + 1;
      while (this.seqPending.has(this.seqExpected)) {
        var next = this.seqPending.get(this.seqExpected);
        this.seqPending.delete(this.seqExpected);
        this._dispatch(next);
        this.seqExpected++;
      }
      return true;
    }
    this._dispatch(d);
    return true;
  };

  /** Process out-of-order frames that never got their predecessor. */
  Tracker.prototype.flushPending = function () {
    if (this.seqPending.size === 0) return;
    var keys = Array.from(this.seqPending.keys()).sort(function (a, b) { return a - b; });
    this.warn('sequence-gap', { expected: this.seqExpected, pending: keys });
    for (var i = 0; i < keys.length; i++) {
      this._dispatch(this.seqPending.get(keys[i]));
      this.seqExpected = keys[i] + 1;
    }
    this.seqPending.clear();
  };

  Tracker.prototype._dispatch = function (d) {
    var p = d.payload;
    switch (d.type) {
      case P.GameMsg.GameStateUpdated:
        if (isObj(p) && isObj(p.diff)) this.applyDiff(p.diff);
        break;
      case P.GameMsg.GameEndState:
        this.phase = 'ended';
        break;
      default:
        break;
    }
  };

  // ------------------------------------------------------------ game setup

  Tracker.prototype.buildGame = function (p) {
    var gameId = this.gameId;
    var channelId = this.channelId;
    this.reset();
    this.gameId = gameId;
    this.channelId = channelId;
    this.phase = 'live';
    this.builtAt = Date.now();
    this.settings = isObj(p.gameSettings) ? p.gameSettings : null;
    this.mode = this.settings && typeof this.settings.modeSetting === 'number' ? this.settings.modeSetting : null;
    this.myColor = typeof p.playerColor === 'number' ? p.playerColor : null;

    var users = Array.isArray(p.playerUserStates) ? p.playerUserStates : [];
    var order = Array.isArray(p.playOrder) ? p.playOrder : [];
    var colors = [];
    var i, c;
    for (i = 0; i < order.length; i++) {
      c = Number(order[i]);
      if (Number.isFinite(c) && c !== 0 && colors.indexOf(c) < 0) colors.push(c);
    }
    for (i = 0; i < users.length; i++) {
      c = Number(users[i] && users[i].selectedColor);
      if (Number.isFinite(c) && c !== 0 && colors.indexOf(c) < 0) colors.push(c);
    }
    var ps = p.gameState.playerStates;
    if (isObj(ps)) {
      for (var k in ps) {
        c = Number(k);
        if (Number.isFinite(c) && c !== 0 && colors.indexOf(c) < 0) colors.push(c);
      }
    }
    this.players = [];
    for (i = 0; i < colors.length; i++) this._addPlayer(colors[i], users);

    this.isSpectator = this.myColor === null || this.colorToIndex[this.myColor] === undefined;
    this.worlds = new CCT.WorldSet(this.players.length, { maxWorlds: this.opts.maxWorlds });
    this.state = clone(p.gameState);
    if (this.mode !== P.Mode.CitiesAndKnights && this.mode !== P.Mode.CitiesAndKnightsSeafarers) {
      this.dev.deck = P.devDeck(this.players.length);
    }
    if (isObj(this.state.gameChatState)) this.chatCount = Object.keys(this.state.gameChatState).length;
    if (isObj(this.state.gameLogState)) this.processLogs(this.state.gameLogState);
    this.reconcile();
  };

  Tracker.prototype._addPlayer = function (color, users) {
    var u = null;
    if (Array.isArray(users)) {
      for (var i = 0; i < users.length; i++) {
        if (users[i] && Number(users[i].selectedColor) === color) { u = users[i]; break; }
      }
    }
    var idx = this.players.length;
    this.players.push({
      color: color,
      index: idx,
      username: (u && u.username) ? String(u.username) : ('Player ' + color),
      isBot: !!(u && u.isBot),
      userId: u ? u.userId : undefined,
      serverTotal: null,
      synced: null,
      desync: 0
    });
    this.colorToIndex[color] = idx;
    this.dev.players[idx] = { bought: 0, played: [], knights: 0 };
    if (this.worlds) this.worlds.addPlayer();
    return idx;
  };

  /** Player index for a color; unknown colors are added on the fly. */
  Tracker.prototype.pi = function (color) {
    if (typeof color !== 'number' || !Number.isFinite(color) || color === 0) return -1;
    var idx = this.colorToIndex[color];
    if (idx === undefined) {
      var users = this.state && Array.isArray(this.state.playerUserStates) ? this.state.playerUserStates : null;
      idx = this._addPlayer(color, users);
      this.warn('new-player', { color: color });
    }
    return idx;
  };

  // ------------------------------------------------------------- updates

  Tracker.prototype.applyDiff = function (diff) {
    if (!this.state) return;
    merge(this.state, diff);
    if (isObj(diff.gameChatState)) {
      for (var ck in diff.gameChatState) if (diff.gameChatState[ck] !== null) this.chatCount++;
    }
    if (isObj(diff.gameLogState)) this.processLogs(diff.gameLogState);
    if (diff.playerStates !== undefined || diff.bankState !== undefined || diff.mechanicDevelopmentCardsState !== undefined) {
      this.pendingReconcile = true;
    }
  };

  Tracker.prototype.processLogs = function (map) {
    var idxs = [];
    for (var k in map) {
      var n = Number(k);
      if (Number.isFinite(n)) idxs.push(n);
    }
    idxs.sort(function (a, b) { return a - b; });
    for (var i = 0; i < idxs.length; i++) {
      var idx = idxs[i];
      if (this.processedLogs.has(idx)) continue;
      var entry = map[idx];
      if (!isObj(entry)) continue;
      this.processedLogs.add(idx);
      if (idx > this.lastLogIndex) this.lastLogIndex = idx;
      try {
        this.processLog(idx, entry);
      } catch (err) {
        this.warn('log-error', { index: idx, error: String(err && err.stack || err) });
      }
    }
  };

  Tracker.prototype.processLog = function (i, entry) {
    var t = entry.text;
    if (!isObj(t) || typeof t.type !== 'number') return;
    var W = this.worlds;
    var p, q, v, given, received, count, ok;
    var me = this.isSpectator ? -1 : this.colorToIndex[this.myColor];

    switch (t.type) {
      case L.ResourceDistribution:
        p = this.pi(t.playerColor);
        v = vec(t.cardsToBroadcast);
        if (p >= 0 && !isZero(v)) { W.add(p, v); this.event(i, 'gain ' + this.name(p) + ' ' + fmt(v)); }
        break;

      case L.ReceivedCard:
        p = this.pi(t.playerColor);
        v = vec([t.cardEnum]);
        if (p >= 0 && !isZero(v)) { W.add(p, v); this.event(i, 'received ' + this.name(p) + ' ' + fmt(v)); }
        break;

      case L.YearOfPlentyTookFromBank:
        p = this.pi(t.playerColor);
        v = vec(t.cardEnums);
        if (p >= 0 && !isZero(v)) { W.add(p, v); this.event(i, 'yop ' + this.name(p) + ' ' + fmt(v)); }
        break;

      case L.PlayerDiscarded:
        p = this.pi(t.playerColor);
        v = vec(t.cardEnums);
        if (p >= 0 && !isZero(v)) { ok = W.add(p, neg(v)); this.event(i, 'discard ' + this.name(p) + ' ' + fmt(v) + (ok ? '' : ' !')); }
        break;

      case L.BoughtDevelopmentCard:
        p = this.pi(t.playerColor);
        if (p >= 0) {
          ok = W.add(p, neg(vec(P.DevCardCost)));
          this.dev.players[p].bought++;
          this.event(i, 'devcard ' + this.name(p) + (ok ? '' : ' !'));
        }
        break;

      case L.BuiltPiece:
        p = this.pi(t.playerColor);
        if (p >= 0) {
          var piece = Number(t.pieceEnum);
          var free = false;
          if ((piece === P.Piece.Road || piece === P.Piece.Ship) && this.freeRoads[p] > 0) {
            this.freeRoads[p]--;
            free = true;
          }
          var cost = P.PieceCost[piece];
          if (cost && !free) {
            ok = W.add(p, neg(vec(cost)));
            this.event(i, 'build ' + this.name(p) + ' piece' + piece + (ok ? '' : ' !'));
          } else {
            this.event(i, 'build(free) ' + this.name(p) + ' piece' + piece);
          }
        }
        break;

      case L.PlayerPlacedKnight:
      case L.UpgradedKnight:
        p = this.pi(t.playerColor);
        if (p >= 0) { ok = W.add(p, neg(vec(P.KnightCost))); this.event(i, 'knight ' + this.name(p) + (ok ? '' : ' !')); }
        break;

      case L.ActivatedKnight:
        p = this.pi(t.playerColor);
        if (p >= 0) { ok = W.add(p, neg(vec(P.KnightActivateCost))); this.event(i, 'activate knight ' + this.name(p) + (ok ? '' : ' !')); }
        break;

      case L.PlayerUpgradedImprovementTo:
        p = this.pi(t.playerColor);
        if (p >= 0) {
          var commodity = P.ImprovementCommodity[Number(t.improvementType)];
          var level = Number(t.newCityLevel);
          if (commodity && level > 0) {
            var cv = zeros();
            cv[P.typeIndex(commodity)] = -level;
            ok = W.add(p, cv);
            this.event(i, 'improvement ' + this.name(p) + ' L' + level + (ok ? '' : ' !'));
          }
        }
        break;

      case L.RolledDice:
      case L.DiceRolledAutomatically:
        this.recordDice(t);
        break;

      case L.StolenResourceCardThief:
        // "You stole X from <playerColor>"
        q = this.pi(t.playerColor);
        v = vec(t.cardEnums);
        if (me >= 0 && q >= 0 && !isZero(v)) {
          ok = W.transfer(q, me, v);
          this.event(i, 'steal ' + this.name(me) + ' <- ' + this.name(q) + ' ' + fmt(v) + (ok ? '' : ' !'));
        } else if (q >= 0) {
          this.warn('steal-unattributed', { index: i });
        }
        break;

      case L.StolenResourceCardVictim:
        // "<playerColor> stole X from you"
        p = this.pi(t.playerColor);
        v = vec(t.cardEnums);
        if (me >= 0 && p >= 0 && !isZero(v)) {
          ok = W.transfer(me, p, v);
          this.event(i, 'steal ' + this.name(p) + ' <- ' + this.name(me) + ' ' + fmt(v) + (ok ? '' : ' !'));
        } else if (p >= 0) {
          this.warn('steal-unattributed', { index: i });
        }
        break;

      case L.StolenResourceCardClosed:
        p = this.pi(t.playerColorThief);
        q = this.pi(t.playerColorVictim);
        count = Array.isArray(t.cardBacks) ? t.cardBacks.length : 1;
        if (p >= 0 && q >= 0 && p !== q && count > 0) {
          ok = W.steal(p, q, count);
          this.unknownSteals.push({ index: i, thief: p, victim: q, count: count });
          this.event(i, 'steal? ' + this.name(p) + ' <- ' + this.name(q) + ' x' + count + (ok ? '' : ' !'));
        }
        break;

      case L.PlayerStoleUsingMonopoly:
        p = this.pi(t.playerColor);
        var ti = P.typeIndex(Number(t.cardEnum));
        count = Number(t.amountStolen);
        if (p >= 0 && ti >= 0 && ti !== UNK && Number.isFinite(count)) {
          ok = W.monopoly(p, ti, count);
          this.event(i, 'monopoly ' + this.name(p) + ' ' + P.TYPE_NAMES[ti] + ' x' + count + (ok ? '' : ' !'));
        }
        break;

      case L.PlayerPlayedDevelopmentCard:
        p = this.pi(t.playerColor);
        if (p >= 0) {
          var ce = Number(t.cardEnum);
          this.dev.players[p].played.push(ce);
          if (ce === Card.Knight) this.dev.players[p].knights++;
          if (ce === Card.RoadBuilding) this.freeRoads[p] = 2;
          this.event(i, 'played ' + this.name(p) + ' card' + ce);
        }
        break;

      case L.PlayerTradedWithPlayer:
        p = this.pi(t.playerColor);
        q = this.pi(t.acceptingPlayerColor);
        given = vec(t.givenCardEnums);
        received = vec(t.receivedCardEnums);
        if (p >= 0 && q >= 0 && p !== q) {
          ok = true;
          if (!isZero(given)) ok = W.transfer(p, q, given) && ok;
          if (!isZero(received)) ok = W.transfer(q, p, received) && ok;
          this.event(i, 'trade ' + this.name(p) + ' gives ' + fmt(given) + ' gets ' + fmt(received) + ' with ' + this.name(q) + (ok ? '' : ' !'));
        }
        break;

      case L.PlayerTradedWithBank:
        p = this.pi(t.playerColor);
        given = vec(t.givenCardEnums);
        received = vec(t.receivedCardEnums);
        if (p >= 0) {
          ok = true;
          if (!isZero(given)) ok = W.add(p, neg(given)) && ok;
          if (!isZero(received)) ok = W.add(p, received) && ok;
          this.event(i, 'bank ' + this.name(p) + ' gives ' + fmt(given) + ' gets ' + fmt(received) + (ok ? '' : ' !'));
        }
        break;

      case L.PlayerWantsToTradeWith:
        p = this.pi(t.playerColor);
        v = vec(t.offeredCardEnums);
        if (p >= 0 && !isZero(v)) { W.requireAtLeast(p, v); this.event(i, 'offer ' + this.name(p) + ' ' + fmt(v)); }
        break;

      case L.PlayerWantsToCounterOfferWith:
        p = this.pi(t.playerColorCreator);
        v = vec(t.offeredCardEnums);
        if (p >= 0 && !isZero(v)) { W.requireAtLeast(p, v); this.event(i, 'counter ' + this.name(p) + ' ' + fmt(v)); }
        break;

      case L.ExchangedCardsThief:
        // Cities & Knights (commercial harbor): I gave `given`, got `received` from playerColor.
        q = this.pi(t.playerColor);
        if (me >= 0 && q >= 0) {
          given = vec([t.givenCardEnum]);
          received = vec([t.receivedCardEnum]);
          if (!isZero(given)) W.transfer(me, q, given);
          if (!isZero(received)) W.transfer(q, me, received);
          this.event(i, 'exchange ' + this.name(me) + ' <-> ' + this.name(q));
        }
        break;

      case L.ExchangedCardsVictim:
        p = this.pi(t.playerColor);
        if (me >= 0 && p >= 0) {
          given = vec([t.givenCardEnum]);
          received = vec([t.receivedCardEnum]);
          if (!isZero(given)) W.transfer(p, me, given);
          if (!isZero(received)) W.transfer(me, p, received);
          this.event(i, 'exchange ' + this.name(p) + ' <-> ' + this.name(me));
        }
        break;

      case L.Separator:
        this.turn++;
        this.freeRoads = {};
        break;

      case L.PlayerWonTheGame:
        p = this.pi(t.playerColor);
        this.winner = p >= 0 ? this.name(p) : null;
        this.phase = 'ended';
        this.event(i, 'won ' + (this.winner || '?'));
        break;

      default:
        break;
    }
  };

  Tracker.prototype.recordDice = function (t) {
    var a = Number(t.firstDice), b = Number(t.secondDice);
    if (!Number.isFinite(a) || !Number.isFinite(b) || a < 1 || b < 1) return;
    var sum = a + b;
    this.dice.hist[sum] = (this.dice.hist[sum] || 0) + 1;
    this.dice.count++;
    var p = this.pi(t.playerColor);
    if (p >= 0) {
      if (!this.dice.byPlayer[p]) this.dice.byPlayer[p] = {};
      this.dice.byPlayer[p][sum] = (this.dice.byPlayer[p][sum] || 0) + 1;
    }
  };

  Tracker.prototype.name = function (idx) {
    var pl = this.players[idx];
    return pl ? pl.username : ('#' + idx);
  };

  function fmt(v) {
    var parts = [];
    for (var t = 0; t < K; t++) if (v[t]) parts.push((t === UNK ? '?' : P.TYPE_NAMES[t]) + ':' + v[t]);
    return parts.join(' ');
  }

  // ------------------------------------------------------------ reconcile

  /**
   * Compare our model with the hand sizes reported by the server and repair
   * differences. Call this a moment after the last frame so that the log entry
   * and the state diff for the same action have both arrived.
   */
  Tracker.prototype.reconcile = function () {
    this.pendingReconcile = false;
    if (!this.state || !this.worlds) return;
    var ps = this.state.playerStates;
    if (!isObj(ps)) return;
    for (var i = 0; i < this.players.length; i++) {
      var pl = this.players[i];
      var s = ps[pl.color];
      if (!isObj(s) || s.resourceCards === null || typeof s.resourceCards !== 'object') { pl.serverTotal = null; pl.synced = null; continue; }
      var rc = cardCounts(s.resourceCards);
      var total = 0, typed = 0, backs = 0;
      var exact = zeros();
      for (var k in rc) {
        var n = rc[k];
        if (n <= 0) continue;
        var e = Number(k);
        total += n;
        var ti = P.typeIndex(e);
        if (ti >= 0 && ti !== UNK) { exact[ti] += n; typed += n; } else backs += n;
      }
      pl.serverTotal = total;
      var fullyVisible = backs === 0 && (pl.color === this.myColor || typed > 0);
      if (fullyVisible) {
        if (this.worlds.requireExact(i, exact)) { pl.synced = true; continue; }
        this.worlds.setExact(i, exact);
        pl.desync++;
        pl.synced = false;
        this.warn('resync-exact', { player: pl.username, hand: exact });
        continue;
      }
      var tot = this.worlds.totals(i);
      if (tot[0] === total && tot[1] === total) { pl.synced = true; continue; }
      if (this.worlds.requireTotal(i, total)) { pl.synced = true; continue; }
      this.worlds.adjustTotal(i, total);
      pl.desync++;
      pl.synced = false;
      this.warn('resync-total', { player: pl.username, server: total, model: tot });
    }
  };

  // -------------------------------------------------------------- summary

  Tracker.prototype.devInfo = function () {
    var st = this.state && this.state.mechanicDevelopmentCardsState;
    var out = { available: false, bank: null, players: {} };
    if (!isObj(st)) return out;
    out.available = true;
    out.bank = sumCards(st.bankDevelopmentCards);
    if (isObj(st.players)) {
      for (var c in st.players) {
        var pst = st.players[c];
        if (!isObj(pst)) continue;
        var idx = this.colorToIndex[Number(c)];
        if (idx === undefined) continue;
        out.players[idx] = {
          hand: sumCards(pst.developmentCards),
          used: Array.isArray(pst.developmentCardsUsed) ? pst.developmentCardsUsed.slice() : null
        };
      }
    }
    return out;
  };

  Tracker.prototype.bankInfo = function () {
    var bs = this.state && this.state.bankState;
    var out = { available: false, hidden: false, cards: zeros() };
    if (!isObj(bs)) return out;
    out.hidden = !!bs.hideBankCards;
    if (bs.resourceCards === null || typeof bs.resourceCards !== 'object') return out;
    out.available = true;
    var rc = cardCounts(bs.resourceCards);
    for (var k in rc) {
      var ti = P.typeIndex(Number(k));
      if (ti >= 0) out.cards[ti] += rc[k];
    }
    return out;
  };

  /**
   * Victory points per player from the server state (public + private as far
   * as the server reveals them) and the resulting ranking.
   */
  Tracker.prototype.standings = function () {
    var ps = this.state && this.state.playerStates;
    var out = [];
    for (var i = 0; i < this.players.length; i++) {
      var pl = this.players[i];
      var st = isObj(ps) ? ps[pl.color] : null;
      var vps = st && st.victoryPointsState !== null && typeof st.victoryPointsState === 'object' ? cardCounts(st.victoryPointsState) : {};
      var pub = 0, total = 0;
      for (var k in vps) {
        var v = P.VPValue[Number(k)];
        if (v === undefined) continue;
        total += v * vps[k];
        if (!P.VPPrivate[Number(k)]) pub += v * vps[k];
      }
      out.push({ color: pl.color, index: i, vp: total, publicVp: pub, winner: this.winner === pl.username });
    }
    out.sort(function (a, b) { return (b.winner - a.winner) || (b.vp - a.vp) || (b.publicVp - a.publicVp); });
    for (var r = 0; r < out.length; r++) out[r].rank = r + 1;
    return out;
  };

  Tracker.prototype.summary = function () {
    var self = this;
    var marg = this.worlds ? this.worlds.marginals() : null;
    var devInfo = this.devInfo();
    var deck = this.dev.deck;
    var playedTotal = 0;
    var playedByType = {};
    var deckTotal = 0;
    if (deck) {
      for (var ce in deck) deckTotal += deck[ce];
      for (var pi = 0; pi < this.players.length; pi++) {
        var pd = this.dev.players[pi];
        if (!pd) continue;
        for (var j = 0; j < pd.played.length; j++) {
          playedTotal++;
          playedByType[pd.played[j]] = (playedByType[pd.played[j]] || 0) + 1;
        }
      }
    }
    var unknownDevPool = deck ? Math.max(0, deckTotal - playedTotal) : 0;
    var vpRemaining = deck ? deck[Card.VictoryPoint] : 0;

    var players = this.players.map(function (pl, idx) {
      var cells = marg ? marg[idx] : null;
      var pd = self.dev.players[idx] || { bought: 0, played: [], knights: 0 };
      var dv = devInfo.players[idx];
      var handDev = dv && dv.hand !== null && dv.hand !== undefined ? dv.hand : Math.max(0, pd.bought - pd.played.length);
      var used = dv && dv.used ? dv.used : pd.played;
      return {
        index: idx,
        color: pl.color,
        colorHex: P.ColorHex[pl.color] || '#999',
        username: pl.username,
        isBot: pl.isBot,
        isMe: !self.isSpectator && pl.color === self.myColor,
        serverTotal: pl.serverTotal,
        synced: pl.synced,
        desync: pl.desync,
        cells: cells ? cells.slice(0, UNK) : null,
        unknown: cells ? cells[UNK] : null,
        modelTotal: self.worlds ? self.worlds.totals(idx) : null,
        dev: {
          hand: handDev,
          used: used,
          knights: countIn(used, Card.Knight),
          expectedVP: unknownDevPool > 0 ? handDev * vpRemaining / unknownDevPool : 0
        }
      };
    });

    return {
      phase: this.phase,
      mode: this.mode,
      gameId: this.gameId,
      turn: this.turn,
      isSpectator: this.isSpectator,
      players: players,
      bank: this.bankInfo(),
      devBank: devInfo.available ? devInfo.bank : (deck ? Math.max(0, deckTotal - sumBought(this.dev.players)) : null),
      devPool: { unknown: unknownDevPool, vpRemaining: vpRemaining, playedByType: playedByType, deckTotal: deckTotal },
      dice: this.dice,
      unknownSteals: this.unknownSteals.length,
      worlds: this.worlds ? this.worlds.size() : 0,
      approx: this.worlds ? this.worlds.approx : false,
      contradictions: this.worlds ? this.worlds.contradictions : 0,
      warnings: this.warnings.length,
      winner: this.winner,
      standings: this.standings(),
      isCK: this.mode === P.Mode.CitiesAndKnights || this.mode === P.Mode.CitiesAndKnightsSeafarers
    };
  };

  function countIn(arr, value) {
    var n = 0;
    if (!Array.isArray(arr)) return 0;
    for (var i = 0; i < arr.length; i++) if (Number(arr[i]) === value) n++;
    return n;
  }

  function sumBought(players) {
    var n = 0;
    for (var k in players) n += players[k].bought;
    return n;
  }

  Tracker.merge = merge;
  Tracker.vec = vec;
  return Tracker;
})();
