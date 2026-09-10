/*
 * Captures the raw pieces for the Chrome Web Store screenshots (English UI):
 *   panel-range.png     panel with a hidden steal shown as probabilities
 *   panel-expected.png  same game in expected-value mode
 *   consent.png         the research consent card
 *   options.png         options page, 1280x800
 * The panel is captured over a flat blue background (same tone as the game
 * screenshot) so tools/compose-store.py can paste it onto the real game capture.
 *
 *   node tools/shot-store.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'out', 'store');
fs.mkdirSync(OUT, { recursive: true });
const BLUE = '#3190cf';

const ctx = await chromium.launchPersistentContext(path.join(process.env.TEMP, 'cct-store-' + Date.now()), {
  headless: false, viewport: { width: 1280, height: 800 }, locale: 'en-US', deviceScaleFactor: 2,
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-first-run', '--lang=en-US']
});
try {
  let sw = ctx.serviceWorkers()[0];
  if (!sw) sw = await ctx.waitForEvent('serviceworker');
  const extId = new URL(sw.url()).host;
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://colonist.io/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cct-overlay .cct-consent:not([hidden])', { timeout: 15000 });
  // flat background behind the panel
  await page.addStyleTag({ content: `html, body { background: ${BLUE} !important; } body > *:not(#cct-overlay) { visibility: hidden !important; }` });
  await page.waitForTimeout(300);

  // inject a game first so the consent card shows "Live · turn" like a real session
  const inject = async () => page.evaluate(async () => {
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
    // me = Rojo (colour 1): visible hand. Others hidden.
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
    // 1 lumber, 2 brick, 3 wool, 4 grain, 5 ore
    dist(1, [1, 2, 2, 4, 4, 5], { 1: 1, 2: 2, 4: 2, 5: 1 });      // Rojo (me): 1 2 0 2 1
    dist(2, [3, 4, 4, 4, 4, 4, 5, 5], { 0: 8 });                    // Gris: 0 0 1 5 2
    dist(3, [2, 2, 3, 4, 5], { 0: 5 });                             // Azul: 0 2 1 1 1
    dist(4, [1, 2, 4, 4, 4], { 0: 5 });                             // Verde: 1 1 0 3 0
    diff({ bankState: { resourceCards: { 1: 17, 2: 14, 3: 17, 4: 8, 5: 15 } } });
    const sep = () => diff({ gameLogState: log(li++, { type: 44 }) });   // turn separator
    const rolls = [[2, 4], [3, 3], [4, 5], [4, 2], [6, 3], [5, 3], [1, 4], [6, 4], [2, 6], [3, 5], [5, 6], [4, 4], [1, 2]];
    rolls.forEach(([a, b], i) => { sep(); roll((i % 4) + 1, a, b); });
    // Gris steals a hidden card from Verde -> probabilities
    diff({ gameLogState: log(li++, { type: 16, playerColorThief: 2, playerColorVictim: 4, cardBacks: [0] }), playerStates: { 2: { resourceCards: { 0: 9 } }, 4: { resourceCards: { 0: 4 } } } });
    // development cards already played (server-reported), to populate the revealed-cards section
    diff({ mechanicDevelopmentCardsState: { players: { 2: { developmentCardsUsed: [11, 11, 13] }, 4: { developmentCardsUsed: [14] } } } });
    await sleep(400);
  });

  await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'consent.png') });
  await page.click('#cct-overlay .cct-consent button[data-act="yes"]');
  await inject();
  await page.waitForTimeout(2500);   // let the deferred server-total reconcile run
  const text = await page.evaluate(() => document.querySelector('#cct-overlay').innerText.replace(/\s+/g, ' '));
  console.log('panel:', text.slice(0, 260));
  await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'panel-range.png') });
  await page.click('#cct-overlay button[data-act="mode"]');
  await page.waitForTimeout(300);
  await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'panel-expected.png') });
  await page.click('#cct-overlay button[data-act="mode"]');
  await page.click('#cct-overlay .cct-toggle[data-act="stats"]');
  await page.waitForTimeout(300);
  await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'panel-stats.png') });
  await page.click('#cct-overlay button[data-act="theme"]');
  await page.waitForTimeout(300);
  await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, 'panel-light.png') });
  await page.click('#cct-overlay button[data-act="theme"]');
  await page.click('#cct-overlay .cct-toggle[data-act="stats"]');

  const opt = await ctx.newPage();
  await opt.goto(`chrome-extension://${extId}/src/options.html`);
  await opt.addStyleTag({ content: 'html { overflow: hidden !important; }' });
  await opt.waitForTimeout(600);
  await opt.screenshot({ path: path.join(OUT, 'options.png') });
  console.log('written to', OUT);
} finally {
  await ctx.close();
}
