#!/usr/bin/env node
// Mode file read/write. Best-effort: a failed write degrades the mode, never the turn.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export const MODES = Object.freeze(['off', 'lite', 'full', 'strict']);
export const DEFAULT_MODE = 'full';
export const STYLES = Object.freeze(['concise', 'normal']);
export const DEFAULT_STYLE = 'concise';

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

function activeSessionPath() {
  return path.join(stateDir(), 'active-session');
}

function servedPath() {
  return path.join(stateDir(), 'served');
}

// Per-session, not global. Concurrent sessions share one state dir, so a single
// turn file lets one session's SessionStart reset another's lite-mode cadence.
function turnPath(sessionId) {
  const key = sessionKey(sessionId);
  return path.join(stateDir(), key ? `turn-${key}` : 'turn');
}

// One challenge per signal per session. Concurrent sessions must not share this.
function firedPath(sessionId) {
  const key = sessionKey(sessionId);
  return path.join(stateDir(), key ? `fired-${key}` : 'fired');
}

function firedLockPath(sessionId) {
  return `${firedPath(sessionId)}.lock`;
}

function claimPath(key) {
  const safe = String(key || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 160);
  return path.join(stateDir(), safe ? `claim-${safe}` : 'claim');
}

function sessionKey(sessionId) {
  return String(sessionId || '').replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
}

function modePath(sessionId) {
  const key = sessionKey(sessionId);
  return key ? path.join(stateDir(), `mode-${key}`) : null;
}

function stylePath(sessionId) {
  const key = sessionKey(sessionId);
  return path.join(stateDir(), key ? `style-${key}` : 'style');
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

export function normalizeStyle(value) {
  if (value == null) return null;
  const style = String(value).trim().toLowerCase();
  return STYLES.includes(style) ? style : null;
}

function acquireFiredLock(sessionId) {
  const lock = firedLockPath(sessionId);
  ensureDir();
  for (let attempt = 0; attempt < 25; attempt += 1) {
    try {
      return { fd: fs.openSync(lock, 'wx'), lock };
    } catch (error) {
      if (error?.code !== 'EEXIST') return null;
      try {
        const stat = fs.statSync(lock);
        if (Date.now() - stat.mtimeMs > 5_000) {
          const stale = `${lock}.stale-${process.pid}-${Date.now()}-${attempt}`;
          fs.renameSync(lock, stale);
          try {
            fs.unlinkSync(stale);
          } catch {
            // The renamed stale lock no longer blocks progress.
          }
          continue;
        }
      } catch {
        // The lock disappeared between open/stat; retry immediately.
        continue;
      }
      // The critical section is a tiny synchronous JSON update. Bound waiting
      // well below the write-hook budget rather than emitting a duplicate.
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 2);
    }
  }
  return null;
}

function withFiredLock(sessionId, fallback, fn) {
  const acquired = acquireFiredLock(sessionId);
  if (!acquired) return fallback;
  try {
    return fn();
  } catch {
    return fallback;
  } finally {
    try {
      fs.closeSync(acquired.fd);
    } catch {
      // best-effort
    }
    try {
      fs.unlinkSync(acquired.lock);
    } catch {
      // best-effort; stale-lock recovery is bounded on the next call
    }
  }
}

function readModeFile(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
    return normalizeMode(raw);
  } catch {
    return null;
  }
}

function readStyleFile(file) {
  try {
    if (!file || !fs.existsSync(file)) return null;
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
    return normalizeStyle(raw);
  } catch {
    return null;
  }
}

function touchStateFile(file) {
  try {
    const now = new Date();
    fs.utimesSync(file, now, now);
  } catch {
    // Liveness refresh is best-effort; reading the mode still succeeds.
  }
}

function readActiveSession() {
  try {
    if (!fs.existsSync(activeSessionPath())) return null;
    return sessionKey(
      fs.readFileSync(activeSessionPath(), 'utf8').replace(/^\uFEFF/, '').trim(),
    ) || null;
  } catch {
    return null;
  }
}

/**
 * Inspect the active file for display/diagnostics.
 * Hooks still use readMode() which fails safe to the default.
 * @returns {{ state: 'missing' | 'ok' | 'corrupt', mode?: string, mtime?: Date, raw?: string }}
 */
function inspectModeFile(file) {
  try {
    if (!file || !fs.existsSync(file)) return { state: 'missing' };
    const st = fs.statSync(file);
    const raw = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
    const mode = normalizeMode(raw);
    if (!mode) return { state: 'corrupt', raw, mtime: st.mtime };
    return { state: 'ok', mode, mtime: st.mtime };
  } catch {
    return { state: 'missing' };
  }
}

export function inspectActive() {
  return { ...inspectModeFile(activePath()), session: readActiveSession() };
}

export function inspectSessionMode(sessionId) {
  const key = sessionKey(sessionId);
  if (!key) return inspectActive();
  return { ...inspectModeFile(modePath(key)), session: key };
}

/**
 * Record which checkout ran at SessionStart. In active modes this is also the
 * copy that served the ruleset; in off mode it remains an installation witness.
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
 * @param {string} [host]
 * @param {boolean} [emitted]
 * @returns {boolean}
 */
export function writeServedRoot(root, host, emitted = true) {
  const r = String(root ?? '').trim();
  if (!r) return false;
  try {
    ensureDir();
    const payload = {
      root: r,
      ...(String(host ?? '').trim() ? { host: String(host).trim() } : {}),
      ...(emitted === false ? { emitted: false } : {}),
    };
    fs.writeFileSync(servedPath(), JSON.stringify(payload) + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * @returns {{ state: 'missing' | 'ok', root?: string, host?: string, emitted?: boolean, mtime?: Date }}
 */
export function inspectServed() {
  try {
    if (!fs.existsSync(servedPath())) return { state: 'missing' };
    const st = fs.statSync(servedPath());
    const raw = fs.readFileSync(servedPath(), 'utf8').replace(/^\uFEFF/, '').trim();
    let root = raw;
    let host;
    let emitted;
    try {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        root = String(parsed.root ?? '').trim();
        host = String(parsed.host ?? '').trim() || undefined;
        if (typeof parsed.emitted === 'boolean') emitted = parsed.emitted;
      }
    } catch {
      // v0.1 stored the root as one plain-text line
    }
    if (!root) return { state: 'missing' };
    return {
      state: 'ok',
      root,
      ...(host ? { host } : {}),
      ...(emitted !== undefined ? { emitted } : {}),
      mtime: st.mtime,
    };
  } catch {
    return { state: 'missing' };
  }
}

/**
 * Claim one host delivery atomically.
 *
 * A host can load the same plugin from native and compatibility configs at
 * once. Both processes receive the same correlation ids and race, so exclusive
 * creation lets exactly one perform state changes and emit context.
 *
 * offcut: one tiny claim file per correlated hook event; replace this with a
 * locked per-session ledger if long sessions make state-directory growth material.
 *
 * Claims are immutable. The host's correlation id defines a delivery; replacing
 * stale files creates an ABA race where two processes can both win. Distinct
 * events must therefore carry distinct correlation ids. SessionEnd pruning
 * removes claims after the normal stale-state window.
 *
 * @param {string | null | undefined} key
 * @returns {boolean} true for the winner, or on I/O failure (fail open)
 */
export function claimHookDelivery(key) {
  if (!key) return true;
  const file = claimPath(key);
  ensureDir();

  let fd = null;
  try {
    fd = fs.openSync(file, 'wx');
    return true;
  } catch (error) {
    if (error?.code === 'EEXIST') return false;
    return true;
  } finally {
    if (fd !== null) {
      try {
        fs.closeSync(fd);
      } catch {
        // best-effort
      }
    }
  }
}

/**
 * Current session mode. Session-scoped mode wins. A legacy global active file
 * is read only when it has no different session owner; otherwise a session
 * without state starts from the persisted default.
 * Fail-safe for hooks — not for display. Statusline/doctor use inspectActive().
 * @param {string | null | undefined} [sessionId]
 * @returns {string}
 */
export function readMode(sessionId) {
  const key = sessionKey(sessionId);
  if (key) {
    const scopedPath = modePath(key);
    const scoped = readModeFile(scopedPath);
    if (scoped) {
      touchStateFile(scopedPath);
      return scoped;
    }

    // Backward compatibility for a session already running when Offcut is
    // upgraded from the old one-global-active-file format. Once a session-aware
    // write occurs, the owner marker prevents that legacy value crossing into a
    // different conversation.
    const owner = readActiveSession();
    if (!owner || owner === key) {
      const legacy = readModeFile(activePath());
      if (legacy) return legacy;
    }
    return readDefaultMode();
  }

  const active = readModeFile(activePath());
  if (active) return active;
  return readDefaultMode();
}

/**
 * Current response style. A session override wins; otherwise an unscoped
 * benchmark/legacy value wins; absent or corrupt state fails safe to concise.
 * @param {string | null | undefined} [sessionId]
 * @returns {'concise' | 'normal'}
 */
export function readStyle(sessionId) {
  const key = sessionKey(sessionId);
  if (key) {
    const scoped = stylePath(key);
    const style = readStyleFile(scoped);
    if (style) {
      touchStateFile(scoped);
      return style;
    }
    if (fs.existsSync(scoped)) return DEFAULT_STYLE;
  }
  return readStyleFile(stylePath()) || DEFAULT_STYLE;
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
 * @param {string | null | undefined} [sessionId]
 * @returns {boolean} whether the write succeeded
 */
export function writeMode(mode, sessionId) {
  const m = normalizeMode(mode);
  if (!m) return false;
  try {
    ensureDir();
    const key = sessionKey(sessionId);
    if (key) {
      fs.writeFileSync(modePath(key), m + '\n', 'utf8');
      fs.writeFileSync(activeSessionPath(), key + '\n', 'utf8');
    } else {
      try {
        if (fs.existsSync(activeSessionPath())) fs.unlinkSync(activeSessionPath());
      } catch {
        // The legacy/global API deliberately has no session owner.
      }
    }
    // Plain mirror retained for statusline/doctor and older installs. Hook
    // decisions use the session-scoped file whenever a session id is present.
    fs.writeFileSync(activePath(), m + '\n', 'utf8');
    return true;
  } catch {
    return false;
  }
}

/**
 * Clear a session mode so its next SessionStart picks up the persisted default.
 * With no session id, clears the legacy/global active mirror.
 * @param {string | null | undefined} [sessionId]
 * @returns {boolean}
 */
export function clearMode(sessionId) {
  try {
    const key = sessionKey(sessionId);
    if (key) {
      const scoped = modePath(key);
      if (scoped && fs.existsSync(scoped)) fs.unlinkSync(scoped);
      if (readActiveSession() === key) {
        if (fs.existsSync(activePath())) fs.unlinkSync(activePath());
        if (fs.existsSync(activeSessionPath())) fs.unlinkSync(activeSessionPath());
      }
    } else {
      if (fs.existsSync(activePath())) fs.unlinkSync(activePath());
      if (fs.existsSync(activeSessionPath())) fs.unlinkSync(activeSessionPath());
    }
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
 * Activate a session. Existing session state survives resume/clear/compact.
 * A genuinely new session starts from the persisted default, never from another
 * conversation's temporary override. Non-startup lifecycle sources may migrate
 * the legacy global active value when upgrading a session created by v0.2.
 * Always touches the active mirror so doctor can see when SessionStart last ran.
 * @param {string | null | undefined} [sessionId]
 * @param {string | null | undefined} [source]
 * @returns {string} the mode now in effect
 */
export function activateSession(sessionId, source) {
  try {
    ensureDir();
    const key = sessionKey(sessionId);
    if (!key) {
      if (!fs.existsSync(activePath())) {
        const def = readDefaultMode();
        writeMode(def);
        return def;
      }
      const mode = readMode();
      writeMode(mode);
      return mode;
    }

    let mode = readModeFile(modePath(key));
    if (!mode) {
      const lifecycle = String(source || '').toLowerCase();
      const owner = readActiveSession();
      const sameOrLegacyOwner = !owner || owner === key;
      const mayBeLegacyContinuation =
        sameOrLegacyOwner &&
        (CONTEXT_WIPING_SOURCES.includes(lifecycle) || lifecycle === 'resume');
      mode = mayBeLegacyContinuation
        ? readModeFile(activePath()) || readDefaultMode()
        : readDefaultMode();
    }
    writeMode(mode, key);
    return mode;
  } catch {
    // ignore
  }
  return readMode(sessionId);
}

/**
 * @param {string} value
 * @param {string | null | undefined} [sessionId]
 * @returns {boolean}
 */
export function writeStyle(value, sessionId) {
  const style = normalizeStyle(value);
  if (!style) return false;
  try {
    ensureDir();
    fs.writeFileSync(stylePath(sessionId), `${style}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
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
  return withFiredLock(sessionId, true, () => {
    const state = readFiredState(sessionId);
    const id = String(signalId);
    return state.confirmed.has(id) || state.pending.has(id);
  });
}

/**
 * Record a challenge as pending — emitted, not yet evidenced as delivered.
 * @param {string | null | undefined} sessionId
 * @param {string} signalId
 * @returns {boolean}
 */
export function markPendingSignal(sessionId, signalId) {
  if (!signalId) return false;
  return withFiredLock(sessionId, false, () => {
    const state = readFiredState(sessionId);
    const id = String(signalId);
    if (state.confirmed.has(id) || state.pending.has(id)) return false;
    state.pending.add(id);
    writeFiredState(sessionId, state);
    return true;
  });
}

/**
 * Record a signal as confirmed delivered. Moves it out of pending.
 * @param {string | null | undefined} sessionId
 * @param {string} signalId
 * @returns {boolean}
 */
export function markFiredSignal(sessionId, signalId) {
  if (!signalId) return false;
  return withFiredLock(sessionId, false, () => {
    const state = readFiredState(sessionId);
    const id = String(signalId);
    state.pending.delete(id);
    state.confirmed.add(id);
    writeFiredState(sessionId, state);
    return true;
  });
}

/**
 * Promote matching pending signals to confirmed.
 * @param {string | null | undefined} sessionId
 * @param {(id: string) => boolean} [filter]
 * @returns {number} how many were confirmed
 */
export function confirmPendingSignals(sessionId, filter) {
  return withFiredLock(sessionId, 0, () => {
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
  });
}

/**
 * Drop pending signals without confirming — used when the next turn starts
 * without evidence the prior challenge was delivered (dead turn after Pre).
 * @param {string | null | undefined} sessionId
 * @param {(id: string) => boolean} [filter]
 * @returns {number}
 */
export function clearPendingSignals(sessionId, filter) {
  return withFiredLock(sessionId, 0, () => {
    const state = readFiredState(sessionId);
    let n = 0;
    for (const id of [...state.pending]) {
      if (filter && !filter(id)) continue;
      state.pending.delete(id);
      n += 1;
    }
    if (n > 0) writeFiredState(sessionId, state);
    return n;
  });
}

/**
 * Wipe all suppression for a session (context-wiping SessionStart sources).
 * @param {string | null | undefined} sessionId
 * @returns {boolean}
 */
export function resetSuppression(sessionId) {
  return withFiredLock(sessionId, false, () => {
    const p = firedPath(sessionId);
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return true;
  });
}

/**
 * Remove ephemeral turn-* / fired-* / claim-* files older than maxAgeMs.
 * Session modes and styles are user settings and persist until explicitly switched.
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
      if (!/^(turn|fired|claim)(-|$)/.test(name)) continue;
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
    activeSession: activeSessionPath(),
    default: defaultPath(),
    served: servedPath(),
    turn: turnPath(),
    turnFor: turnPath,
    firedFor: firedPath,
    modeFor: modePath,
    style: stylePath(),
    styleFor: stylePath,
    sessionKey,
  };
}
