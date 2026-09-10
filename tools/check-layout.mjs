/*
 * Layout regression check: the panel width must not change when "More stats" is
 * toggled, when the panel is minimised, or when the theme changes, and the header
 * buttons must stay at the same x position.
 *   node tools/check-layout.mjs      (exit 1 on any shift)
 */
import { chromium } from 'playwright';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ctx = await chromium.launchPersistentContext(path.join(process.env.TEMP, 'cct-layout-' + Date.now()), {
  headless: false, viewport: { width: 1280, height: 800 }, locale: 'en-US',
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-first-run', '--lang=en-US']
});
let failures = 0;
try {
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://colonist.io/', { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('#cct-overlay .cct-consent:not([hidden])', { timeout: 15000 });
  await page.click('#cct-overlay .cct-consent button[data-act="yes"]');
  await page.evaluate(async () => {
    const CH = 'colonist-card-tracker';
    const enc = (v) => window.CCTMsgpack.encode(v);
    const sid = 5; let seq = 100;
    const post = (kind, payload) => window.postMessage({ __cct: CH, kind, seq: 0, t: Date.now(), payload }, '*');
    const frameIn = (msg) => post('frame', { sid, url: 'wss://sim', msg, raw: enc(msg) });
    const game = (type, payload) => ({ id: 130, data: { type, sequence: seq++, payload } });
    const log = (i, text) => ({ [i]: { text } });
    post('socket-new', { sid, url: 'wss://sim' }); post('socket-open', { sid, url: 'wss://sim' });
    frameIn(game(1, { databaseGameId: 'layout', serverId: 'srv', gameSettingId: 'gs1' }));
    frameIn(game(4, {
      gameState: { playerStates: { 1: { resourceCards: {} }, 2: { resourceCards: { 0: 0 } }, 3: { resourceCards: { 0: 0 } }, 4: { resourceCards: { 0: 0 } } },
        bankState: { hideBankCards: false, resourceCards: { 1: 19, 2: 19, 3: 19, 4: 19, 5: 19 } }, gameLogState: { 0: { text: { type: 2 } } }, gameChatState: {},
        mechanicDevelopmentCardsState: { bankDevelopmentCards: { 10: 25 }, players: {} } },
      playOrder: [1, 2, 3, 4], playerColor: 1,
      playerUserStates: [{ userId: 'a', username: 'Rojo', selectedColor: 1 }, { userId: 'b', username: 'Gris', selectedColor: 2 }, { userId: 'c', username: 'Azul', selectedColor: 3 }, { userId: 'd', username: 'Verde', selectedColor: 4 }],
      gameSettings: { modeSetting: 1, victoryPointsToWin: 10 }, timeLeftInState: 30 }));
    await new Promise((r) => setTimeout(r, 200));
    let li = 1;
    const diff = (d) => frameIn(game(91, { diff: d, timeLeftInState: 10 }));
    diff({ gameLogState: log(li++, { type: 47, playerColor: 2, cardsToBroadcast: [4, 4, 5], distributionType: 0 }), playerStates: { 2: { resourceCards: { 0: 3 } } } });
    diff({ gameLogState: log(li++, { type: 10, playerColor: 1, firstDice: 3, secondDice: 4 }) });
    diff({ gameLogState: log(li++, { type: 16, playerColorThief: 3, playerColorVictim: 2, cardBacks: [0] }), playerStates: { 2: { resourceCards: { 0: 2 } }, 3: { resourceCards: { 0: 1 } } } });
    await new Promise((r) => setTimeout(r, 300));
  });
  await page.waitForTimeout(2500);

  const measure = () => page.evaluate(() => {
    const o = document.querySelector('#cct-overlay');
    const b = (sel) => { const r = o.querySelector(sel).getBoundingClientRect(); return Math.round(r.left); };
    return { width: Math.round(o.getBoundingClientRect().width), min: b('[data-act="min"]'), close: b('[data-act="close"]'), theme: b('[data-act="theme"]') };
  });
  const base = await measure();
  const check = async (label) => {
    await page.waitForTimeout(250);
    const m = await measure();
    const ok = m.width === base.width && m.min === base.min && m.close === base.close;
    console.log((ok ? 'ok   ' : 'SHIFT') + ' | ' + label + ' | ' + JSON.stringify(m));
    if (!ok) failures++;
  };
  console.log('base  | ' + JSON.stringify(base));
  await page.click('#cct-overlay .cct-toggle[data-act="stats"]'); await check('stats open');
  await page.click('#cct-overlay .cct-toggle[data-act="stats"]'); await check('stats closed');
  await page.click('#cct-overlay button[data-act="min"]'); await check('minimised');
  await page.click('#cct-overlay button[data-act="min"]'); await check('restored');
  await page.click('#cct-overlay button[data-act="theme"]'); await check('light theme');
  await page.click('#cct-overlay button[data-act="theme"]'); await check('dark theme');
  await page.click('#cct-overlay button[data-act="mode"]'); await check('expected mode');
  await page.click('#cct-overlay button[data-act="mode"]'); await check('range mode');
} finally {
  await ctx.close().catch(() => {});
}
console.log(failures ? `${failures} shift(s)` : 'layout stable');
process.exit(failures ? 1 : 0);
