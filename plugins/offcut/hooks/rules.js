#!/usr/bin/env node
// Ruleset loader + hardcoded fallback. File is the source; fallback keeps a broken install working.

import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot } from './host.js';

export const FALLBACK_RULESET = `OFFCUT — what is the cheapest thing that actually works, and where does it belong?

Before writing anything:
1. Does this need to exist? What breaks if it is skipped?
2. Does it already exist here? Reuse files already open this turn; search only if that does not answer it.
3. Can something else do it? Platform, database constraint, standard library, or an installed dependency — in that order.
4. What is the cheapest thing that actually works — not the cheapest that looks complete?
5. Where does it belong? Which boundary owns this responsibility?

After writing:
6. What did I add that nobody asked for? Name it. Delete it or justify it.

Never cut: understanding the problem, input validation at trust boundaries, error handling that prevents data loss, security controls, accessibility basics, or anything explicitly requested.

Mark deliberate shortcuts with an \`offcut:\` comment naming the ceiling and what to do when it is reached.

Response style:
Offcut is concise by default. OFFCUT STYLE: normal disables only response styling; construction rules remain active. Lead with the result. Skip tool preambles, routine narration, repetition, generic reassurance, and ceremonial sign-offs. Keep the shortest answer that preserves the result, evidence, material caveat, verification, and next action. Use readable prose without a word cap.

Never compress away exact errors, requested code or commands, security or privacy warnings, destructive-action confirmations, accessibility guidance, or material uncertainty. Concision never reduces engineering work, tests, tool use, or correctness.`;

export const REMINDER = `OFFCUT ACTIVE — before you build: does it need to exist? does it already exist here? can the platform or stdlib do it? what is the cheapest thing that works? which boundary owns it?`;

/** Framing-neutral session footer so cheap vs justify differs only in the ruleset body. */
export const SESSION_FOOTER = `Answer the challenge in one line, then act. Prefer the platform and standard library. Leave an \`offcut:\` comment when a deliberate shortcut knowingly cuts a corner.`;

/**
 * Strip YAML frontmatter from a markdown skill file.
 * @param {string} text
 */
export function stripFrontmatter(text) {
  const s = String(text ?? '').replace(/^\uFEFF/, '');
  if (!s.startsWith('---')) return s.trim();
  const end = s.indexOf('\n---', 3);
  if (end === -1) return s.trim();
  const after = s.slice(end + 4);
  return after.replace(/^\r?\n/, '').trim();
}

/**
 * Bench override path: OFFCUT_RULESET_PATH env, or `ruleset-path` file under
 * OFFCUT_STATE_DIR (hooks already read this dir; hosts may drop arbitrary env).
 */
function resolveRulesetOverride() {
  if (process.env.OFFCUT_RULESET_PATH) return process.env.OFFCUT_RULESET_PATH;
  try {
    const dir = process.env.OFFCUT_STATE_DIR;
    if (!dir) return null;
    const marker = path.join(dir, 'ruleset-path');
    if (!fs.existsSync(marker)) return null;
    const p = fs.readFileSync(marker, 'utf8').replace(/^\uFEFF/, '').trim();
    return p || null;
  } catch {
    return null;
  }
}

function resolveReminderOverride() {
  if (process.env.OFFCUT_REMINDER && String(process.env.OFFCUT_REMINDER).trim()) {
    return String(process.env.OFFCUT_REMINDER).trim();
  }
  try {
    const dir = process.env.OFFCUT_STATE_DIR;
    if (!dir) return null;
    const marker = path.join(dir, 'reminder');
    if (!fs.existsSync(marker)) return null;
    const t = fs.readFileSync(marker, 'utf8').replace(/^\uFEFF/, '').trim();
    return t || null;
  } catch {
    return null;
  }
}

/**
 * Load the challenge body from the standalone kernel, or the hardcoded fallback.
 * Bench override: OFFCUT_RULESET_PATH or state-dir `ruleset-path` (Phase 10).
 * @param {string} [root]
 * @returns {{ text: string, source: 'file' | 'fallback' | 'env' }}
 */
export function loadRuleset(root = pluginRoot()) {
  const override = resolveRulesetOverride();
  if (override) {
    try {
      const raw = fs.readFileSync(override, 'utf8');
      const body = stripFrontmatter(raw);
      if (body) return { text: body, source: 'env' };
    } catch {
      // fall through to shipped kernel
    }
  }
  const kernelPath = path.join(root, 'rules', 'offcut.md');
  try {
    const raw = fs.readFileSync(kernelPath, 'utf8');
    const body = stripFrontmatter(raw);
    if (body) return { text: body, source: 'file' };
  } catch {
    // unreadable → fallback
  }
  return { text: FALLBACK_RULESET, source: 'fallback' };
}

/**
 * Compact per-turn reminder. Bench override: OFFCUT_REMINDER or state-dir file.
 */
export function reminderText() {
  const override = resolveReminderOverride();
  if (override) return override;
  return REMINDER;
}

/**
 * Full context block emitted at session start / subagent start.
 * @param {string} mode
 * @param {string} [root]
 * @param {'concise' | 'normal'} [style]
 */
export function sessionContext(mode, root = pluginRoot(), style = 'concise') {
  const { text } = loadRuleset(root);
  const footer =
    (process.env.OFFCUT_SESSION_FOOTER && String(process.env.OFFCUT_SESSION_FOOTER).trim()) ||
    SESSION_FOOTER;
  const stable = [`OFFCUT MODE: ${mode}`, '', text, '', footer].join('\n');
  return style === 'normal' ? `${stable}\n\nOFFCUT STYLE: normal` : stable;
}

/** Compact lifecycle state when the complete kernel is already persistent. */
export function nativeSessionContext(mode, style = 'concise') {
  const effectiveStyle = style === 'normal' ? 'normal' : 'concise';
  if (mode === 'off') {
    return 'OFFCUT MODE: off\nIgnore the installed Offcut kernel for this session.';
  }
  return `OFFCUT MODE: ${mode}\nOFFCUT STYLE: ${effectiveStyle}`;
}
