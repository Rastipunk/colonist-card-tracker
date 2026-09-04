/*
 * Builds dist/colonist-card-tracker-<version>.zip with only the files the
 * extension needs (for sharing or for the Chrome Web Store).
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, 'stage');
fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });

const files = ['manifest.json', 'src', 'icons'];
for (const f of files) fs.cpSync(path.join(ROOT, f), path.join(STAGE, f), { recursive: true });

const zip = path.join(DIST, `colonist-card-tracker-${manifest.version}.zip`);
fs.rmSync(zip, { force: true });
if (process.platform === 'win32') {
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Compress-Archive -Path '${STAGE}\\*' -DestinationPath '${zip}' -Force`]);
} else {
  execFileSync('zip', ['-r', zip, '.'], { cwd: STAGE });
}
fs.rmSync(STAGE, { recursive: true, force: true });
console.log('built', zip);
