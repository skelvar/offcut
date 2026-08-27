#!/usr/bin/env node
// Mode file read/write. Best-effort: a failed write degrades the mode, never the turn.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const MODES = Object.freeze(['off', 'lite', 'full', 'strict']);
export const DEFAULT_MODE = 'full';

/** SessionStart sources that wipe model context — suppression must reset. */
export const CONTEXT_WIPING_SOURCES = Object.freeze(['clear', 'compact', 'fork']);

/** Age after which orphan turn- and fired- files are removed on SessionEnd. */
export const STALE_STATE_MS = 7 * 24 * 60 * 60 * 1000;

function stateDir() {
  return process.env.OFFCUT_STATE_DIR || path.join(os.homedir(), '.offcut');
}

function activePath() {
  return path.join(stateDir(), 'active');
}

function defaultPath() {
  return path.join(stateDir(), 'default');
}

function servedPath() {
  return path.join(stateDir(), 'served');
}

// Per-session, not global. Concurrent sessions share one state dir, so a single
// turn file lets one session's SessionStart reset another's lite-mode cadence.
function turnPath(sessionId) {
  const key = String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return path.join(stateDir(), key ? `turn-${key}` : 'turn');
}

// One challenge per signal per session. Concurrent sessions must not share this.
function firedPath(sessionId) {
  const key = String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
  return path.join(stateDir(), key ? `fired-${key}` : 'fired');
}

function sessionKey(sessionId) {
  return String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
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
 * Inspect the active file for display/diagnostics.
 * Hooks still use readMode() which fails safe to the default.
 * @returns {{ state: 'missing' | 'ok' | 'corrupt', mode?: string, mtime?: Date, raw?: string }}
 */
export function inspectActive() {
  try {
    if (!fs.existsSync(activePath())) return { state: 'missing' };
    const st = fs.statSync(activePath());
    const raw = fs.readFileSync(activePath(), 'utf8').replace(/^\uFEFF/, '').trim();
    const mode = normalizeMode(raw);
    if (!mode) return { state: 'corrupt', raw, mtime: st.mtime };
    return { state: 'ok', mode, mtime: st.mtime };
  } catch {
    return { state: 'missing' };
  }
}

/**
 * Record which checkout served the ruleset at SessionStart.
 *
 * Two copies of Offcut can be installed at once — a working checkout whose hook
 * paths live in the host's settings file, and a host-managed plugin copy that
 * registers itself through its own bundled manifest. Nothing in the settings
 * file mentions the second one, so it cannot be found by inspecting configs;
 * only the hook that ran knows which copy it read. When the two hold different
 * ruleset text the model silently gets whichever hook fires first.
 *
 * Best-effort, like every write here: losing this costs a diagnostic, not a turn.
 * @param {string} root
 * @returns {boolean}
 */
export function writeServedRoot(root) {
  const r = String(root ?? '').trim();
  if (!r) return false;
  try {
    ensureDir();
    fs.writeFileSync(servedPath(), r + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {{ state: 'missing' | 'ok', root?: string, mtime?: Date }}
 */
export function inspectServed() {
  try {
    if (!fs.existsSync(servedPath())) return { state: 'missing' };
    const st = fs.statSync(servedPath());
    const root = fs.readFileSync(servedPath(), 'utf8').replace(/^\uFEFF/, '').trim();
    if (!root) return { state: 'missing' };
    return { state: 'ok', root, mtime: st.mtime };
  } catch {
    return { state: 'missing' };
  }
}

/**
 * Current session mode. Absent/corrupt file → fall back to persisted default, else full.
 * Fail-safe for hooks — not for display. Statusline/doctor use inspectActive().
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
 * Always touches active so doctor can see when SessionStart last ran.
 * @returns {string} the mode now in effect
 */
export function activateSession() {
  try {
    ensureDir();
    if (!fs.existsSync(activePath())) {
      const def = readDefaultMode();
      writeMode(def);
      return def;
    }
    // Rewrite current mode so mtime reflects this activation (doctor freshness).
    const mode = readMode();
    writeMode(mode);
    return mode;
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

/**
 * @returns {{ confirmed: Set<string>, pending: Set<string> }}
 */
function readFiredState(sessionId) {
  try {
    if (!fs.existsSync(firedPath(sessionId))) {
      return { confirmed: new Set(), pending: new Set() };
    }
    const raw = fs.readFileSync(firedPath(sessionId), 'utf8').replace(/^\uFEFF/, '').trim();
    if (!raw) return { confirmed: new Set(), pending: new Set() };
    const parsed = JSON.parse(raw);
    // Legacy format: bare array = confirmed (emit-time marking).
    if (Array.isArray(parsed)) {
      return {
        confirmed: new Set(parsed.map(String)),
        pending: new Set(),
      };
    }
    if (parsed && typeof parsed === 'object') {
      const confirmed = Array.isArray(parsed.confirmed) ? parsed.confirmed.map(String) : [];
      const pending = Array.isArray(parsed.pending) ? parsed.pending.map(String) : [];
      return { confirmed: new Set(confirmed), pending: new Set(pending) };
    }
  } catch {
    // corrupt → empty (fail open: may re-challenge)
  }
  return { confirmed: new Set(), pending: new Set() };
}

/**
 * @param {string | null | undefined} sessionId
 * @param {{ confirmed: Set<string>, pending: Set<string> }} state
 */
function writeFiredState(sessionId, state) {
  ensureDir();
  const payload = {
    confirmed: [...state.confirmed],
    pending: [...state.pending],
  };
  fs.writeFileSync(firedPath(sessionId), JSON.stringify(payload) + '\n', 'utf8');
}

/**
 * Has this signal already challenged this session (pending or confirmed)?
 * @param {string | null | undefined} sessionId
 * @param {string} signalId
 */
export function hasFiredSignal(sessionId, signalId) {
  if (!signalId) return false;
  const state = readFiredState(sessionId);
  const id = String(signalId);
  return state.confirmed.has(id) || state.pending.has(id);
}

/**
 * Record a challenge as pending — emitted, not yet evidenced as delivered.
 * @param {string | null | undefined} sessionId
 * @param {string} signalId
 * @returns {boolean}
 */
export function markPendingSignal(sessionId, signalId) {
  if (!signalId) return false;
  try {
    const state = readFiredState(sessionId);
    const id = String(signalId);
    if (state.confirmed.has(id)) return true;
    state.pending.add(id);
    writeFiredState(sessionId, state);
    return true;
  } catch {
    return false;
  }
}

/**
 * Record a signal as confirmed delivered. Moves it out of pending.
 * @param {string | null | undefined} sessionId
 * @param {string} signalId
 * @returns {boolean}
 */
export function markFiredSignal(sessionId, signalId) {
  if (!signalId) return false;
  try {
    const state = readFiredState(sessionId);
    const id = String(signalId);
    state.pending.delete(id);
    state.confirmed.add(id);
    writeFiredState(sessionId, state);
    return true;
  } catch {
    return false;
  }
}

/**
 * Promote matching pending signals to confirmed.
 * @param {string | null | undefined} sessionId
 * @param {(id: string) => boolean} [filter]
 * @returns {number} how many were confirmed
 */
export function confirmPendingSignals(sessionId, filter) {
  try {
    const state = readFiredState(sessionId);
    let n = 0;
    for (const id of [...state.pending]) {
      if (filter && !filter(id)) continue;
      state.pending.delete(id);
      state.confirmed.add(id);
      n += 1;
    }
    if (n > 0) writeFiredState(sessionId, state);
    return n;
  } catch {
    return 0;
  }
}

/**
 * Drop pending signals without confirming — used when the next turn starts
 * without evidence the prior challenge was delivered (dead turn after Pre).
 * @param {string | null | undefined} sessionId
 * @param {(id: string) => boolean} [filter]
 * @returns {number}
 */
export function clearPendingSignals(sessionId, filter) {
  try {
    const state = readFiredState(sessionId);
    let n = 0;
    for (const id of [...state.pending]) {
      if (filter && !filter(id)) continue;
      state.pending.delete(id);
      n += 1;
    }
    if (n > 0) writeFiredState(sessionId, state);
    return n;
  } catch {
    return 0;
  }
}

/**
 * Wipe all suppression for a session (context-wiping SessionStart sources).
 * @param {string | null | undefined} sessionId
 * @returns {boolean}
 */
export function resetSuppression(sessionId) {
  try {
    const p = firedPath(sessionId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Delete turn-* and fired-* for one session.
 * @param {string | null | undefined} sessionId
 * @returns {boolean}
 */
export function pruneSessionFiles(sessionId) {
  let ok = true;
  for (const p of [turnPath(sessionId), firedPath(sessionId)]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p);
    } catch {
      ok = false;
    }
  }
  return ok;
}

/**
 * Remove turn-* / fired-* files older than maxAgeMs (orphans from crashed sessions).
 * @param {{ maxAgeMs?: number, now?: number }} [opts]
 * @returns {number} files removed
 */
export function pruneStaleFiles(opts = {}) {
  const maxAgeMs = opts.maxAgeMs ?? STALE_STATE_MS;
  const now = opts.now ?? Date.now();
  let removed = 0;
  try {
    const dir = stateDir();
    if (!fs.existsSync(dir)) return 0;
    for (const name of fs.readdirSync(dir)) {
      if (!/^(turn|fired)(-|$)/.test(name)) continue;
      const p = path.join(dir, name);
      try {
        const st = fs.statSync(p);
        if (now - st.mtimeMs >= maxAgeMs) {
          fs.unlinkSync(p);
          removed += 1;
        }
      } catch {
        // skip
      }
    }
  } catch {
    // best-effort
  }
  return removed;
}

/**
 * SessionEnd: drop this session's turn-* (reminder cadence) and prune stale
 * orphans. Keep fired-* — some hosts fire SessionEnd at process exit and then
 * resume the same session id; deleting fired on end made suppression a no-op
 * across resume (measured Phase 9).
 * @param {string | null | undefined} sessionId
 */
export function pruneOnSessionEnd(sessionId) {
  if (sessionId) {
    try {
      const turn = turnPath(sessionId);
      if (fs.existsSync(turn)) fs.unlinkSync(turn);
    } catch {
      // best-effort
    }
  }
  pruneStaleFiles();
}

/** Paths exposed for statusline / tests. */
export function paths() {
  return {
    dir: stateDir(),
    active: activePath(),
    default: defaultPath(),
    served: servedPath(),
    turn: turnPath(),
    turnFor: turnPath,
    firedFor: firedPath,
    sessionKey,
  };
}
