#!/usr/bin/env python3
"""Reader for .cctr.gz recordings produced by Colonist Card Tracker.

    python tools/cctr_reader.py game.cctr.gz --summary
    python tools/cctr_reader.py game.cctr.gz --jsonl > frames.jsonl
    python tools/cctr_reader.py game.cctr.gz --events         # decoded game log + chat, in order

Requires:  pip install msgpack

Container layout (after gunzip):
    "CCTR" | u8 version | u32 metaLen | meta JSON | records...
    record: varint dtMs | u8 flags (1 = outbound, 2 = text) | varint len | bytes
"""
import argparse
import gzip
import json
import struct
import sys

try:
    import msgpack
except ImportError:  # pragma: no cover
    msgpack = None

# Mirror of src/protocol.js (log entry types that matter for a dataset)
LOG_TYPES = {
    1: "BoughtDevelopmentCard", 4: "PlayerPlacedPiece", 5: "BuiltPiece", 10: "RolledDice", 11: "MovedRobber",
    13: "ReceivedCard", 14: "StolenResourceCardThief", 15: "StolenResourceCardVictim", 16: "StolenResourceCardClosed",
    20: "PlayerPlayedDevelopmentCard", 21: "YearOfPlentyTookFromBank", 44: "Separator", 45: "PlayerWonTheGame",
    47: "ResourceDistribution", 55: "PlayerDiscarded", 86: "PlayerStoleUsingMonopoly", 115: "PlayerTradedWithPlayer",
    116: "PlayerTradedWithBank", 117: "PlayerWantsToCounterOfferWith", 118: "PlayerWantsToTradeWith",
    141: "DiceRolledAutomatically",
}
GAME_MSG = {1: "FirstGameState", 4: "BuildGame", 45: "GameEndState", 91: "GameStateUpdated", 92: "ReplayData"}


def read_varint(buf, pos):
    n, mul = 0, 1
    while True:
        b = buf[pos]
        pos += 1
        n += (b & 0x7F) * mul
        mul *= 128
        if not (b & 0x80):
            return n, pos


def read_container(data):
    if data[:4] != b"CCTR":
        raise ValueError("not a CCTR container")
    version = data[4]
    (meta_len,) = struct.unpack(">I", data[5:9])
    meta = json.loads(data[9:9 + meta_len].decode("utf-8"))
    pos = 9 + meta_len
    t = meta.get("startedAt", 0)
    records = []
    while pos < len(data):
        dt, pos = read_varint(data, pos)
        t += dt
        flags = data[pos]
        pos += 1
        ln, pos = read_varint(data, pos)
        records.append({"t": t, "dir": "out" if flags & 1 else "in", "kind": "text" if flags & 2 else "bin",
                        "bytes": data[pos:pos + ln]})
        pos += ln
    return version, meta, records


def decode(rec):
    if rec["kind"] == "text":
        txt = rec["bytes"].decode("utf-8", "replace")
        try:
            return json.loads(txt)
        except ValueError:
            return txt
    if msgpack is None:
        raise SystemExit("pip install msgpack")
    return msgpack.unpackb(rec["bytes"], raw=False, strict_map_key=False)


def chat_event(idx, entry, color_to_pseudo):
    text = entry.get("text") or {}
    color = text.get("from")
    return {"index": idx, "type": text.get("type"), "from": color, "fromPseudo": color_to_pseudo.get(color),
            "message": text.get("message"), "recipients": entry.get("recipients"), "toSpectators": entry.get("toSpectators")}


def iter_events(records, meta=None):
    """Yield (t, dir, kind, payload) for game-relevant content in order."""
    color_to_pseudo = {p.get("color"): p.get("pseudo") for p in (meta or {}).get("players") or []}
    for rec in records:
        val = decode(rec)
        if rec["dir"] == "out":
            yield rec["t"], "out", "action", val
            continue
        data = val.get("data") if isinstance(val, dict) else None
        if not isinstance(data, dict):
            continue
        mtype = data.get("type")
        payload = data.get("payload")
        if mtype == 4 and isinstance(payload, dict):
            yield rec["t"], "in", "build", {k: payload.get(k) for k in ("playOrder", "playerColor", "playerUserStates", "gameSettings")}
            gs = payload.get("gameState") or {}
            for idx, entry in sorted(((int(k), v) for k, v in (gs.get("gameLogState") or {}).items())):
                yield rec["t"], "in", "log", {"index": idx, **(entry.get("text") or {})}
            for idx, entry in sorted(((int(k), v) for k, v in (gs.get("gameChatState") or {}).items())):
                yield rec["t"], "in", "chat", chat_event(idx, entry, color_to_pseudo)
        elif mtype == 91 and isinstance(payload, dict):
            diff = payload.get("diff") or {}
            for idx, entry in sorted(((int(k), v) for k, v in (diff.get("gameLogState") or {}).items() if v)):
                yield rec["t"], "in", "log", {"index": idx, **(entry.get("text") or {})}
            for idx, entry in sorted(((int(k), v) for k, v in (diff.get("gameChatState") or {}).items() if v)):
                yield rec["t"], "in", "chat", chat_event(idx, entry, color_to_pseudo)
            if "tradeState" in diff:
                yield rec["t"], "in", "trade", diff["tradeState"]
            if "playerStates" in diff:
                yield rec["t"], "in", "players", diff["playerStates"]
        elif mtype == 45:
            yield rec["t"], "in", "end", payload
        elif mtype == 92:
            yield rec["t"], "in", "replay", payload


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("file")
    ap.add_argument("--summary", action="store_true")
    ap.add_argument("--jsonl", action="store_true", help="dump every decoded frame as JSON lines")
    ap.add_argument("--events", action="store_true", help="dump log/chat/trade/action events as JSON lines")
    args = ap.parse_args()

    with gzip.open(args.file, "rb") as f:
        data = f.read()
    version, meta, records = read_container(data)

    if args.summary or not (args.jsonl or args.events):
        n_in = sum(1 for r in records if r["dir"] == "in")
        n_out = len(records) - n_in
        print(f"format v{version}  frames={len(records)} (in={n_in}, out={n_out})  raw={len(data)} bytes")
        print(json.dumps(meta, indent=2, ensure_ascii=False))
        if meta.get("standings"):
            pseudo = {p.get("color"): p.get("pseudo") for p in meta.get("players") or []}
            print("standings:")
            for row in meta["standings"]:
                win = "  (winner)" if row["color"] == meta.get("winnerColor") else ""
                print(f"  #{row['rank']}  color {row['color']}  {pseudo.get(row['color'])}  {row['vp']} VP{win}")
        if msgpack is not None:
            counts = {}
            for _, d, kind, payload in iter_events(records, meta):
                key = kind if kind != "log" else "log:" + LOG_TYPES.get(payload.get("type"), str(payload.get("type")))
                counts[key] = counts.get(key, 0) + 1
            for k, v in sorted(counts.items(), key=lambda kv: -kv[1]):
                print(f"  {v:6d}  {k}")

    if args.jsonl:
        for rec in records:
            print(json.dumps({"t": rec["t"], "dir": rec["dir"], "kind": rec["kind"], "value": decode(rec)}, ensure_ascii=False, default=str))

    if args.events:
        for t, d, kind, payload in iter_events(records, meta):
            print(json.dumps({"t": t, "dir": d, "kind": kind, "payload": payload}, ensure_ascii=False, default=str))


if __name__ == "__main__":
    main()
