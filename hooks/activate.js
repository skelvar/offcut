#!/usr/bin/env node
// SessionStart — write state, emit the full ruleset. Matcher: startup|resume|clear|compact|fork

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, emit } from './host.js';
import {
  activateSession,
  resetTurn,
  resetSuppression,
  CONTEXT_WIPING_SOURCES,
} from './state.js';
import { sessionContext } from './rules.js';

export async function handleActivate(norm) {
  if (!norm) return null;

  const mode = activateSession();
  resetTurn(norm.sessionId);

  // clear/compact/fork wipe model context — re-allow challenges. resume keeps transcript.
  const source = String(norm.source || '').toLowerCase();
  if (CONTEXT_WIPING_SOURCES.includes(source)) {
    resetSuppression(norm.sessionId);
  }

  if (mode === 'off') return null;

  return emit(norm.host, 'session_start', sessionContext(mode));
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runHook(({ norm }) => handleActivate(norm));
}
