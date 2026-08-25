#!/usr/bin/env node
// PreToolUse — challenge before the write lands. Matcher: Write|Edit
// Default to context, never deny. Escalate only in strict, only for new-dependency.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, gate } from './host.js';
import { readMode, hasFiredSignal, markPendingSignal } from './state.js';
import { PRE_SIGNALS, extractWriteFields, runSignals } from './signals.js';

/**
 * Resolve whether the target path already exists.
 * Single stat on the write target — not a repo scan.
 * @param {string | null} filePath
 * @param {string | null | undefined} cwd
 * @returns {boolean | null} null when unknown
 */
export function pathExists(filePath, cwd) {
  if (!filePath) return null;
  try {
    const resolved = path.isAbsolute(filePath)
      ? filePath
      : path.resolve(cwd || process.cwd(), filePath);
    return fs.existsSync(resolved);
  } catch {
    return null;
  }
}

/**
 * Build the write view a signal inspects.
 * @param {ReturnType<import('./host.js').normalize>} norm
 */
export function buildPreView(norm) {
  const writeTool = norm.writeTool || { isWrite: false, shape: null };
  if (!writeTool.isWrite || !writeTool.shape) return null;

  const fields = extractWriteFields(norm.toolInput, writeTool.shape);
  // Fragment create (empty old_string + new path) still counts as a new file.
  let exists = pathExists(fields.path, norm.cwd);
  if (
    writeTool.shape === 'fragment' &&
    exists === false &&
    fields.addedContent &&
    !(norm.toolInput && (norm.toolInput.old_string || norm.toolInput.oldString))
  ) {
    // keep exists === false
  }

  return {
    path: fields.path,
    content: fields.content,
    addedContent: fields.addedContent,
    shape: writeTool.shape,
    pathExists: exists,
    truncated: Boolean(norm.toolInputTruncated),
    context: 'write',
  };
}

/**
 * Pick one signal to challenge: first unfired hit, once per session.
 * @param {ReturnType<import('./host.js').normalize>} norm
 * @param {string} mode
 */
export function decidePreWrite(norm, mode) {
  if (!norm || mode === 'off') return null;
  const writeTool = norm.writeTool || { isWrite: false };
  if (!writeTool.isWrite) return null;

  const view = buildPreView(norm);
  if (!view) return null;

  const hits = runSignals(PRE_SIGNALS, view);
  for (const signal of hits) {
    if (hasFiredSignal(norm.sessionId, signal.id)) continue;
    // Pending until PostToolUse (or cleared on next prompt if the turn died).
    markPendingSignal(norm.sessionId, signal.id);

    const escalate =
      mode === 'strict' && signal.id === 'new-dependency';

    if (escalate) {
      return {
        kind: 'escalate',
        reason: signal.message,
        context: signal.message,
        event: 'pre_tool_use',
      };
    }
    return {
      kind: 'context',
      context: signal.message,
      event: 'pre_tool_use',
    };
  }
  return null;
}

export async function handlePreWrite(norm) {
  if (!norm) return null;
  const mode = readMode();
  const decision = decidePreWrite(norm, mode);
  if (!decision) return null;
  return gate(norm.host, decision);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runHook(({ norm }) => handlePreWrite(norm));
}
