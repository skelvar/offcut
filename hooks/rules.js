#!/usr/bin/env node
// Ruleset loader + hardcoded fallback. File is the source; fallback keeps a broken install working.

import fs from 'node:fs';
import path from 'node:path';
import { pluginRoot } from './host.js';

export const FALLBACK_RULESET = `OFFCUT — what is the cheapest thing that actually works, and where does it belong?

Before writing anything:
1. Does this need to exist? What breaks if it is skipped?
2. Does it already exist here? Search this repository before writing.
3. Can something else do it? Platform, database constraint, standard library, or an installed dependency — in that order.
4. What is the cheapest thing that actually works — not the cheapest that looks complete?
5. Where does it belong? Which boundary owns this responsibility?

After writing:
6. What did I add that nobody asked for? Name it. Delete it or justify it.

Never cut: understanding the problem, input validation at trust boundaries, error handling that prevents data loss, security controls, accessibility basics, or anything explicitly requested.

Mark deliberate shortcuts with an \`offcut:\` comment naming the ceiling and what to do when it is reached.`;

export const REMINDER = `OFFCUT ACTIVE — before you build: does it need to exist? does it already exist here? can the platform or stdlib do it? what is the cheapest thing that works? which boundary owns it?`;

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
 * Load the challenge body from SKILL.md, or the hardcoded fallback.
 * @param {string} [root]
 * @returns {{ text: string, source: 'file' | 'fallback' }}
 */
export function loadRuleset(root = pluginRoot()) {
  const skillPath = path.join(root, 'skills', 'offcut', 'SKILL.md');
  try {
    const raw = fs.readFileSync(skillPath, 'utf8');
    const body = stripFrontmatter(raw);
    if (body) return { text: body, source: 'file' };
  } catch {
    // unreadable → fallback
  }
  return { text: FALLBACK_RULESET, source: 'fallback' };
}

/**
 * Full context block emitted at session start / subagent start.
 * @param {string} mode
 * @param {string} [root]
 */
export function sessionContext(mode, root = pluginRoot()) {
  const { text } = loadRuleset(root);
  return [
    `OFFCUT MODE: ${mode}`,
    '',
    text,
    '',
    'Answer the challenge before you build. Prefer the platform and standard library. Leave an `offcut:` comment when a cheap answer knowingly cuts a corner.',
  ].join('\n');
}
