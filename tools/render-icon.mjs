/*
 * Renders icons/icon.svg to the PNG sizes Chrome and the Web Store use
 * (16, 32, 48, 128) and a preview sheet showing them side by side on light
 * and dark backgrounds.   node tools/render-icon.mjs
 */
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const svg = fs.readFileSync(path.join(ROOT, 'icons', 'icon.svg'), 'utf8');
const data = 'data:image/svg+xml;base64,' + Buffer.from(svg).toString('base64');
const b = await chromium.launch();
for (const size of [16, 32, 48, 128]) {
  const p = await b.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  await p.setContent(`<body style="margin:0;background:transparent"><img src="${data}" style="width:${size}px;height:${size}px;display:block"></body>`);
  await p.waitForTimeout(200);
  await p.screenshot({ path: path.join(ROOT, 'icons', `icon${size}.png`), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  await p.close();
}
const sheet = await b.newPage({ viewport: { width: 720, height: 240 }, deviceScaleFactor: 2 });
const row = (bg, fg) => `<div style="display:flex;align-items:center;gap:28px;padding:18px 24px;background:${bg};color:${fg};font:13px system-ui">
  ${[16, 24, 32, 48, 128].map((s) => `<div style="text-align:center"><img src="${data}" style="width:${s}px;height:${s}px;display:block;margin:0 auto 6px">${s}px</div>`).join('')}
  <div style="display:flex;align-items:center;gap:8px;margin-left:auto;background:${bg === '#fff' ? '#f1f3f4' : '#2b2b2b'};padding:6px 10px;border-radius:8px"><img src="${data}" style="width:16px;height:16px">Colonist Card Tracker</div></div>`;
await sheet.setContent(`<body style="margin:0">${row('#fff', '#222')}${row('#202124', '#ddd')}</body>`);
await sheet.waitForTimeout(200);
await sheet.screenshot({ path: path.join(ROOT, 'tools', 'out', 'icon-preview.png') });
await b.close();
console.log('icons written');
