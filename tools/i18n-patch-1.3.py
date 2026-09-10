"""One-off migration for 1.3.0: drop the dev-card abbreviations and add the keys of the
development-cards section and the collapsible stats. Run once: python tools/i18n-patch-1.3.py"""
import json, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "i18n")
DROP = ["devKnight", "devVP", "devMonopoly", "devRoadBuilding", "devYearOfPlenty"]
NEW = {
 "devKnightName":       dict(en="Knight", es="Caballero", de="Ritter", fr="Chevalier", it="Cavaliere", pt_BR="Cavaleiro", pt_PT="Cavaleiro", ro="Cavaler", ru="Рыцарь", tr="Şövalye", pl="Rycerz", nl="Ridder", ms="Kesateria", ko="기사", ja="騎士", zh_CN="骑士"),
 "devVPName":           dict(en="Victory point", es="Punto de victoria", de="Siegpunkt", fr="Point de victoire", it="Punto vittoria", pt_BR="Ponto de vitória", pt_PT="Ponto de vitória", ro="Punct de victorie", ru="Победное очко", tr="Zafer puanı", pl="Punkt zwycięstwa", nl="Overwinningspunt", ms="Mata kemenangan", ko="승점", ja="勝利点", zh_CN="胜利点"),
 "devMonopolyName":     dict(en="Monopoly", es="Monopolio", de="Monopol", fr="Monopole", it="Monopolio", pt_BR="Monopólio", pt_PT="Monopólio", ro="Monopol", ru="Монополия", tr="Tekel", pl="Monopol", nl="Monopolie", ms="Monopoli", ko="독점", ja="独占", zh_CN="垄断"),
 "devRoadBuildingName": dict(en="Road building", es="Construcción de carreteras", de="Straßenbau", fr="Construction de routes", it="Costruzione di strade", pt_BR="Construção de estradas", pt_PT="Construção de estradas", ro="Construirea drumurilor", ru="Строительство дорог", tr="Yol yapımı", pl="Budowa dróg", nl="Wegenbouw", ms="Pembinaan jalan", ko="도로 건설", ja="道路建設", zh_CN="道路建设"),
 "devYearOfPlentyName": dict(en="Year of plenty", es="Invento", de="Erfindung", fr="Année d'abondance", it="Anno di abbondanza", pt_BR="Invenção", pt_PT="Ano da fartura", ro="Anul abundenței", ru="Год изобилия", tr="Bolluk yılı", pl="Rok urodzaju", nl="Jaar van overvloed", ms="Tahun melimpah", ko="풍요의 해", ja="豊穣の年", zh_CN="丰年"),
 "devInHand":           dict(en="in hand", es="en mano", de="auf der Hand", fr="en main", it="in mano", pt_BR="na mão", pt_PT="na mão", ro="în mână", ru="на руках", tr="elde", pl="w ręce", nl="in de hand", ms="di tangan", ko="손에", ja="手札", zh_CN="手中"),
 "devPlayed":           dict(en="played", es="jugadas", de="gespielt", fr="jouées", it="giocate", pt_BR="jogadas", pt_PT="jogadas", ro="jucate", ru="сыграно", tr="oynanan", pl="zagrane", nl="gespeeld", ms="dimainkan", ko="사용", ja="使用済み", zh_CN="已打出"),
 "devNone":             dict(en="no cards played yet", es="ninguna jugada todavía", de="noch keine gespielt", fr="aucune jouée pour l'instant", it="nessuna giocata finora", pt_BR="nenhuma jogada ainda", pt_PT="ainda nenhuma jogada", ro="niciuna jucată încă", ru="пока не сыграно", tr="henüz oynanmadı", pl="jeszcze nie zagrano", nl="nog geen gespeeld", ms="belum ada yang dimainkan", ko="아직 사용 없음", ja="まだ使用なし", zh_CN="尚未打出"),
 "devDeck":             dict(en="in the deck", es="en el mazo", de="im Stapel", fr="dans la pioche", it="nel mazzo", pt_BR="no baralho", pt_PT="no baralho", ro="în pachet", ru="в колоде", tr="destede", pl="w talii", nl="in de stapel", ms="dalam dek", ko="덱에", ja="山札", zh_CN="牌堆中"),
 "moreStats":           dict(en="More stats", es="Más estadísticas", de="Mehr Statistiken", fr="Plus de statistiques", it="Altre statistiche", pt_BR="Mais estatísticas", pt_PT="Mais estatísticas", ro="Mai multe statistici", ru="Ещё статистика", tr="Daha fazla istatistik", pl="Więcej statystyk", nl="Meer statistieken", ms="Statistik lanjut", ko="통계 더 보기", ja="その他の統計", zh_CN="更多统计"),
}
NOTES = {
 "devKnightName": "Development card name (tooltip and revealed-cards list). Use colonist.io's term.",
 "devVPName": "Development card name: victory point card.",
 "devMonopolyName": "Development card name.",
 "devRoadBuildingName": "Development card name.",
 "devYearOfPlentyName": "Development card name. Colonist calls it 'Invento' in Spanish, 'Erfindung' in German.",
 "devInHand": "Suffix after a number in the development-cards section: '2 in hand'.",
 "devPlayed": "Label before the icons of the cards a player has played.",
 "devNone": "Shown in the development-cards section when nobody has played a card yet.",
 "devDeck": "Suffix after a number: '19 in the deck' (development cards left to buy).",
 "moreStats": "Title of the collapsible section with the dice histogram and tracker statistics.",
}
for f in sorted(os.listdir(I18N)):
    if not f.endswith(".json") or f.startswith("_"): continue
    loc = f[:-5]
    p = os.path.join(I18N, f)
    d = json.load(open(p, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
    out = collections.OrderedDict()
    for k, v in d.items():
        if k in DROP: continue
        out[k] = v
        if k == "resPaper":
            for nk, tr in NEW.items(): out[nk] = tr[loc]
    text = json.dumps(out, ensure_ascii=False, indent=2)
    # keep the blank-line grouping used by hand-written files (cosmetic)
    open(p, "w", encoding="utf-8", newline="\n").write(text + "\n")
    print("updated", f, len(out), "keys")
mp = os.path.join(I18N, "_meta.json")
meta = json.load(open(mp, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
for k in DROP: meta["keys"].pop(k, None)
for k, n in NOTES.items(): meta["keys"][k] = {"note": n, "maxLength": 40 if k.startswith("dev") else 32}
open(mp, "w", encoding="utf-8", newline="\n").write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
print("meta updated")
