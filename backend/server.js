/*
 * Ingest service for Colonist Card Tracker recordings. Zero dependencies.
 *
 *   POST /ingest            body: gzipped CCTR container (from the extension)
 *   GET  /health
 *   GET  /stats             (admin)
 *   GET  /games?after=&limit=   (admin) JSON index
 *   GET  /games/<key>       (admin) download one .cctr.gz
 *
 * Env: PORT, DATA_DIR (persistent volume), INGEST_TOKEN (optional, shared with
 * the extension), ADMIN_TOKEN (required for admin routes), MAX_BYTES.
 *
 * Files: DATA_DIR/games/YYYY/MM/<key>.cctr.gz
 * Index: DATA_DIR/index.sqlite (node:sqlite) plus DATA_DIR/index.jsonl (append-only mirror).
 */
'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PORT = Number(process.env.PORT || 8080);
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const INGEST_TOKEN = process.env.INGEST_TOKEN || '';
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || '';
const MAX_BYTES = Number(process.env.MAX_BYTES || 8 * 1024 * 1024);
const RATE_PER_HOUR = Number(process.env.RATE_PER_HOUR || 60);

fs.mkdirSync(path.join(DATA_DIR, 'games'), { recursive: true });

// ---------------------------------------------------------------- index

let db = null;
try {
  const { DatabaseSync } = require('node:sqlite');
  db = new DatabaseSync(path.join(DATA_DIR, 'index.sqlite'));
  db.exec(`CREATE TABLE IF NOT EXISTS games (
    key TEXT PRIMARY KEY,
    game_id TEXT,
    install TEXT,
    version TEXT,
    received_at INTEGER,
    bytes INTEGER,
    frames INTEGER,
    players INTEGER,
    mode INTEGER,
    perspective INTEGER,
    started_at INTEGER,
    ended_at INTEGER,
    partial INTEGER,
    file TEXT,
    meta TEXT
  );
  CREATE INDEX IF NOT EXISTS games_game_id ON games(game_id);
  CREATE INDEX IF NOT EXISTS games_received ON games(received_at);`);
} catch (e) {
  console.warn('node:sqlite unavailable, using index.jsonl only:', e.message);
}

const jsonlPath = path.join(DATA_DIR, 'index.jsonl');

function indexInsert(row) {
  if (db) {
    db.prepare(`INSERT OR IGNORE INTO games (key, game_id, install, version, received_at, bytes, frames, players, mode, perspective, started_at, ended_at, partial, file, meta)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      row.key, row.game_id, row.install, row.version, row.received_at, row.bytes, row.frames, row.players, row.mode,
      row.perspective, row.started_at, row.ended_at, row.partial ? 1 : 0, row.file, JSON.stringify(row.meta));
  }
  fs.appendFileSync(jsonlPath, JSON.stringify(row) + '\n');
}

function indexHas(key) {
  if (db) return !!db.prepare('SELECT 1 FROM games WHERE key = ?').get(key);
  return fs.existsSync(fileFor(key, new Date()));
}

function indexList(after, limit) {
  if (db) {
    return db.prepare('SELECT key, game_id, install, version, received_at, bytes, frames, players, mode, perspective, started_at, ended_at, partial, file FROM games WHERE received_at > ? ORDER BY received_at ASC LIMIT ?').all(after, limit);
  }
  if (!fs.existsSync(jsonlPath)) return [];
  return fs.readFileSync(jsonlPath, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l))
    .filter((r) => r.received_at > after).slice(0, limit).map((r) => { const c = Object.assign({}, r); delete c.meta; return c; });
}

function indexStats() {
  if (db) return db.prepare('SELECT COUNT(*) AS games, COALESCE(SUM(bytes),0) AS bytes, COUNT(DISTINCT install) AS installs, COUNT(DISTINCT game_id) AS distinct_games FROM games').get();
  const rows = indexList(0, 1e9);
  return { games: rows.length, bytes: rows.reduce((a, r) => a + r.bytes, 0), installs: new Set(rows.map((r) => r.install)).size, distinct_games: new Set(rows.map((r) => r.game_id)).size };
}

function fileFor(key, date) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  // Always forward slashes so the index is portable between Windows and Linux.
  return path.posix.join('games', String(y), m, key + '.cctr.gz');
}

// ---------------------------------------------------------------- helpers

const rate = new Map(); // install -> [timestamps]
function rateOk(install) {
  const now = Date.now();
  const arr = (rate.get(install) || []).filter((t) => now - t < 3600000);
  if (arr.length >= RATE_PER_HOUR) return false;
  arr.push(now);
  rate.set(install, arr);
  return true;
}

function cors(res) {
  res.setHeader('access-control-allow-origin', '*');
  res.setHeader('access-control-allow-methods', 'POST, GET, OPTIONS');
  res.setHeader('access-control-allow-headers', 'content-type, x-cct-version, x-cct-install, x-cct-game, x-cct-key, x-cct-token, authorization');
}

function json(res, code, obj) {
  cors(res);
  res.writeHead(code, { 'content-type': 'application/json' });
  res.end(JSON.stringify(obj));
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) { reject(new Error('too large')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseHeader(gz) {
  // Only inflate enough to read the CCTR header + meta JSON.
  const buf = zlib.gunzipSync(gz, { maxOutputLength: 64 * 1024 * 1024 });
  if (buf.length < 9 || buf.toString('latin1', 0, 4) !== 'CCTR') throw new Error('not a CCTR container');
  const version = buf[4];
  const metaLen = buf.readUInt32BE(5);
  if (metaLen > buf.length - 9) throw new Error('bad meta length');
  const meta = JSON.parse(buf.toString('utf8', 9, 9 + metaLen));
  return { version, meta, rawBytes: buf.length };
}

function isAdmin(req) {
  if (!ADMIN_TOKEN) return false;
  const auth = req.headers.authorization || '';
  const url = new URL(req.url, 'http://x');
  return auth === 'Bearer ' + ADMIN_TOKEN || url.searchParams.get('token') === ADMIN_TOKEN;
}

// ---------------------------------------------------------------- server

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); res.end(); return; }

    if (req.method === 'GET' && url.pathname === '/health') return json(res, 200, { ok: true, time: Date.now() });

    if (req.method === 'POST' && url.pathname === '/ingest') {
      if (INGEST_TOKEN && req.headers['x-cct-token'] !== INGEST_TOKEN) return json(res, 401, { ok: false, error: 'bad token' });
      const install = String(req.headers['x-cct-install'] || 'unknown').replace(/[^a-z0-9]/gi, '').slice(0, 32);
      if (!rateOk(install)) return json(res, 429, { ok: false, error: 'rate limited' });
      const key = String(req.headers['x-cct-key'] || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 120);
      if (!key) return json(res, 400, { ok: false, error: 'missing key' });
      if (indexHas(key)) return json(res, 409, { ok: true, duplicate: true });
      const body = await readBody(req, MAX_BYTES);
      if (body.length < 18 || body[0] !== 0x1f || body[1] !== 0x8b) return json(res, 400, { ok: false, error: 'expected gzip' });
      const { version, meta, rawBytes } = parseHeader(body);
      const now = new Date();
      const rel = fileFor(key, now);
      const abs = path.join(DATA_DIR, rel);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, body);
      indexInsert({
        key,
        game_id: String(meta.gameId || req.headers['x-cct-game'] || ''),
        install,
        version: String(req.headers['x-cct-version'] || meta.recorder || ''),
        received_at: now.getTime(),
        bytes: body.length,
        frames: meta.frames || 0,
        players: Array.isArray(meta.players) ? meta.players.length : (meta.playerCount || 0),
        mode: meta.mode == null ? null : Number(meta.mode),
        perspective: meta.perspective == null ? null : Number(meta.perspective),
        started_at: meta.startedAt || null,
        ended_at: meta.endedAt || null,
        partial: !!meta.partial,
        file: rel,
        meta: Object.assign({}, meta, { formatVersion: version, rawBytes })
      });
      console.log(`ingest ${key} game=${meta.gameId} frames=${meta.frames} bytes=${body.length} raw=${rawBytes}`);
      return json(res, 200, { ok: true, key, bytes: body.length });
    }

    if (req.method === 'GET' && url.pathname === '/stats') {
      if (!isAdmin(req)) return json(res, 401, { ok: false });
      return json(res, 200, Object.assign({ ok: true }, indexStats()));
    }

    if (req.method === 'GET' && url.pathname === '/games') {
      if (!isAdmin(req)) return json(res, 401, { ok: false });
      const after = Number(url.searchParams.get('after') || 0);
      const limit = Math.min(1000, Number(url.searchParams.get('limit') || 200));
      return json(res, 200, { ok: true, games: indexList(after, limit) });
    }

    const m = req.method === 'GET' && url.pathname.match(/^\/games\/([a-z0-9_-]+)$/i);
    if (m) {
      if (!isAdmin(req)) return json(res, 401, { ok: false });
      const rows = db ? [db.prepare('SELECT file FROM games WHERE key = ?').get(m[1])] : indexList(0, 1e9).filter((r) => r.key === m[1]);
      const row = rows[0];
      if (!row) return json(res, 404, { ok: false });
      cors(res);
      res.writeHead(200, { 'content-type': 'application/gzip', 'content-disposition': `attachment; filename="${m[1]}.cctr.gz"` });
      fs.createReadStream(path.join(DATA_DIR, row.file)).pipe(res);
      return;
    }

    json(res, 404, { ok: false, error: 'not found' });
  } catch (e) {
    const code = /too large/.test(String(e.message)) ? 413 : 400;
    json(res, code, { ok: false, error: e.message });
  }
});

server.listen(PORT, () => console.log(`cct ingest listening on :${PORT}, data in ${DATA_DIR}, sqlite=${!!db}`));
