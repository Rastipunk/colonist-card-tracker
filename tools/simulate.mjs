/*
 * End-to-end test of the recorder pipeline without a real game:
 *   1. starts the ingest backend locally,
 *   2. launches Chromium with the extension, sets consent + endpoint in the options page,
 *   3. opens colonist.io and injects a synthetic game (BuildGame, diffs with log/chat/trades, GameEndState)
 *      through the same postMessage channel inject.js uses, with real msgpack bytes,
 *   4. waits for the service worker to finalize + upload, then checks the backend received the file.
 *
 *   node tools/simulate.mjs
 */
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PORT = 8787;
const ADMIN = 'test-admin';
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(__dirname, 'out', 'sim-' + stamp);
fs.mkdirSync(OUT, { recursive: true });
const say = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);

// 1. backend
const backend = spawn(process.execPath, [path.join(ROOT, 'backend', 'server.js')], {
  env: Object.assign({}, process.env, { PORT: String(PORT), DATA_DIR: path.join(OUT, 'data'), ADMIN_TOKEN: ADMIN }),
  stdio: ['ignore', 'pipe', 'pipe']
});
backend.stdout.on('data', (d) => say('backend:', String(d).trim()));
backend.stderr.on('data', (d) => say('backend!', String(d).trim()));
await new Promise((r) => setTimeout(r, 800));

// 2. browser + options
const context = await chromium.launchPersistentContext(path.join(OUT, 'profile'), {
  headless: false,
  viewport: { width: 1300, height: 850 },
  args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-first-run']
});
let sw = context.serviceWorkers()[0];
if (!sw) sw = await context.waitForEvent('serviceworker');
const extId = new URL(sw.url()).host;
say('extension id', extId);
sw.on('console', (m) => say('sw:', m.type(), m.text()));

const opt = await context.newPage();
await opt.goto(`chrome-extension://${extId}/src/options.html`);
await opt.check('input[name="consent"][value="accepted"]');
await opt.fill('#endpoint', `http://localhost:${PORT}`);
await opt.click('#save');
await opt.waitForTimeout(500);
await opt.screenshot({ path: path.join(OUT, 'options.png') });

// 3. game page
const page = await context.newPage();
page.on('console', (m) => { if (m.text().includes('[CCT]')) say('page:', m.text()); });
await page.goto('https://colonist.io/', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(1500);

const result = await page.evaluate(async () => {
  const CH = 'colonist-card-tracker';
  const enc = (v) => window.CCTMsgpack.encode(v);
  const sid = 99;
  let seq = 500;
  const post = (kind, payload) => window.postMessage({ __cct: CH, kind, seq: 0, t: Date.now(), payload }, '*');
  const frameIn = (msg) => post('frame', { sid, url: 'wss://sim', msg, raw: enc(msg) });
  const frameOut = (msg) => post('out-frame', { sid, url: 'wss://sim', msg, raw: enc(msg) });
  const game = (type, payload) => ({ id: 130, data: { type, sequence: seq++, payload } });
  const log = (i, text) => ({ [i]: { text } });
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  post('socket-new', { sid, url: 'wss://sim' });
  post('socket-open', { sid, url: 'wss://sim' });
  post('text', { sid, url: 'wss://sim', data: { type: 'Connected', userSessionId: 'sess-abc' }, raw: JSON.stringify({ type: 'Connected', userSessionId: 'sess-abc' }) });
  frameIn(game(1, { databaseGameId: 'simgame-0001', serverId: 'srv', reconnectToken: 'tok-secret', gameSettingId: 'gs1' }));
  frameIn(game(4, {
    gameState: {
      playerStates: { 1: { resourceCards: { 0: 0 } }, 2: { resourceCards: {} }, 3: { resourceCards: { 0: 0 } }, 4: { resourceCards: { 0: 0 } } },
      bankState: { hideBankCards: false, resourceCards: { 1: 19, 2: 19, 3: 19, 4: 19, 5: 19 } },
      gameLogState: { 0: { text: { type: 2 } } },
      gameChatState: {},
      mechanicDevelopmentCardsState: { bankDevelopmentCards: { 10: 25 }, players: {} }
    },
    playOrder: [1, 2, 3, 4],
    playerColor: 2,
    playerUserStates: [
      { userId: 'u-1', username: 'Simone1294', selectedColor: 1, isBot: false, profilePictureUrl: 'https://x/a.png' },
      { userId: 'u-2', username: 'Rastipunk', selectedColor: 2, isBot: false },
      { userId: 'u-3', username: 'C0l0noChill', selectedColor: 3, isBot: false },
      { userId: 'u-4', username: 'Joanne276', selectedColor: 4, isBot: false }
    ],
    gameSettings: { modeSetting: 1, victoryPointsToWin: 10 },
    timeLeftInState: 30
  }));
  await sleep(300);
  let li = 1;
  const diff = (d) => frameIn(game(91, { diff: d, timeLeftInState: 10 }));
  diff({ gameLogState: log(li++, { type: 47, playerColor: 1, cardsToBroadcast: [1, 2, 3], distributionType: 0 }), playerStates: { 1: { resourceCards: { 0: 3 } } } });
  diff({ gameLogState: log(li++, { type: 47, playerColor: 2, cardsToBroadcast: [4, 5], distributionType: 0 }), playerStates: { 2: { resourceCards: { 4: 1, 5: 1 } } } });
  diff({ gameChatState: { 0: { text: { type: 0, message: 'hola Simone1294, cambio trigo por madera?', from: 2 } } } });
  diff({ gameChatState: { 1: { text: { type: 0, message: 'ok rastipunk dame madera', from: 1 } } } });
  frameOut({ id: 130, data: { type: 20, payload: { text: 'hola Simone1294, cambio trigo por madera?' } } });
  diff({ gameLogState: log(li++, { type: 118, playerColor: 2, wantedCardEnums: [1], offeredCardEnums: [4] }), tradeState: { activeOffers: { o1: { creator: 2, offeredResources: [4], wantedResources: [1] } } } });
  diff({ gameLogState: log(li++, { type: 115, playerColor: 2, acceptingPlayerColor: 1, givenCardEnums: [4], receivedCardEnums: [1] }), tradeState: { activeOffers: { o1: null } }, playerStates: { 1: { resourceCards: { 0: 3 } }, 2: { resourceCards: { 1: 1, 4: null, 5: 1 } } } });
  diff({ gameLogState: log(li++, { type: 10, playerColor: 1, firstDice: 3, secondDice: 4 }) });
  diff({ gameLogState: log(li++, { type: 16, playerColorThief: 1, playerColorVictim: 3, cardBacks: [0] }) });
  for (let k = 0; k < 40; k++) diff({ gameLogState: log(li++, { type: 10, playerColor: (k % 4) + 1, firstDice: 1 + (k % 6), secondDice: 1 + ((k * 7) % 6) }) });
  await sleep(2500);
  diff({ playerStates: { 1: { victoryPointsState: { 0: 2, 1: 2, 4: 1, 2: 2 } }, 2: { victoryPointsState: { 0: 3, 1: 1 } }, 3: { victoryPointsState: { 0: 2, 3: 1 } }, 4: { victoryPointsState: { 0: 4 } } } });
  diff({ gameLogState: log(li++, { type: 45, playerColor: 1 }) });
  frameIn(game(45, { winner: 1 }));
  await sleep(500);
  const st = JSON.parse(document.getElementById('cct-state').textContent);
  return { phase: st.phase, players: st.players.map((p) => p.name), recording: st.recording, consent: st.consent, stats: st.stats };
});
say('page state', JSON.stringify(result));
await page.screenshot({ path: path.join(OUT, 'game.png') });

// 4. wait for finalize (20 s grace) + upload
let uploaded = null;
for (let i = 0; i < 20; i++) {
  await page.waitForTimeout(3000);
  const res = await fetch(`http://localhost:${PORT}/games`, { headers: { authorization: 'Bearer ' + ADMIN } });
  const { games } = await res.json();
  if (games.length) { uploaded = games[0]; break; }
}
await opt.reload();
await opt.waitForTimeout(800);
await opt.screenshot({ path: path.join(OUT, 'options-after.png') });
const rows = await opt.$$eval('#sessions tbody tr', (trs) => trs.map((tr) => tr.innerText));
say('options rows:', JSON.stringify(rows));

if (uploaded) {
  say('UPLOADED', JSON.stringify(uploaded));
  const lines = fs.readFileSync(path.join(OUT, 'data', 'index.jsonl'), 'utf8').trim().split(/\r?\n/);
  const meta = JSON.parse(lines[lines.length - 1]).meta;
  say('standings', JSON.stringify(meta.standings), 'winnerColor', meta.winnerColor, 'players', JSON.stringify(meta.players));
  const file = path.join(OUT, 'data', uploaded.file);
  say('file', file, fs.statSync(file).size, 'bytes');
  fs.copyFileSync(file, path.join(OUT, 'sample.cctr.gz'));
} else {
  say('NOT UPLOADED');
}
await context.close();
backend.kill();
say('done', OUT);
process.exit(uploaded ? 0 : 1);
