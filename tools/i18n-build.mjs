/*
 * Generates _locales/<locale>/messages.json (Chrome i18n format) from the
 * compact source files in i18n/<locale>.json plus translator notes in
 * i18n/_meta.json.
 *
 *   node tools/i18n-build.mjs          # write all locales
 *   node tools/i18n-build.mjs --check  # exit 1 if _locales is out of date
 *
 * Source of truth is i18n/*.json; never edit _locales by hand.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'i18n');
const OUT = path.join(ROOT, '_locales');
const check = process.argv.includes('--check');

const meta = JSON.parse(fs.readFileSync(path.join(SRC, '_meta.json'), 'utf8'));
const locales = fs.readdirSync(SRC).filter((f) => /^[a-z]{2,3}(_[A-Z]{2}|_\d{3})?\.json$/.test(f)).map((f) => f.replace(/\.json$/, ''));
let stale = 0;

for (const locale of locales) {
  const strings = JSON.parse(fs.readFileSync(path.join(SRC, `${locale}.json`), 'utf8'));
  const messages = {};
  for (const [key, message] of Object.entries(strings)) {
    const entry = { message };
    const note = meta.keys[key] && meta.keys[key].note;
    if (note) entry.description = note;
    messages[key] = entry;
  }
  const text = JSON.stringify(messages, null, 2) + '\n';
  const file = path.join(OUT, locale, 'messages.json');
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  if (current === text) continue;
  if (check) { console.error(`out of date: ${path.relative(ROOT, file)}`); stale++; continue; }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
  console.log('wrote', path.relative(ROOT, file));
}

if (check && stale) process.exit(1);
if (!check) console.log(`${locales.length} locales: ${locales.join(', ')}`);
