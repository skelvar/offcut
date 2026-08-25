#!/usr/bin/env node
// SessionEnd — prune this session's turn-* and stale orphans. Keep fired-*.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook } from './host.js';
import { pruneOnSessionEnd } from './state.js';

export async function handleSessionEnd(norm) {
  if (!norm) {
    pruneOnSessionEnd(null);
    return null;
  }
  pruneOnSessionEnd(norm.sessionId);
  return null;
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runHook(({ norm }) => handleSessionEnd(norm));
}
