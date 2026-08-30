#!/usr/bin/env node
// PostToolUse — name what got added that nobody asked for. Matcher: Write|Edit|apply_patch
// Cannot block; inject one line when a signal fires.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, emit } from './host.js';
import {
  readMode,
  markPendingSignal,
  confirmPendingSignals,
} from './state.js';
import { POST_SIGNALS, extractWriteFields, runSignals } from './signals.js';

/**
 * @param {ReturnType<import('./host.js').normalize>} norm
 */
export function buildPostView(norm) {
  const writeTool = norm.writeTool || { isWrite: false, shape: null };
  if (!writeTool.isWrite || !writeTool.shape) return null;

  const fields = extractWriteFields(norm.toolInput, writeTool.shape);
  return {
    path: fields.path,
    content: fields.content,
    addedContent: fields.addedContent,
    shape: writeTool.shape,
    pathExists: true,
    // Decline content signals when either side was truncated.
    truncated: Boolean(norm.toolInputTruncated || norm.toolResultTruncated),
    context: 'write',
  };
}

/**
 * @param {ReturnType<import('./host.js').normalize>} norm
 * @param {string} mode
 */
export function decidePostWrite(norm, mode) {
  if (!norm || mode === 'off') return null;
  const writeTool = norm.writeTool || { isWrite: false };
  if (!writeTool.isWrite) return null;

  // Write completed after a Pre challenge — evidence the turn progressed.
  confirmPendingSignals(norm.sessionId, (id) => !String(id).startsWith('post:'));

  const view = buildPostView(norm);
  if (!view) return null;

  const hits = runSignals(POST_SIGNALS, view);
  for (const signal of hits) {
    // Pending until the next UserPromptSubmit confirms the prior turn continued.
    if (!markPendingSignal(norm.sessionId, `post:${signal.id}`)) continue;
    return signal.message;
  }
  return null;
}

export async function handlePostWrite(norm) {
  if (!norm) return null;
  const mode = readMode(norm.sessionId);
  const message = decidePostWrite(norm, mode);
  if (!message) return null;
  return emit(norm.host, 'post_tool_use', message);
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runHook(({ norm }) => handlePostWrite(norm));
}
