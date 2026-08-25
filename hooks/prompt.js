#!/usr/bin/env node
// UserPromptSubmit — mode commands + per-turn reminder.
// Default: always inject except /offcut commands and mode off. No keyword classifier.

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { runHook, emit } from './host.js';
import {
  readMode,
  writeMode,
  writeDefaultMode,
  bumpTurn,
  normalizeMode,
  confirmPendingSignals,
  clearPendingSignals,
} from './state.js';
import { reminderText } from './rules.js';

export { reminderText };

/**
 * @param {string} prompt
 * @returns {{ type: 'set' | 'default' | 'command', mode?: string, message?: string } | null}
 */
export function parseModeCommand(prompt) {
  const t = String(prompt ?? '').trim();
  if (!t) return null;

  if (/^stop\s+offcut\s*$/i.test(t) || /^normal\s+mode\s*$/i.test(t)) {
    return { type: 'set', mode: 'off', message: 'Offcut deactivated.' };
  }

  const set = t.match(/^\/offcut\s+(off|lite|full|strict)\s*$/i);
  if (set) {
    const mode = set[1].toLowerCase();
    return {
      type: 'set',
      mode,
      message: mode === 'off' ? 'Offcut deactivated.' : `Offcut mode: ${mode}.`,
    };
  }

  const def = t.match(/^\/offcut\s+default\s+(off|lite|full|strict)\s*$/i);
  if (def) {
    const mode = def[1].toLowerCase();
    return {
      type: 'default',
      mode,
      message: `Offcut default mode set to ${mode}.`,
    };
  }

  // Any other /offcut invocation (Phase 4 commands, typos) — skip the reminder.
  if (/^\/offcut(\s|$)/i.test(t)) {
    return { type: 'command', message: null };
  }

  return null;
}

/**
 * Should the compact reminder fire for this turn?
 * Always-inject default: fire unless mode is off or this is an offcut command.
 * lite: every 3rd turn.
 * @param {string} mode
 * @param {object | null} command
 * @param {string | null} [sessionId] scopes the lite counter to this session
 * @param {(id?: string) => number} [bump]
 */
export function shouldRemind(mode, command, sessionId = null, bump = bumpTurn) {
  if (command) return false;
  const m = normalizeMode(mode) || 'off';
  if (m === 'off') return false;
  if (m === 'lite') {
    const turn = bump(sessionId);
    return turn % 3 === 0;
  }
  // full, strict
  return true;
}

export async function handlePrompt(norm) {
  if (!norm) return null;
  const prompt = norm.prompt ?? '';
  const command = parseModeCommand(prompt);

  // Next turn started: post challenges from the prior turn were delivered enough
  // for the user to continue. Unconfirmed pre challenges mean the turn died
  // before PostToolUse — drop them so the signal can re-fire.
  confirmPendingSignals(norm.sessionId, (id) => String(id).startsWith('post:'));
  clearPendingSignals(norm.sessionId, (id) => !String(id).startsWith('post:'));

  if (command?.type === 'set' && command.mode) {
    writeMode(command.mode);
    return emit(norm.host, 'user_prompt_submit', command.message || `Offcut mode: ${command.mode}.`);
  }

  if (command?.type === 'default' && command.mode) {
    writeDefaultMode(command.mode);
    writeMode(command.mode);
    return emit(norm.host, 'user_prompt_submit', command.message || `Offcut default: ${command.mode}.`);
  }

  if (command?.type === 'command') {
    return null;
  }

  const mode = readMode();
  if (!shouldRemind(mode, null, norm.sessionId)) return null;

  return emit(norm.host, 'user_prompt_submit', reminderText());
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  await runHook(({ norm }) => handlePrompt(norm));
}
