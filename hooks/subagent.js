#!/usr/bin/env node
// SubagentStart — inherit the mode. Match everything; never matcher-filter on agent type.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, emit } from './host.js';
import { readMode } from './state.js';
import { sessionContext } from './rules.js';

export async function handleSubagent(norm) {
  if (!norm) return null;
  const mode = readMode();
  if (mode === 'off') return null;
  // Requires hookSpecificOutput JSON; raw stdout is dropped on this event.
  return emit(norm.host, 'subagent_start', sessionContext(mode));
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runHook(({ norm }) => handleSubagent(norm));
}
