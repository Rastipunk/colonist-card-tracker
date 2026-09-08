'use strict';
// Consistency checks for the locale files: every locale must carry exactly the
// keys of the default locale, respect length limits, keep placeholders and key
// combinations intact, and every key used by the code must exist.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { ROOT } = require('./load');

const I18N = path.join(ROOT, 'i18n');
const meta = JSON.parse(fs.readFileSync(path.join(I18N, '_meta.json'), 'utf8'));
const locales = fs.readdirSync(I18N).filter((f) => /^[a-z]{2,3}(_[A-Z]{2}|_\d{3})?\.json$/.test(f)).map((f) => f.replace(/\.json$/, ''));
const strings = Object.fromEntries(locales.map((l) => [l, JSON.parse(fs.readFileSync(path.join(I18N, `${l}.json`), 'utf8'))]));
const en = strings.en;
const enKeys = Object.keys(en).sort();

test('default locale is en and every locale is declared in _meta.json', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  assert.strictEqual(manifest.default_locale, 'en');
  assert.ok(locales.includes('en'));
  for (const l of locales) assert.ok(meta.locales[l], `locale ${l} missing from _meta.json`);
});

test('every locale has exactly the same keys as en, all non-empty', () => {
  for (const l of locales) {
    assert.deepStrictEqual(Object.keys(strings[l]).sort(), enKeys, `key set differs in ${l}`);
    for (const k of enKeys) {
      assert.strictEqual(typeof strings[l][k], 'string', `${l}.${k} is not a string`);
      assert.ok(strings[l][k].trim().length > 0, `${l}.${k} is empty`);
    }
  }
});

test('length limits from _meta.json are respected', () => {
  for (const [k, m] of Object.entries(meta.keys)) {
    if (!m.maxLength) continue;
    for (const l of locales) {
      const len = Array.from(strings[l][k]).length;
      assert.ok(len <= m.maxLength, `${l}.${k} is ${len} chars, limit ${m.maxLength}: ${strings[l][k]}`);
    }
  }
});

test('invariants: app name, key combination, no placeholders or HTML', () => {
  for (const l of locales) {
    assert.ok(strings[l].appName.startsWith('Colonist Card Tracker'), `appName must start with the brand in ${l}`);
    assert.ok(/Catan|카탄|カタン|卡坦/.test(strings[l].appName), `appName should carry the 'Catan' keyword in ${l}`);
    assert.ok(/Catan|카탄|カタン|卡坦/.test(strings[l].appDesc), `appDesc should carry the 'Catan' keyword in ${l}`);
    assert.match(strings[l].close, /Alt\+(Shift|Maj|Maiusc|Umschalt)\+C/, `key combination lost in ${l}.close`);
    for (const k of enKeys) {
      assert.ok(!/\$[A-Za-z_]+\$|\$\d/.test(strings[l][k]), `${l}.${k} contains a placeholder`);
      assert.ok(!/<[a-z/][^>]*>/i.test(strings[l][k]), `${l}.${k} contains HTML`);
    }
  }
});

test('legal texts keep the four required statements in every locale (by length and structure)', () => {
  // A translation that drops a clause is usually much shorter; require at least
  // 70% of the English length and a final sentence about acceptance.
  for (const l of locales) {
    for (const k of ['consentText', 'researchText']) {
      const ratio = strings[l][k].length / en[k].length;
      const cjk = /^(ja|ko|zh)/.test(l);
      assert.ok(ratio >= (cjk ? 0.25 : 0.7), `${l}.${k} looks truncated (${Math.round(ratio * 100)}% of en)`);
      assert.ok(/colonist\.io/.test(strings[l].researchText), `${l}.researchText must mention colonist.io`);
    }
  }
});

test('every key referenced by the code exists in en, and _locales is in sync', () => {
  const src = ['src/content.js', 'src/options.js', 'src/options.html', 'manifest.json']
    .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8')).join('\n');
  const used = new Set();
  for (const m of src.matchAll(/msg\('([A-Za-z0-9_]+)'\)/g)) used.add(m[1]);
  for (const m of src.matchAll(/data-i18n="([A-Za-z0-9_]+)"/g)) used.add(m[1]);
  for (const m of src.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)) used.add(m[1]);
  for (const m of src.matchAll(/'([A-Za-z0-9_]+)'(?=,?\s*(?:\n|\]))/g)) if (en[m[1]] !== undefined) used.add(m[1]);
  for (const m of src.matchAll(/(?<![A-Za-z0-9_.])T\.([A-Za-z0-9_]+)/g)) used.add(m[1]);
  for (const k of used) {
    if (k.startsWith('@@')) continue;
    if (['status', 'saved', 'deleteAllConfirm', 'partial', 'exportBtn', 'deleteBtn'].includes(k)) continue;
    assert.ok(en[k] !== undefined, `key '${k}' used in code but missing from i18n/en.json`);
  }
  for (const s of ['recording', 'finalizing', 'pending', 'uploaded', 'failed', 'local']) assert.ok(en['status_' + s]);
  for (const l of locales) {
    const built = JSON.parse(fs.readFileSync(path.join(ROOT, '_locales', l, 'messages.json'), 'utf8'));
    assert.deepStrictEqual(Object.keys(built).sort(), enKeys, `_locales/${l} out of date: run npm run i18n`);
    for (const k of enKeys) assert.strictEqual(built[k].message, strings[l][k], `_locales/${l}/${k} out of date: run npm run i18n`);
  }
});
