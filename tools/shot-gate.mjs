// Screenshot of the consent gate as a fresh install sees it on colonist.io (no counts visible).
import { chromium } from 'playwright';
import path from 'node:path';
const ROOT = process.argv[2], OUT = process.argv[3];
const ctx = await chromium.launchPersistentContext(path.join(process.env.TEMP, 'cct-gate-' + Date.now()), { headless: false, viewport: { width: 1280, height: 800 }, args: [`--disable-extensions-except=${ROOT}`, `--load-extension=${ROOT}`, '--no-first-run'] });
const p = ctx.pages()[0] || await ctx.newPage();
await p.goto('https://colonist.io/', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
const state = await p.evaluate(() => { const el = document.getElementById('cct-state'); const body = document.querySelector('#cct-overlay .cct-body'); const card = document.querySelector('#cct-overlay .cct-consent'); return { consent: el && JSON.parse(el.textContent).consent, bodyEmpty: body && body.innerHTML === '', cardVisible: card && !card.hidden, cardText: card && card.innerText.slice(0, 120) }; });
console.log(JSON.stringify(state));
await p.locator('#cct-overlay').screenshot({ path: OUT });
await ctx.close();
