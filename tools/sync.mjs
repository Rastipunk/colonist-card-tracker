/*
 * Download every recording from the ingest service into a local folder.
 *   node tools/sync.mjs <endpoint> <ADMIN_TOKEN> [outDir]
 * Incremental: keeps a cursor in <outDir>/.cursor and skips files already present.
 */
import fs from 'node:fs';
import path from 'node:path';

const [endpoint, token, outDir = './dataset'] = process.argv.slice(2);
if (!endpoint || !token) {
  console.error('usage: node tools/sync.mjs <endpoint> <ADMIN_TOKEN> [outDir]');
  process.exit(1);
}
const base = endpoint.replace(/\/+$/, '');
const headers = { authorization: 'Bearer ' + token };
fs.mkdirSync(outDir, { recursive: true });
const cursorFile = path.join(outDir, '.cursor');
let after = fs.existsSync(cursorFile) ? Number(fs.readFileSync(cursorFile, 'utf8')) || 0 : 0;
let total = 0;

for (;;) {
  const res = await fetch(`${base}/games?after=${after}&limit=500`, { headers });
  if (!res.ok) { console.error('list failed', res.status); process.exit(1); }
  const { games } = await res.json();
  if (!games.length) break;
  for (const g of games) {
    const dest = path.join(outDir, g.file);
    if (!fs.existsSync(dest)) {
      const r = await fetch(`${base}/games/${g.key}`, { headers });
      if (!r.ok) { console.error('download failed', g.key, r.status); continue; }
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer()));
      total++;
    }
    after = Math.max(after, g.received_at);
  }
  fs.writeFileSync(cursorFile, String(after));
  fs.appendFileSync(path.join(outDir, 'index.jsonl'), games.map((g) => JSON.stringify(g)).join('\n') + '\n');
}
console.log(`synced ${total} new recordings into ${outDir}`);
