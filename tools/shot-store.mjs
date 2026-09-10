/*
 * Captures the raw pieces for the Chrome Web Store screenshots, per locale:
 *   tools/out/store/<locale>/panel-range.png    panel with a hidden steal shown as probabilities
 *   tools/out/store/<locale>/panel-stats.png    same game with "More stats" open
 *   tools/out/store/<locale>/panel-light.png    light theme (stats open)
 *   tools/out/store/<locale>/features.png       features board in the panel's style (1280x800 @2x)
 *   tools/out/store/<locale>/consent.png, options.png
 * The panel is captured over a flat blue background so tools/compose-store.py can
 * place it on the store canvases. Texts come from store/shots-i18n.json.
 *
 *   node tools/shot-store.mjs [locale ...]     (default: every locale in shots-i18n.json)
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TEXTS = JSON.parse(fs.readFileSync(path.join(ROOT, 'store', 'shots-i18n.json'), 'utf8'));
const wanted = process.argv.slice(2);
const locales = wanted.length ? wanted : Object.keys(TEXTS).filter((k) => !k.startsWith('_'));
const BLUE = '#3190cf';
const chromeLang = (l) => l.replace('_', '-');

const injectGame = () => async () => {
  const CH = 'colonist-card-tracker';
  const enc = (v) => window.CCTMsgpack.encode(v);
  const sid = 11; let seq = 100;
  const post = (kind, payload) => window.postMessage({ __cct: CH, kind, seq: 0, t: Date.now(), payload }, '*');
  const frameIn = (msg) => post('frame', { sid, url: 'wss://sim', msg, raw: enc(msg) });
  const game = (type, payload) => ({ id: 130, data: { type, sequence: seq++, payload } });
  const log = (i, text) => ({ [i]: { text } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  post('socket-new', { sid, url: 'wss://sim' }); post('socket-open', { sid, url: 'wss://sim' });
  frameIn(game(1, { databaseGameId: 'store-demo', serverId: 'srv', gameSettingId: 'gs1' }));
  frameIn(game(4, {
    gameState: {
      playerStates: { 1: { resourceCards: {} }, 2: { resourceCards: { 0: 0 } }, 3: { resourceCards: { 0: 0 } }, 4: { resourceCards: { 0: 0 } } },
      bankState: { hideBankCards: false, resourceCards: { 1: 19, 2: 19, 3: 19, 4: 19, 5: 19 } },
      gameLogState: { 0: { text: { type: 2 } } }, gameChatState: {},
      mechanicDevelopmentCardsState: { bankDevelopmentCards: { 10: 24 }, players: { 3: { developmentCards: { 0: 1 } } } }
    },
    playOrder: [1, 2, 3, 4], playerColor: 1,
    playerUserStates: [
      { userId: 'u-1', username: 'Rojo', selectedColor: 1, isBot: false },
      { userId: 'u-2', username: 'Gris', selectedColor: 2, isBot: false },
      { userId: 'u-3', username: 'Azul', selectedColor: 3, isBot: false },
      { userId: 'u-4', username: 'Verde', selectedColor: 4, isBot: false }
    ],
    gameSettings: { modeSetting: 1, victoryPointsToWin: 10 }, timeLeftInState: 30
  }));
  await sleep(200);
  let li = 1;
  const diff = (d) => frameIn(game(91, { diff: d, timeLeftInState: 10 }));
  const dist = (color, cards, hand) => diff({ gameLogState: log(li++, { type: 47, playerColor: color, cardsToBroadcast: cards, distributionType: 0 }), playerStates: { [color]: { resourceCards: hand } } });
  const roll = (color, a, b) => diff({ gameLogState: log(li++, { type: 10, playerColor: color, firstDice: a, secondDice: b }) });
  dist(1, [1, 2, 2, 4, 4, 5], { 1: 1, 2: 2, 4: 2, 5: 1 });
  dist(2, [3, 4, 4, 4, 4, 4, 5, 5], { 0: 8 });
  dist(3, [2, 2, 3, 4, 5], { 0: 5 });
  dist(4, [1, 2, 4, 4, 4], { 0: 5 });
  diff({ bankState: { resourceCards: { 1: 17, 2: 14, 3: 17, 4: 8, 5: 15 } } });
  const sep = () => diff({ gameLogState: log(li++, { type: 44 }) });
  const rolls = [[2, 4], [3, 3], [4, 5], [4, 2], [6, 3], [5, 3], [1, 4], [6, 4], [2, 6], [3, 5], [5, 6], [4, 4], [1, 2]];
  rolls.forEach(([a, b], i) => { sep(); roll((i % 4) + 1, a, b); });
  diff({ gameLogState: log(li++, { type: 16, playerColorThief: 2, playerColorVictim: 4, cardBacks: [0] }), playerStates: { 2: { resourceCards: { 0: 9 } }, 4: { resourceCards: { 0: 4 } } } });
  diff({ mechanicDevelopmentCardsState: { players: { 2: { developmentCardsUsed: [11, 11, 13] }, 4: { developmentCardsUsed: [14] } } } });
  await sleep(400);
};

function featuresHtml(t) {
  const cdn = 'https://cdn.colonist.io/dist/assets/';
  const card = (n) => `<img src="${cdn}${n}.svg" style="width:38px;height:53px;object-fit:contain;border-radius:3px">`;
  const icons = [
    card('card_rescardback.03c18312a76028b0d9c9'),
    card('card_brick.5950ea07a7ea01bc54a5'),
    '<span style="font:700 28px system-ui;color:#7ee2a8;background:rgba(126,226,168,.18);border-radius:8px;padding:6px 11px">%</span>',
    card('card_devcardback.92569a1abd04a8c1c17e'),
    card('card_lumber.cf22f8083cf89c2a29e7'),
    '<span style="font-size:34px">🎲</span>',
    card('card_grain.09c9d82146a64bce69b5'),
    '<span style="font:600 20px system-ui;color:#c9d3de;letter-spacing:1px">15</span>'
  ];
  const cells = t.items.map(([h, p], i) => `<div style="display:flex;gap:16px;align-items:center;background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.08);border-radius:12px;padding:14px 20px;height:128px;box-sizing:border-box"><div style="flex:0 0 56px;display:flex;justify-content:center;align-items:center;height:56px">${icons[i]}</div><div><div style="font-weight:600;font-size:19px;color:#e8ecf1;margin-bottom:4px">${h}</div><div style="font-size:14px;line-height:1.35;color:#9fb0c3">${p}</div></div></div>`).join('');
  return `<body style="margin:0;width:1280px;height:800px;overflow:hidden;background:#10141c;font-family:system-ui,-apple-system,'Segoe UI',Roboto,'Noto Sans','Microsoft YaHei','Yu Gothic','Malgun Gothic',sans-serif;color:#e8ecf1">
    <div style="padding:30px 56px 0"><div style="font-size:38px;font-weight:700;line-height:1.15">${t.features[0]}</div>
    <div style="font-size:17px;color:#9fb0c3;margin-top:4px">${t.features[1]}</div></div>
    <div style="display:grid;grid-template-columns:1fr 1fr;grid-auto-rows:128px;gap:12px;padding:18px 56px 0">${cells}</div></body>`;
}

for (const locale of locales) {
  const t = TEXTS[locale];
  const OUT = path.join(ROOT, 'tools', 'out', 'store', locale);
  fs.mkdirSync(OUT, { recursive: true });
  const ctx = await chromium.launchPersistentContext(path.join(process.env.TEMP, 'cct-store-' + locale + '-' + Date.now()), {
    headless: false, viewport: { width: 1280, height: 800 }, locale: chromeLang(locale), deviceScaleFactor: 2,
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-first-run', `--lang=${chromeLang(locale)}`]
  });
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;
    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://colonist.io/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cct-overlay .cct-consent:not([hidden])', { timeout: 15000 });
    await page.addStyleTag({ content: `html, body { background: ${BLUE} !important; } body > *:not(#cct-overlay) { visibility: hidden !important; }` });
    await page.waitForTimeout(300);
    await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'consent.png') });
    await page.click('#cct-overlay .cct-consent button[data-act="yes"]');
    await page.evaluate(injectGame());
    await page.waitForTimeout(2500);
    await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'panel-range.png') });
    await page.click('#cct-overlay .cct-toggle[data-act="stats"]');
    await page.waitForTimeout(300);
    await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'panel-stats.png') });
    await page.click('#cct-overlay button[data-act="theme"]');
    await page.waitForTimeout(300);
    await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'panel-light.png') });

    const fpage = await ctx.newPage();
    await fpage.setContent(featuresHtml(t));
    await fpage.waitForTimeout(1200);
    await fpage.screenshot({ path: path.join(OUT, 'features.png'), clip: { x: 0, y: 0, width: 1280, height: 800 } });

    const opt = await ctx.newPage();
    await opt.goto(`chrome-extension://${extId}/src/options.html`);
    await opt.addStyleTag({ content: 'html { overflow: hidden !important; }' });
    await opt.waitForTimeout(600);
    await opt.screenshot({ path: path.join(OUT, 'options.png') });
    const status = await page.evaluate(() => document.querySelector('#cct-overlay .cct-status').innerText);
    console.log(locale, '| ok |', status);
  } catch (e) {
    console.log(locale, '| ERROR |', String(e.message || e).slice(0, 160));
  } finally {
    await ctx.close().catch(() => {});
  }
}
