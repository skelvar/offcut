#!/usr/bin/env node
// Mode file read/write. Best-effort: a failed write degrades the mode, never the turn.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const MODES = Object.freeze(['off', 'lite', 'full', 'strict']);
export const DEFAULT_MODE = 'full';

function stateDir() {
  return process.env.OFFCUT_STATE_DIR || path.join(os.homedir(), '.offcut');
}

function activePath() {
  return path.join(stateDir(), 'active');
}

function defaultPath() {
  return path.join(stateDir(), 'default');
}

// Per-session, not global. Concurrent sessions share one state dir, so a single
// turn file lets one session's SessionStart reset another's lite-mode cadence.
// offcut: turn files are never pruned — one small file per session id, which is
// fine at human session counts; prune on SessionEnd if a state dir ever grows.
function turnPath(sessionId) {
  const key = String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return path.join(stateDir(), key ? `turn-${key}` : 'turn');
}

function ensureDir() {
  try {
    fs.mkdirSync(stateDir(), { recursive: true });
  } catch {
    // best-effort
  }
}

/**
 * @param {string} value
 * @returns {string | null}
 */
export function normalizeMode(value) {
  if (value == null) return null;
  const m = String(value).trim().toLowerCase();
  return MODES.includes(m) ? m : null;
}

/**
 * Current session mode. Absent file → fall back to persisted default, else off.
 * @returns {string}
 */
export function readMode() {
  try {
    if (fs.existsSync(activePath())) {
      const raw = fs.readFileSync(activePath(), 'utf8').replace(/^\uFEFF/, '').trim();
      const mode = normalizeMode(raw);
      if (mode) return mode;
    }
  } catch {
    // missing/unreadable → fall through
  }
  return readDefaultMode();
}

/**
 * Persisted default for new sessions. Absent → full.
 * @returns {string}
 */
export function readDefaultMode() {
  try {
    if (fs.existsSync(defaultPath())) {
      const raw = fs.readFileSync(defaultPath(), 'utf8').replace(/^\uFEFF/, '').trim();
      const mode = normalizeMode(raw);
      if (mode) return mode;
    }
  } catch {
    // ignore
  }
  return DEFAULT_MODE;
}

/**
 * @param {string} mode
 * @returns {boolean} whether the write succeeded
 */
export function writeMode(mode) {
  const m = normalizeMode(mode);
  if (!m) return false;
  try {
    ensureDir();
    if (m === 'off') {
      try {
        fs.unlinkSync(activePath());
      } catch {
        // absent is fine
      }
      // Keep an explicit off marker so statusline/readMode stay off for the session
      // even when a default is set. Empty unlink alone would fall back to default.
      fs.writeFileSync(activePath(), 'off\n', 'utf8');
      return true;
    }
    fs.writeFileSync(activePath(), m + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear session mode so the next SessionStart picks up the persisted default.
 * @returns {boolean}
 */
export function clearMode() {
  try {
    if (fs.existsSync(activePath())) fs.unlinkSync(activePath());
    return true;
  } catch {
    return false;
  }
}

/**
 * @param {string} mode
 * @returns {boolean}
 */
export function writeDefaultMode(mode) {
  const m = normalizeMode(mode);
  if (!m) return false;
  try {
    ensureDir();
    fs.writeFileSync(defaultPath(), m + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Activate for a new session: seed active from default when no active file exists.
 * @returns {string} the mode now in effect
 */
export function activateSession() {
  try {
    if (!fs.existsSync(activePath())) {
      const def = readDefaultMode();
      writeMode(def);
      return def;
    }
  } catch {
    // ignore
  }
  return readMode();
}

/**
 * Lite-mode turn counter. Increments and returns the new value.
 * @returns {number}
 */
export function bumpTurn(sessionId) {
  try {
    ensureDir();
    let n = 0;
    if (fs.existsSync(turnPath(sessionId))) {
      const raw = fs.readFileSync(turnPath(sessionId), 'utf8').replace(/^\uFEFF/, '').trim();
      n = parseInt(raw, 10);
      if (!Number.isFinite(n) || n < 0) n = 0;
    }
    n += 1;
    fs.writeFileSync(turnPath(sessionId), String(n) + '\n', 'utf8');
    return n;
  } catch {
    return 1;
  }
}

export function resetTurn(sessionId) {
  try {
    ensureDir();
    fs.writeFileSync(turnPath(sessionId), '0\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/** Paths exposed for statusline / tests. */
export function paths() {
  return {
    dir: stateDir(),
    active: activePath(),
    default: defaultPath(),
    turn: turnPath(),
    turnFor: turnPath,
  };
}
