/*
 * WorldSet: exact probabilistic tracking of every player's hand.
 *
 * A "world" is one fully specified assignment of cards to players. Every event
 * whose outcome is public (distribution, build, trade, discard...) transforms
 * all worlds identically. An event whose outcome is hidden (a robber steal
 * between two opponents) branches each world into one child per card type the
 * victim could have lost, weighted by the probability of that card being
 * drawn. Later public events prune worlds that turn out to be impossible
 * (a player spends a card they would not have in that world), which is how
 * uncertainty resolves over time.
 *
 * Hand layout per player: 8 card types (see CCT.Protocol.TYPES) plus one
 * "unknown type" slot used only when the server reports cards we could not
 * account for.
 */
var CCT = globalThis.CCT || (globalThis.CCT = {});

CCT.WorldSet = (function () {
  'use strict';

  var K = 9;
  var UNK = 8;

  function WorldSet(playerCount, opts) {
    this.n = playerCount;
    this.k = K;
    this.maxWorlds = (opts && opts.maxWorlds) || 3000;
    this.approx = false;
    this.contradictions = 0;
    var h = new Array(playerCount * K).fill(0);
    this.worlds = new Map();
    this.worlds.set(h.join(','), { h: h, w: 1 });
  }

  WorldSet.prototype.size = function () { return this.worlds.size; };

  WorldSet.prototype.addPlayer = function () {
    var out = [];
    this.worlds.forEach(function (wd) {
      var h = wd.h.slice();
      for (var t = 0; t < K; t++) h.push(0);
      out.push({ h: h, w: wd.w });
    });
    this.n += 1;
    this.worlds = rebuild(out);
  };

  function rebuild(list) {
    var m = new Map();
    var sum = 0;
    for (var i = 0; i < list.length; i++) {
      var wd = list[i];
      var key = wd.h.join(',');
      var ex = m.get(key);
      if (ex) ex.w += wd.w; else m.set(key, wd);
      sum += wd.w;
    }
    if (m.size === 0) return null;
    if (sum > 0 && Math.abs(sum - 1) > 1e-12) {
      m.forEach(function (wd) { wd.w /= sum; });
    }
    return m;
  }

  WorldSet.prototype._commit = function (list) {
    var m = rebuild(list);
    if (!m) return false;
    this.worlds = m;
    this._prune();
    return true;
  };

  WorldSet.prototype._prune = function () {
    if (this.worlds.size <= this.maxWorlds) return;
    var arr = Array.from(this.worlds.values()).sort(function (a, b) { return b.w - a.w; });
    arr = arr.slice(0, this.maxWorlds);
    this.approx = true;
    this.worlds = rebuild(arr);
  };

  /**
   * Add `delta` (array of length K, negatives allowed) to player p.
   * Worlds where the player cannot pay are dropped. If a shortfall can be
   * covered by the unknown-type slot, those cards are converted instead.
   * Returns false (and clamps at zero) only when every world is contradicted.
   */
  WorldSet.prototype.add = function (p, delta) {
    var out = [];
    var base = p * K;
    this.worlds.forEach(function (wd) {
      var h = wd.h.slice();
      var ok = true;
      for (var t = 0; t < K; t++) {
        var d = delta[t] || 0;
        if (!d) continue;
        var i = base + t;
        h[i] += d;
        if (h[i] < 0) {
          var need = -h[i];
          if (t !== UNK && h[base + UNK] >= need) {
            h[base + UNK] -= need;
            h[i] = 0;
          } else {
            ok = false;
            break;
          }
        }
      }
      if (ok) out.push({ h: h, w: wd.w });
    });
    if (out.length > 0) return this._commit(out);

    // Contradiction: nothing we tracked allows this. Clamp and carry on.
    this.contradictions++;
    this.worlds.forEach(function (wd) {
      var h = wd.h.slice();
      for (var t = 0; t < K; t++) {
        var d = delta[t] || 0;
        if (!d) continue;
        h[base + t] = Math.max(0, h[base + t] + d);
      }
      out.push({ h: h, w: wd.w });
    });
    this._commit(out);
    return false;
  };

  /** Move `vec` from player `from` to player `to`. */
  WorldSet.prototype.transfer = function (from, to, vec) {
    var neg = vec.map(function (v) { return -v; });
    var a = this.add(from, neg);
    var b = this.add(to, vec);
    return a && b;
  };

  /**
   * Hidden steal of `count` random cards from `victim` to `thief`.
   * thief < 0 means the cards leave play (used for unexplained losses).
   */
  WorldSet.prototype.steal = function (thief, victim, count) {
    var vb = victim * K;
    var ok = true;
    for (var c = 0; c < (count || 1); c++) {
      var out = [];
      this.worlds.forEach(function (wd) {
        var total = 0;
        for (var t = 0; t < K; t++) total += wd.h[vb + t];
        if (total === 0) return;
        for (var t2 = 0; t2 < K; t2++) {
          var cnt = wd.h[vb + t2];
          if (!cnt) continue;
          var h = wd.h.slice();
          h[vb + t2]--;
          if (thief >= 0) h[thief * K + t2]++;
          out.push({ h: h, w: wd.w * cnt / total });
        }
      });
      if (out.length === 0) { this.contradictions++; ok = false; continue; }
      this._commit(out);
    }
    return ok;
  };

  /** Monopoly: player p takes every card of type t; the log says how many. */
  WorldSet.prototype.monopoly = function (p, t, amount) {
    var n = this.n;
    var out = [];
    this.worlds.forEach(function (wd) {
      var sum = 0;
      for (var q = 0; q < n; q++) if (q !== p) sum += wd.h[q * K + t];
      if (sum !== amount) return;
      out.push({ h: moveAll(wd.h, n, p, t), w: wd.w });
    });
    if (out.length > 0) return this._commit(out);

    // Relaxed: unknown-type cards on other players may be the missing ones.
    this.worlds.forEach(function (wd) {
      var sum = 0, unk = 0;
      for (var q = 0; q < n; q++) if (q !== p) { sum += wd.h[q * K + t]; unk += wd.h[q * K + UNK]; }
      if (sum > amount || sum + unk < amount) return;
      var h = moveAll(wd.h, n, p, t);
      var deficit = amount - sum;
      for (var q2 = 0; q2 < n && deficit > 0; q2++) {
        if (q2 === p) continue;
        var take = Math.min(deficit, h[q2 * K + UNK]);
        h[q2 * K + UNK] -= take;
        h[p * K + t] += take;
        deficit -= take;
      }
      out.push({ h: h, w: wd.w });
    });
    if (out.length > 0) { this.approx = true; return this._commit(out); }

    // Contradiction: apply what the log says regardless.
    this.contradictions++;
    this.worlds.forEach(function (wd) {
      var h = moveAll(wd.h, n, p, t);
      var got = 0;
      for (var q = 0; q < n; q++) if (q !== p) got += wd.h[q * K + t];
      h[p * K + t] += amount - got;
      out.push({ h: h, w: wd.w });
    });
    this._commit(out);
    return false;
  };

  function moveAll(src, n, p, t) {
    var h = src.slice();
    for (var q = 0; q < n; q++) {
      if (q === p) continue;
      h[p * K + t] += h[q * K + t];
      h[q * K + t] = 0;
    }
    return h;
  }

  /** Evidence: player p holds at least `vec` (e.g. a trade offer). */
  WorldSet.prototype.requireAtLeast = function (p, vec) {
    var base = p * K;
    var out = [];
    this.worlds.forEach(function (wd) {
      var deficit = 0;
      for (var t = 0; t < UNK; t++) {
        var need = (vec[t] || 0) - wd.h[base + t];
        if (need > 0) deficit += need;
      }
      if (deficit <= wd.h[base + UNK]) out.push(wd);
    });
    if (out.length === 0 || out.length === this.worlds.size) return out.length > 0;
    return this._commit(out);
  };

  /** Evidence: player p holds exactly `total` cards (server hand count). */
  WorldSet.prototype.requireTotal = function (p, total) {
    var base = p * K;
    var out = [];
    this.worlds.forEach(function (wd) {
      var sum = 0;
      for (var t = 0; t < K; t++) sum += wd.h[base + t];
      if (sum === total) out.push(wd);
    });
    if (out.length === 0) return false;
    if (out.length === this.worlds.size) return true;
    return this._commit(out);
  };

  /** Evidence: player p hand is exactly `vec` over the 8 known types. */
  WorldSet.prototype.requireExact = function (p, vec) {
    var base = p * K;
    var out = [];
    this.worlds.forEach(function (wd) {
      for (var t = 0; t < UNK; t++) if (wd.h[base + t] !== (vec[t] || 0)) return;
      if (wd.h[base + UNK] !== 0) return;
      out.push(wd);
    });
    if (out.length === 0) return false;
    if (out.length === this.worlds.size) return true;
    return this._commit(out);
  };

  /** Force player p hand to `vec` in every world (resync). */
  WorldSet.prototype.setExact = function (p, vec) {
    var base = p * K;
    var out = [];
    this.worlds.forEach(function (wd) {
      var h = wd.h.slice();
      for (var t = 0; t < K; t++) h[base + t] = vec[t] || 0;
      out.push({ h: h, w: wd.w });
    });
    this._commit(out);
  };

  /**
   * Make player p total match `total` in every world: surplus becomes
   * unknown-type cards, shortfall is removed as a weighted random loss.
   */
  WorldSet.prototype.adjustTotal = function (p, total) {
    var base = p * K;
    var self = this;
    var groups = new Map();
    this.worlds.forEach(function (wd) {
      var sum = 0;
      for (var t = 0; t < K; t++) sum += wd.h[base + t];
      var d = total - sum;
      if (!groups.has(d)) groups.set(d, []);
      groups.get(d).push(wd);
    });
    var out = [];
    groups.forEach(function (list, d) {
      if (d === 0) { out.push.apply(out, list); return; }
      if (d > 0) {
        list.forEach(function (wd) {
          var h = wd.h.slice();
          h[base + UNK] += d;
          out.push({ h: h, w: wd.w });
        });
        return;
      }
      // d < 0: lose |d| cards of unspecified type
      var sub = new WorldSet(self.n, { maxWorlds: self.maxWorlds });
      sub.worlds = rebuild(list.map(function (wd) { return { h: wd.h, w: wd.w }; }));
      var weight = 0;
      list.forEach(function (wd) { weight += wd.w; });
      sub.steal(-1, p, -d);
      sub.worlds.forEach(function (wd) { out.push({ h: wd.h, w: wd.w * weight }); });
    });
    this.approx = true;
    this._commit(out);
  };

  WorldSet.prototype.totals = function (p) {
    var base = p * K;
    var min = Infinity, max = -Infinity;
    this.worlds.forEach(function (wd) {
      var sum = 0;
      for (var t = 0; t < K; t++) sum += wd.h[base + t];
      if (sum < min) min = sum;
      if (sum > max) max = sum;
    });
    return [min, max];
  };

  /**
   * Per player, per type: { min, max, mean, dist: {count: probability} }.
   */
  WorldSet.prototype.marginals = function () {
    var n = this.n;
    var res = new Array(n);
    for (var p = 0; p < n; p++) {
      res[p] = new Array(K);
      for (var t = 0; t < K; t++) res[p][t] = { min: Infinity, max: -Infinity, mean: 0, dist: {} };
    }
    this.worlds.forEach(function (wd) {
      for (var p2 = 0; p2 < n; p2++) {
        for (var t2 = 0; t2 < K; t2++) {
          var c = wd.h[p2 * K + t2];
          var cell = res[p2][t2];
          if (c < cell.min) cell.min = c;
          if (c > cell.max) cell.max = c;
          cell.mean += c * wd.w;
          cell.dist[c] = (cell.dist[c] || 0) + wd.w;
        }
      }
    });
    return res;
  };

  WorldSet.prototype.snapshot = function () {
    var arr = [];
    this.worlds.forEach(function (wd) { arr.push({ h: wd.h.slice(), w: wd.w }); });
    return arr;
  };

  WorldSet.K = K;
  WorldSet.UNK = UNK;
  return WorldSet;
})();
