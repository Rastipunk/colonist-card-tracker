'use strict';
// Loads the browser scripts into the Node global scope (they are plain
// scripts, not modules) so the engine can be tested without a bundler.
const vm = require('vm');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function loadScript(rel) {
  const file = path.join(ROOT, rel);
  vm.runInThisContext(fs.readFileSync(file, 'utf8'), { filename: file });
}

function loadEngine() {
  if (!globalThis.CCT || !globalThis.CCT.Tracker) {
    loadScript('src/protocol.js');
    loadScript('src/engine/worlds.js');
    loadScript('src/engine/tracker.js');
  }
  return globalThis.CCT;
}

function loadMsgpack() {
  if (!globalThis.CCTMsgpack) loadScript('src/msgpack.js');
  return globalThis.CCTMsgpack;
}

// ---- helpers to build synthetic colonist frames ----------------------------

function frame(type, payload, sequence, id) {
  return { id: id === undefined ? 130 : id, data: { type, sequence, payload } };
}

/** Log entry as the server sends it. */
function log(type, fields) {
  return { text: Object.assign({ type }, fields || {}) };
}

/** Player state resourceCards for a hidden hand of n cards. */
function hidden(n) { return { 0: n }; }

/** Player state resourceCards for a visible hand: {enum: count}. */
function visible(map) { return map; }

module.exports = { loadEngine, loadMsgpack, loadScript, frame, log, hidden, visible, ROOT };
