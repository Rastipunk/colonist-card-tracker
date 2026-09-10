"""One-off: keys for the theme switch and the richer stats section."""
import json, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "i18n")
NEW = {
 "themeLight": dict(en="Light theme", es="Tema claro", de="Helles Design", fr="Thème clair", it="Tema chiaro", pt_BR="Tema claro", pt_PT="Tema claro", ro="Temă deschisă", ru="Светлая тема", tr="Açık tema", pl="Jasny motyw", nl="Licht thema", ms="Tema cerah", ko="밝은 테마", ja="ライトテーマ", zh_CN="浅色主题"),
 "themeDark": dict(en="Dark theme", es="Tema oscuro", de="Dunkles Design", fr="Thème sombre", it="Tema scuro", pt_BR="Tema escuro", pt_PT="Tema escuro", ro="Temă închisă", ru="Тёмная тема", tr="Koyu tema", pl="Ciemny motyw", nl="Donker thema", ms="Tema gelap", ko="어두운 테마", ja="ダークテーマ", zh_CN="深色主题"),
 "sevens": dict(en="sevens", es="sietes", de="Siebener", fr="sept", it="sette", pt_BR="setes", pt_PT="setes", ro="de șapte", ru="семёрок", tr="yedi", pl="siódemek", nl="zevens", ms="tujuh", ko="7", ja="7", zh_CN="个7"),
 "expected": dict(en="expected", es="esperados", de="erwartet", fr="attendus", it="attesi", pt_BR="esperados", pt_PT="esperados", ro="așteptate", ru="ожидалось", tr="beklenen", pl="oczekiwane", nl="verwacht", ms="dijangka", ko="예상", ja="期待値", zh_CN="预期"),
 "mostRolled": dict(en="most rolled", es="más frecuente", de="am häufigsten", fr="le plus fréquent", it="più frequente", pt_BR="mais frequente", pt_PT="mais frequente", ro="cel mai frecvent", ru="чаще всего", tr="en sık", pl="najczęstszy", nl="meest gegooid", ms="paling kerap", ko="최다", ja="最多", zh_CN="最常出现"),
}
NOTES = {
 "themeLight": "Tooltip of the theme button while the dark theme is active (click switches to light).",
 "themeDark": "Tooltip of the theme button while the light theme is active (click switches to dark).",
 "sevens": "Stats line: '5 sevens (12%)'.",
 "expected": "Stats line, after a number: '4.2 expected'. Also the tooltip of the thin expected-count marks in the dice histogram.",
 "mostRolled": "Stats line: 'most rolled 8 (×6)'.",
}
for f in sorted(os.listdir(I18N)):
    if not f.endswith(".json") or f.startswith("_"): continue
    loc = f[:-5]; p = os.path.join(I18N, f)
    d = json.load(open(p, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
    out = collections.OrderedDict()
    for k, v in d.items():
        out[k] = v
        if k == "moreStats":
            for nk, tr in NEW.items(): out[nk] = tr[loc]
    open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
mp = os.path.join(I18N, "_meta.json")
meta = json.load(open(mp, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
for k, n in NOTES.items(): meta["keys"][k] = {"note": n, "maxLength": 24}
open(mp, "w", encoding="utf-8", newline="\n").write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
print("ok")
