#!/usr/bin/env node
// Subagent inheritance. A host whose start event cannot deliver context routes
// this script through preToolUse so the adapter can rewrite the child task.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, emit, gate } from './host.js';
import { readMode, readStyle } from './state.js';
import { sessionContext } from './rules.js';

export async function handleSubagent(norm) {
  if (!norm) return null;
  const mode = readMode(norm.sessionId);
  if (mode === 'off') return null;
  const context = sessionContext(mode, undefined, readStyle(norm.sessionId));

  if (norm.event === 'pre_tool_use' && norm.toolName === 'Subagent') {
    const input = norm.toolInput;
    if (
      !input ||
      typeof input !== 'object' ||
      Array.isArray(input) ||
      typeof input.prompt !== 'string'
    ) {
      return null;
    }
    return gate(norm.host, {
      kind: 'rewrite',
      input: {
        ...input,
        prompt: `${input.prompt}\n\n${context}`,
      },
    });
  }

  if (norm.event !== 'subagent_start') return null;
  // Requires hookSpecificOutput JSON; raw stdout is dropped on this event.
  return emit(norm.host, 'subagent_start', context);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runHook(({ norm }) => handleSubagent(norm));
}
