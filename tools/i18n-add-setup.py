"""One-off: 'setup' status shown during the initial placement (before the first dice roll)."""
import json, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "i18n")
SETUP = dict(en="setup", es="colocación inicial", de="Aufbau", fr="placement initial", it="piazzamento iniziale", pt_BR="posicionamento inicial", pt_PT="colocação inicial", ro="așezare inițială", ru="расстановка", tr="kurulum", pl="rozstawienie", nl="opzet", ms="penempatan awal", ko="초기 배치", ja="初期配置", zh_CN="初始布局")
for f in sorted(os.listdir(I18N)):
    if not f.endswith(".json") or f.startswith("_"): continue
    loc = f[:-5]; p = os.path.join(I18N, f)
    d = json.load(open(p, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
    out = collections.OrderedDict()
    for k, v in d.items():
        out[k] = v
        if k == "round": out["setup"] = SETUP[loc]
    open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
mp = os.path.join(I18N, "_meta.json")
meta = json.load(open(mp, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
meta["keys"]["setup"] = {"note": "Status shown instead of the round number while players place their initial settlements (before the first dice roll).", "maxLength": 24}
open(mp, "w", encoding="utf-8", newline="\n").write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
print("ok")
