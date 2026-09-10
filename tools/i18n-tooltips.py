"""One-off: informative tooltips (rewrites several existing keys, adds a few, drops 'export')."""
import json, os, collections
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
I18N = os.path.join(ROOT, "i18n")
DROP = ["export"]
SET = {
 "modeExpected": dict(
  en="Switch to expected value. Now showing ranges: '2 +1 65%' means 2 cards for sure and a 65% chance of one more, worked out from every move seen.",
  es="Cambiar a valor esperado. Ahora ves rangos: «2 +1 65%» significa 2 cartas seguras y un 65 % de probabilidad de una más, calculado con todas las jugadas vistas.",
  de="Zum Erwartungswert wechseln. Aktuell Spannen: „2 +1 65%“ heißt 2 Karten sicher und 65 % Chance auf eine weitere, berechnet aus allen gesehenen Zügen.",
  fr="Passer à la valeur attendue. Actuellement en intervalles : « 2 +1 65% » signifie 2 cartes sûres et 65 % de chances d'en avoir une de plus, calculé à partir de tous les coups vus.",
  it="Passa al valore atteso. Ora vedi gli intervalli: «2 +1 65%» significa 2 carte sicure e il 65% di probabilità di averne un'altra, calcolato da tutte le mosse viste.",
  pt_BR="Mudar para valor esperado. Agora você vê intervalos: “2 +1 65%” significa 2 cartas certas e 65% de chance de mais uma, calculado a partir de todas as jogadas vistas.",
  pt_PT="Mudar para valor esperado. Agora vês intervalos: «2 +1 65%» significa 2 cartas certas e 65 % de probabilidade de mais uma, calculado a partir de todas as jogadas vistas.",
  ro="Comută la valoarea așteptată. Acum vezi intervale: „2 +1 65%” înseamnă 2 cărți sigure și 65 % șanse pentru încă una, calculat din toate mutările văzute.",
  ru="Переключить на ожидаемое значение. Сейчас показаны диапазоны: «2 +1 65%» значит 2 карты точно и 65 % шанс ещё одной, по всем увиденным ходам.",
  tr="Beklenen değere geç. Şu an aralıklar gösteriliyor: '2 +1 65%' kesin 2 kart ve %65 ihtimalle bir kart daha demek; görülen tüm hamlelerden hesaplanır.",
  pl="Przełącz na wartość oczekiwaną. Teraz widzisz zakresy: „2 +1 65%” to 2 karty na pewno i 65% szans na jeszcze jedną, obliczone ze wszystkich widzianych ruchów.",
  nl="Wissel naar verwachte waarde. Nu zie je bereiken: '2 +1 65%' betekent 2 kaarten zeker en 65% kans op nog één, berekend uit alle geziene zetten.",
  ms="Tukar ke nilai jangkaan. Kini julat dipaparkan: '2 +1 65%' bermaksud 2 kad pasti dan 65% peluang satu lagi, dikira daripada semua langkah yang dilihat.",
  ko="기댓값으로 전환. 지금은 범위 표시: '2 +1 65%'는 확실한 2장과 한 장 더 있을 확률 65%를 뜻하며, 관찰된 모든 플레이로 계산됩니다.",
  ja="期待値表示に切り替え。現在は範囲表示：「2 +1 65%」は確実に2枚、さらに1枚ある確率が65%という意味で、観測した全ての手番から計算します。",
  zh_CN="切换为期望值。当前为范围显示：“2 +1 65%”表示确定有 2 张，另有 65% 的概率再多 1 张，由观察到的全部操作推算。"),
 "modeRange": dict(
  en="Switch to ranges. Now showing expected values: '2.6' is the average number of cards once every possible hidden steal is weighed.",
  es="Cambiar a rangos. Ahora ves valores esperados: «2,6» es el número medio de cartas ponderando cada robo oculto posible.",
  de="Zu Spannen wechseln. Aktuell Erwartungswerte: „2,6“ ist die mittlere Kartenzahl über alle möglichen verdeckten Diebstähle.",
  fr="Passer aux intervalles. Actuellement en valeurs attendues : « 2,6 » est le nombre moyen de cartes en pesant chaque vol caché possible.",
  it="Passa agli intervalli. Ora vedi valori attesi: «2,6» è il numero medio di carte pesando ogni furto nascosto possibile.",
  pt_BR="Mudar para intervalos. Agora você vê valores esperados: “2,6” é o número médio de cartas ponderando cada roubo oculto possível.",
  pt_PT="Mudar para intervalos. Agora vês valores esperados: «2,6» é o número médio de cartas ponderando cada roubo oculto possível.",
  ro="Comută la intervale. Acum vezi valori așteptate: „2,6” este numărul mediu de cărți, cântărind fiecare furt ascuns posibil.",
  ru="Переключить на диапазоны. Сейчас показаны ожидаемые значения: «2,6» — среднее число карт с учётом всех возможных скрытых краж.",
  tr="Aralıklara geç. Şu an beklenen değerler gösteriliyor: '2,6' olası her gizli çalma tartılarak bulunan ortalama kart sayısıdır.",
  pl="Przełącz na zakresy. Teraz widzisz wartości oczekiwane: „2,6” to średnia liczba kart z uwzględnieniem każdej możliwej ukrytej kradzieży.",
  nl="Wissel naar bereiken. Nu zie je verwachte waarden: '2,6' is het gemiddelde aantal kaarten, alle mogelijke verborgen diefstallen meegewogen.",
  ms="Tukar ke julat. Kini nilai jangkaan dipaparkan: '2.6' ialah purata bilangan kad dengan menimbang setiap curian tersembunyi yang mungkin.",
  ko="범위로 전환. 지금은 기댓값 표시: '2.6'은 가능한 모든 비공개 훔치기를 가중한 평균 카드 수입니다.",
  ja="範囲表示に切り替え。現在は期待値表示：「2.6」は起こり得る全ての非公開の強奪を重み付けした平均枚数です。",
  zh_CN="切换为范围显示。当前为期望值：“2.6”是综合所有可能的未公开抢夺后的平均卡牌数。"),
 "totalTitle": dict(
  en="Total cards in hand, as reported by the server. ✓ the tracker agrees; ! it had to correct itself.",
  es="Total de cartas en mano, según el servidor. ✓ el contador coincide; ! tuvo que corregirse.",
  de="Karten auf der Hand laut Server. ✓ der Zähler stimmt überein; ! er musste sich korrigieren.",
  fr="Total de cartes en main, selon le serveur. ✓ le compteur concorde ; ! il a dû se corriger.",
  it="Totale carte in mano, secondo il server. ✓ il contatore coincide; ! ha dovuto correggersi.",
  pt_BR="Total de cartas na mão, segundo o servidor. ✓ o contador confere; ! ele precisou se corrigir.",
  pt_PT="Total de cartas na mão, segundo o servidor. ✓ o contador coincide; ! teve de se corrigir.",
  ro="Total cărți în mână, conform serverului. ✓ contorul coincide; ! a trebuit să se corecteze.",
  ru="Всего карт на руках по данным сервера. ✓ счётчик совпадает; ! ему пришлось исправиться.",
  tr="Sunucuya göre eldeki toplam kart. ✓ sayaç uyuşuyor; ! kendini düzeltmek zorunda kaldı.",
  pl="Łącznie kart w ręce według serwera. ✓ licznik się zgadza; ! musiał się poprawić.",
  nl="Totaal kaarten in de hand volgens de server. ✓ de teller klopt; ! hij moest zichzelf corrigeren.",
  ms="Jumlah kad di tangan menurut pelayan. ✓ pengira sepadan; ! ia terpaksa membetulkan diri.",
  ko="서버 기준 손에 든 카드 합계. ✓ 카운터와 일치, ! 카운터가 스스로 수정함.",
  ja="サーバーによる手札の合計。✓ カウンターと一致、! カウンターが自己修正。",
  zh_CN="服务器给出的手牌总数。✓ 计数器一致；! 计数器已自行修正。"),
 "dev": dict(
  en="Development cards in hand. The small cards next to the number are the ones this player has already played.",
  es="Cartas de desarrollo en mano. Las cartas pequeñas junto al número son las que ese jugador ya ha jugado.",
  de="Entwicklungskarten auf der Hand. Die kleinen Karten neben der Zahl hat dieser Spieler bereits gespielt.",
  fr="Cartes développement en main. Les petites cartes à côté du nombre sont celles que ce joueur a déjà jouées.",
  it="Carte di sviluppo in mano. Le carte piccole accanto al numero sono quelle che il giocatore ha già giocato.",
  pt_BR="Cartas de desenvolvimento na mão. As cartas pequenas ao lado do número são as que esse jogador já jogou.",
  pt_PT="Cartas de desenvolvimento na mão. As cartas pequenas junto ao número são as que esse jogador já jogou.",
  ro="Cărți de dezvoltare în mână. Cărțile mici de lângă număr sunt cele deja jucate de acest jucător.",
  ru="Карты развития на руках. Маленькие карты рядом с числом — те, что игрок уже сыграл.",
  tr="Eldeki gelişim kartları. Sayının yanındaki küçük kartlar bu oyuncunun zaten oynadıklarıdır.",
  pl="Karty rozwoju w ręce. Małe karty obok liczby to te, które ten gracz już zagrał.",
  nl="Ontwikkelingskaarten in de hand. De kleine kaarten naast het getal heeft deze speler al gespeeld.",
  ms="Kad pembangunan di tangan. Kad kecil di sebelah nombor ialah kad yang telah dimainkan pemain ini.",
  ko="손에 든 개발 카드. 숫자 옆의 작은 카드는 이 플레이어가 이미 사용한 카드입니다.",
  ja="手札の発展カード。数字の横の小さなカードはこのプレイヤーが既に使用したものです。",
  zh_CN="手中的发展卡。数字旁的小卡牌是该玩家已经打出的。"),
 "close": dict(en="Hide the panel. Alt+Shift+C brings it back.", es="Ocultar el panel. Alt+Shift+C lo vuelve a mostrar.", de="Panel ausblenden. Alt+Shift+C holt es zurück.", fr="Masquer le panneau. Alt+Maj+C le fait revenir.", it="Nascondi il pannello. Alt+Maiusc+C lo fa riapparire.", pt_BR="Ocultar o painel. Alt+Shift+C traz de volta.", pt_PT="Ocultar o painel. Alt+Shift+C volta a mostrá-lo.", ro="Ascunde panoul. Alt+Shift+C îl readuce.", ru="Скрыть панель. Alt+Shift+C возвращает её.", tr="Paneli gizle. Alt+Shift+C geri getirir.", pl="Ukryj panel. Alt+Shift+C przywraca go.", nl="Verberg het paneel. Alt+Shift+C haalt het terug.", ms="Sembunyikan panel. Alt+Shift+C memaparkannya semula.", ko="패널 숨기기. Alt+Shift+C로 다시 표시.", ja="パネルを非表示。Alt+Shift+Cで再表示。", zh_CN="隐藏面板。按 Alt+Shift+C 重新显示。"),
 "minimize": dict(en="Collapse to the title bar; click again to expand", es="Plegar a la barra de título; otro clic lo despliega", de="Auf die Titelleiste einklappen; erneut klicken zum Ausklappen", fr="Réduire à la barre de titre ; cliquer à nouveau pour agrandir", it="Riduci alla barra del titolo; un altro clic lo espande", pt_BR="Recolher para a barra de título; clique de novo para expandir", pt_PT="Recolher para a barra de título; outro clique expande", ro="Restrânge la bara de titlu; încă un clic îl extinde", ru="Свернуть до заголовка; ещё щелчок развернёт", tr="Başlık çubuğuna daralt; tekrar tıklayınca genişler", pl="Zwiń do paska tytułu; kolejne kliknięcie rozwija", nl="Inklappen tot de titelbalk; nog een klik klapt uit", ms="Kecilkan ke bar tajuk; klik lagi untuk kembangkan", ko="제목 표시줄로 접기, 다시 클릭하면 펼침", ja="タイトルバーに折りたたむ。もう一度クリックで展開", zh_CN="折叠到标题栏；再点一次展开"),
 "options": dict(en="Options: research consent, recorded games, server", es="Opciones: consentimiento, partidas grabadas, servidor", de="Optionen: Einwilligung, aufgezeichnete Partien, Server", fr="Options : consentement, parties enregistrées, serveur", it="Opzioni: consenso, partite registrate, server", pt_BR="Opções: consentimento, partidas gravadas, servidor", pt_PT="Opções: consentimento, partidas gravadas, servidor", ro="Opțiuni: consimțământ, partide înregistrate, server", ru="Настройки: согласие, записанные партии, сервер", tr="Seçenekler: onay, kaydedilen oyunlar, sunucu", pl="Opcje: zgoda, nagrane partie, serwer", nl="Opties: toestemming, opgenomen potjes, server", ms="Pilihan: persetujuan, permainan dirakam, pelayan", ko="옵션: 동의, 기록된 게임, 서버", ja="オプション：同意、記録したゲーム、サーバー", zh_CN="选项：同意设置、已记录对局、服务器"),
}
NEW = {
 "perPlayer": dict(en="cards in each player's hand", es="cartas de este recurso por jugador", de="Karten dieses Rohstoffs je Spieler", fr="cartes de cette ressource par joueur", it="carte di questa risorsa per giocatore", pt_BR="cartas desse recurso por jogador", pt_PT="cartas deste recurso por jogador", ro="cărți din această resursă per jucător", ru="карт этого ресурса у каждого игрока", tr="her oyuncudaki bu kaynak kartları", pl="kart tego surowca u każdego gracza", nl="kaarten van deze grondstof per speler", ms="kad sumber ini setiap pemain", ko="플레이어별 이 자원 카드", ja="各プレイヤーのこの資源のカード", zh_CN="每位玩家持有的该资源卡"),
 "bankTitle": dict(en="Cards left in the bank", es="Cartas que quedan en el banco", de="Karten in der Bank", fr="Cartes restantes à la banque", it="Carte rimaste in banca", pt_BR="Cartas restantes no banco", pt_PT="Cartas restantes no banco", ro="Cărți rămase în bancă", ru="Карт осталось в банке", tr="Bankada kalan kartlar", pl="Karty pozostałe w banku", nl="Kaarten over in de bank", ms="Kad yang tinggal di bank", ko="은행에 남은 카드", ja="銀行に残っているカード", zh_CN="银行剩余卡牌"),
 "moreStatsTitle": dict(en="Dice histogram with the expected count per number, sevens, hidden steals and tracker details", es="Histograma de dados con lo esperado por número, sietes, robos ocultos y detalles del contador", de="Würfelhistogramm mit Erwartung je Zahl, Siebener, verdeckte Diebstähle und Details des Zählers", fr="Histogramme des dés avec l'attendu par numéro, les sept, les vols cachés et les détails du compteur", it="Istogramma dei dadi con l'atteso per numero, i sette, i furti nascosti e i dettagli del contatore", pt_BR="Histograma dos dados com o esperado por número, setes, roubos ocultos e detalhes do contador", pt_PT="Histograma dos dados com o esperado por número, setes, roubos ocultos e detalhes do contador", ro="Histograma zarurilor cu așteptatul pe număr, șaptele, furturile ascunse și detaliile contorului", ru="Гистограмма кубиков с ожиданием по числам, семёрки, скрытые кражи и подробности счётчика", tr="Sayı başına beklenenle zar histogramı, yediler, gizli çalmalar ve sayaç ayrıntıları", pl="Histogram kości z oczekiwaną liczbą dla każdej wartości, siódemki, ukryte kradzieże i szczegóły licznika", nl="Dobbelhistogram met het verwachte aantal per getal, zevens, verborgen diefstallen en details van de teller", ms="Histogram dadu dengan jangkaan setiap nombor, tujuh, curian tersembunyi dan butiran pengira", ko="숫자별 예상치가 표시된 주사위 히스토그램, 7, 비공개 훔치기, 카운터 세부 정보", ja="数ごとの期待値付きサイコロ分布、7の回数、非公開の強奪、カウンターの詳細", zh_CN="带各点数预期值的骰子直方图、7 的次数、未公开抢夺与计数器详情"),
}
NOTES = {
 "perPlayer": "Second half of a resource header tooltip: '<Resource name> · cards in each player's hand'.",
 "bankTitle": "Tooltip of the bank row.",
 "moreStatsTitle": "Tooltip of the 'More stats' button.",
}
for f in sorted(os.listdir(I18N)):
    if not f.endswith(".json") or f.startswith("_"): continue
    loc = f[:-5]; p = os.path.join(I18N, f)
    d = json.load(open(p, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
    out = collections.OrderedDict()
    for k, v in d.items():
        if k in DROP: continue
        out[k] = SET[k][loc] if k in SET else v
        if k == "moreStats":
            for nk, tr in NEW.items(): out[nk] = tr[loc]
    open(p, "w", encoding="utf-8", newline="\n").write(json.dumps(out, ensure_ascii=False, indent=2) + "\n")
mp = os.path.join(I18N, "_meta.json")
meta = json.load(open(mp, encoding="utf-8"), object_pairs_hook=collections.OrderedDict)
for k in DROP: meta["keys"].pop(k, None)
for k, n in NOTES.items(): meta["keys"][k] = {"note": n}
meta["keys"]["modeExpected"]["note"] = "Tooltip of the % button while ranges are shown. Explains the range notation and says the click switches to expected values."
meta["keys"]["modeRange"]["note"] = "Tooltip of the % button while expected values are shown. Explains the decimal and says the click switches to ranges."
open(mp, "w", encoding="utf-8", newline="\n").write(json.dumps(meta, ensure_ascii=False, indent=2) + "\n")
print("ok")
