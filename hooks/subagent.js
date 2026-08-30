#!/usr/bin/env node
// Subagent inheritance. A host whose start event cannot deliver context routes
// this script through preToolUse so the adapter can rewrite the child task.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, emit, gate, hasNativeGuidance } from './host.js';
import { readMode, readStyle } from './state.js';
import { nativeSessionContext, sessionContext } from './rules.js';

export async function handleSubagent(norm, opts = {}) {
  if (!norm) return null;
  const native = opts.native ?? hasNativeGuidance(norm.host);
  const mode = readMode(norm.sessionId);
  if (mode === 'off' && !native) return null;
  const style = readStyle(norm.sessionId);
  const context = native ? nativeSessionContext(mode, style) : sessionContext(mode, undefined, style);

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
