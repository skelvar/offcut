#!/usr/bin/env node
// SessionStart — write state, emit the full ruleset. Matcher: startup|resume|clear|compact|fork

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, emit, pluginRoot, hasNativeGuidance } from './host.js';
import {
  activateSession,
  readStyle,
  resetTurn,
  resetSuppression,
  writeServedRoot,
  CONTEXT_WIPING_SOURCES,
} from './state.js';
import { nativeSessionContext, sessionContext } from './rules.js';

export async function handleActivate(norm, opts = {}) {
  if (!norm) return null;

  const native = opts.native ?? hasNativeGuidance(norm.host);

  const mode = activateSession(norm.sessionId, norm.source);
  resetTurn(norm.sessionId);

  // clear/compact/fork wipe model context — re-allow challenges. resume keeps transcript.
  const source = String(norm.source || '').toLowerCase();
  if (CONTEXT_WIPING_SOURCES.includes(source)) {
    resetSuppression(norm.sessionId);
  }

  // Record which copy actually ran even in off mode. Host-managed plugin
  // installs are absent from user hooks config, so this is also the only
  // execution witness doctor can use when diagnosing duplicate copies.
  const root = pluginRoot();
  writeServedRoot(root, norm.host, mode !== 'off');

  if (mode === 'off') {
    return native
      ? emit(norm.host, 'session_start', nativeSessionContext(mode, readStyle(norm.sessionId)))
      : null;
  }

  // Same root for the record and the emission, so what doctor reads is what the
  // model got — not a second guess at which copy this is.
  const style = readStyle(norm.sessionId);
  const context = native ? nativeSessionContext(mode, style) : sessionContext(mode, root, style);
  return emit(norm.host, 'session_start', context);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runHook(({ norm }) => handleActivate(norm));
}
