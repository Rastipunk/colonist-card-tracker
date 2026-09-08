/*
 * Visual check of every locale: launches Chromium with --lang=<locale> and the
 * unpacked extension, then screenshots (1) the consent card, (2) the panel with
 * a small synthetic game and (3) the options page.
 *
 *   node tools/shot-i18n.mjs [locale ...]     (default: every folder in _locales)
 *
 * Output: tools/out/i18n/<locale>-{consent,panel,options}.png plus a JSON line
 * per locale with the texts actually rendered (to spot fallbacks to English).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'tools', 'out', 'i18n');
fs.mkdirSync(OUT, { recursive: true });
const wanted = process.argv.slice(2);
const locales = wanted.length ? wanted : fs.readdirSync(path.join(ROOT, '_locales'));
const chromeLang = (l) => l.replace('_', '-');

for (const locale of locales) {
  const profile = path.join(process.env.TEMP, 'cct-i18n-' + locale + '-' + Date.now());
  const ctx = await chromium.launchPersistentContext(profile, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    locale: chromeLang(locale),
    args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-first-run', `--lang=${chromeLang(locale)}`]
  });
  try {
    let sw = ctx.serviceWorkers()[0];
    if (!sw) sw = await ctx.waitForEvent('serviceworker');
    const extId = new URL(sw.url()).host;

    const page = ctx.pages()[0] || await ctx.newPage();
    await page.goto('https://colonist.io/', { waitUntil: 'domcontentloaded' });
    await page.waitForSelector('#cct-overlay .cct-consent:not([hidden])', { timeout: 15000 });
    const consentText = await page.evaluate(() => document.querySelector('#cct-overlay .cct-consent').innerText);
    await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, `${locale}-consent.png`) });

    await page.click('#cct-overlay .cct-consent button[data-act="yes"]');
    await page.evaluate(async () => {
      const CH = 'colonist-card-tracker';
      const enc = (v) => window.CCTMsgpack.encode(v);
      const sid = 7; let seq = 100;
      const post = (kind, payload) => window.postMessage({ __cct: CH, kind, seq: 0, t: Date.now(), payload }, '*');
      const frameIn = (msg) => post('frame', { sid, url: 'wss://sim', msg, raw: enc(msg) });
      const game = (type, payload) => ({ id: 130, data: { type, sequence: seq++, payload } });
      const log = (i, text) => ({ [i]: { text } });
      post('socket-new', { sid, url: 'wss://sim' }); post('socket-open', { sid, url: 'wss://sim' });
      frameIn(game(1, { databaseGameId: 'i18n-demo', serverId: 'srv', gameSettingId: 'gs1' }));
      frameIn(game(4, {
        gameState: {
          playerStates: { 1: { resourceCards: { 0: 0 } }, 2: { resourceCards: {} }, 3: { resourceCards: { 0: 0 } } },
          bankState: { hideBankCards: false, resourceCards: { 1: 19, 2: 19, 3: 19, 4: 19, 5: 19 } },
          gameLogState: { 0: { text: { type: 2 } } }, gameChatState: {},
          mechanicDevelopmentCardsState: { bankDevelopmentCards: { 10: 25 }, players: {} }
        },
        playOrder: [1, 2, 3], playerColor: 2,
        playerUserStates: [
          { userId: 'u-1', username: 'Anke', selectedColor: 1, isBot: false },
          { userId: 'u-2', username: 'Rastipunk', selectedColor: 2, isBot: false },
          { userId: 'u-3', username: 'Bot', selectedColor: 3, isBot: true }
        ],
        gameSettings: { modeSetting: 1, victoryPointsToWin: 10 }, timeLeftInState: 30
      }));
      await new Promise((r) => setTimeout(r, 200));
      let li = 1;
      const diff = (d) => frameIn(game(91, { diff: d, timeLeftInState: 10 }));
      diff({ gameLogState: log(li++, { type: 47, playerColor: 1, cardsToBroadcast: [1, 2, 3], distributionType: 0 }), playerStates: { 1: { resourceCards: { 0: 3 } } } });
      diff({ gameLogState: log(li++, { type: 47, playerColor: 2, cardsToBroadcast: [4, 5], distributionType: 0 }), playerStates: { 2: { resourceCards: { 4: 1, 5: 1 } } } });
      diff({ gameLogState: log(li++, { type: 10, playerColor: 1, firstDice: 3, secondDice: 4 }) });
      diff({ gameLogState: log(li++, { type: 10, playerColor: 2, firstDice: 6, secondDice: 1 }) });
      diff({ gameLogState: log(li++, { type: 16, playerColorThief: 3, playerColorVictim: 1, cardBacks: [0] }), playerStates: { 1: { resourceCards: { 0: 2 } }, 3: { resourceCards: { 0: 1 } } } });
      await new Promise((r) => setTimeout(r, 400));
    });
    await page.waitForTimeout(600);
    const panelText = await page.evaluate(() => {
      const o = document.querySelector('#cct-overlay');
      const titles = Array.from(o.querySelectorAll('[title]')).map((e) => e.getAttribute('title'));
      return { lang: o.lang, dir: o.dir, status: o.querySelector('.cct-status').innerText, body: o.querySelector('.cct-body').innerText.replace(/\s+/g, ' ').slice(0, 200), titles: titles.slice(0, 14) };
    });
    await page.locator('#cct-overlay').screenshot({ path: path.join(OUT, `${locale}-panel.png`) });

    const opt = await ctx.newPage();
    await opt.goto(`chrome-extension://${extId}/src/options.html`);
    await opt.waitForTimeout(500);
    const optText = await opt.evaluate(() => ({ lang: document.documentElement.lang, dir: document.documentElement.dir, h2: Array.from(document.querySelectorAll('h2')).map((h) => h.textContent) }));
    await opt.screenshot({ path: path.join(OUT, `${locale}-options.png`), fullPage: true });

    console.log(JSON.stringify({ locale, consent: consentText.slice(0, 70), panel: panelText, options: optText }));
  } catch (e) {
    console.log(JSON.stringify({ locale, error: String(e.message || e).slice(0, 200) }));
  } finally {
    await ctx.close();
  }
}
