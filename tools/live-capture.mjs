/*
 * Live capture harness: launches Chrome with the extension loaded, opens
 * colonist.io and logs what the tracker sees. Useful to validate the protocol
 * against the real site and to collect a diagnostic dump.
 *
 *   npm run live                 -> opens the site, you play a bots game
 *   npm run live -- --bots       -> also tries to start a bots game by itself
 *   npm run live -- --minutes 20 -> how long to keep capturing (default 15)
 *
 * Output goes to tools/out/<timestamp>/ (console log, periodic state
 * snapshots, screenshots).
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const EXT_DIR = path.resolve(__dirname, '..');
const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const opt = (name, def) => { const i = args.indexOf(name); return i >= 0 && args[i + 1] ? args[i + 1] : def; };
const MINUTES = Number(opt('--minutes', '15'));
const AUTO_BOTS = flag('--bots');
const HEADLESS = flag('--headless');

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const OUT = path.join(__dirname, 'out', stamp);
fs.mkdirSync(OUT, { recursive: true });
const logFile = fs.createWriteStream(path.join(OUT, 'console.log'));
const say = (...a) => { const line = `[${new Date().toISOString()}] ${a.join(' ')}`; console.log(line); logFile.write(line + '\n'); };

// Branded Chrome (137+) ignores --load-extension; use the Chromium bundled
// with Playwright unless --chrome is passed explicitly.
const userDataDir = path.join(__dirname, 'out', 'profile-' + stamp);
const context = await chromium.launchPersistentContext(userDataDir, {
  channel: flag('--chrome') ? 'chrome' : undefined,
  headless: HEADLESS,
  viewport: { width: 1400, height: 900 },
  args: [
    `--disable-extensions-except=${EXT_DIR}`,
    `--load-extension=${EXT_DIR}`,
    '--no-first-run',
    '--no-default-browser-check'
  ]
});

const page = context.pages()[0] || await context.newPage();
page.on('console', (msg) => {
  const text = msg.text();
  if (text.includes('[CCT]') || msg.type() === 'error') say('console:', msg.type(), text);
});
page.on('pageerror', (err) => say('pageerror:', String(err)));
page.on('websocket', (ws) => {
  say('websocket opened (playwright):', ws.url());
  let n = 0;
  ws.on('framereceived', (f) => { n++; if (n <= 3 || n % 50 === 0) say('ws frame #' + n, typeof f.payload === 'string' ? ('text ' + f.payload.slice(0, 80)) : ('binary ' + f.payload.length + ' bytes')); });
  ws.on('close', () => say('websocket closed', ws.url(), 'frames', n));
});

say('opening colonist.io');
await page.goto('https://colonist.io/', { waitUntil: 'domcontentloaded' });

async function shot(name) {
  try { await page.screenshot({ path: path.join(OUT, `${name}.png`) }); } catch (e) { say('screenshot failed', String(e)); }
}

async function clickFirst(selectors, label) {
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      if (await el.count()) {
        await el.click({ timeout: 4000 });
        say('clicked', label, sel);
        return true;
      }
    } catch (e) { /* try next */ }
  }
  say('no match for', label);
  return false;
}

try {
  const info = await page.evaluate(() => ({ injected: !!window.__cctInjected, wsName: window.WebSocket && window.WebSocket.name, wsSrc: String(window.WebSocket).slice(0, 60) }));
  say('page info:', JSON.stringify(info));
  if (flag('--selftest')) {
    await page.evaluate(() => { const ws = new WebSocket('wss://ws.postman-echo.com/raw'); ws.onopen = () => ws.send('cct-selftest'); });
    await page.waitForTimeout(4000);
  }
} catch (e) { say('page info failed', String(e)); }

if (AUTO_BOTS) {
  say('trying to start a bots game');
  await page.waitForTimeout(4000);
  await shot('step0-home');
  await clickFirst(['text=/play online/i', 'text=/jugar online/i'], 'play online');
  await page.waitForTimeout(3000);
  await shot('step1-play-online');
  await clickFirst(['#mm-mode-tab-bots', 'text=/^bots$/i', 'text=/vs bots/i'], 'bots tab');
  await page.waitForTimeout(2500);
  await shot('step2-bots-tab');
  await clickFirst(['text=/play vs\.? bots/i', 'text=/beginner mode/i'], 'bots card');
  await page.waitForTimeout(1500);
  if (!flag('--no-start')) await clickFirst(['text=/start game/i', 'text=/play vs bots/i', 'button:has-text("Play")', 'text=/^play$/i'], 'start');
  await page.waitForTimeout(10000);
  await shot('step3-after-start');
  say('url now', page.url());
}

let lastState = '';
const end = Date.now() + MINUTES * 60 * 1000;
let tick = 0;
while (Date.now() < end) {
  await page.waitForTimeout(5000);
  tick++;
  try {
    const state = await page.evaluate(() => {
      const el = document.getElementById('cct-state');
      return el ? el.textContent : null;
    });
    if (state && state !== lastState) {
      lastState = state;
      fs.writeFileSync(path.join(OUT, `state-${String(tick).padStart(4, '0')}.json`), state);
      const s = JSON.parse(state);
      say('state:', s.phase, 'turn', s.turn, 'players', (s.players || []).map((p) => `${p.name}=${p.total}${p.synced === false ? '!' : ''}`).join(' '),
        'steals', s.unknownSteals, 'worlds', s.worlds, 'contradictions', s.contradictions, 'frames', s.stats && s.stats.gameFrames);
    }
    if (tick % 6 === 0) await page.screenshot({ path: path.join(OUT, `shot-${String(tick).padStart(4, '0')}.png`) });
  } catch (e) {
    say('tick error', String(e));
  }
}
say('done, output in', OUT);
await context.close();
logFile.end();
