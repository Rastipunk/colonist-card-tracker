"""One-off: add the 'round' key (status line shows rounds, not per-player turns)."""
import json, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "i18n")
ROUND = dict(en="round", es="ronda", de="Runde", fr="tour de table", it="giro", pt_BR="rodada", pt_PT="ronda", ro="rundă", ru="раунд", tr="tur", pl="runda", nl="ronde", ms="pusingan", ko="라운드", ja="ラウンド", zh_CN="第 {n} 轮")
for f in sorted(os.listdir(I18N)):
    if not f.endswith(".json") or f.startswith("_"): continue
    loc = f[:-5]; p = os.path.join(I18N, f)
    d = json.load(open(p, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
    out = collections.OrderedDict()
    for k, v in d.items():
        out[k] = v
        if k == "turn": out["round"] = ROUND[loc].replace(" {n}", "")
    open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
mp = os.path.join(I18N, "_meta.json")
meta = json.load(open(mp, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
meta["keys"]["round"] = {"note": "Status prefix before the round number (one round = every player has taken a turn), e.g. 'round 12'.", "maxLength": 16}
open(mp, "w", encoding="utf-8", newline="\n").write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
print("ok")
