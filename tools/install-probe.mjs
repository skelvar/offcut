#!/usr/bin/env node
// Installs the Offcut host probe into every detected harness.
//
//   node tools/install-probe.mjs            # install
//   node tools/install-probe.mjs --uninstall
//
// Safety contract:
//   - every file it touches is backed up first, next to the original
//   - existing hooks are MERGED, never replaced
//   - every entry it adds is tagged, so --uninstall removes only ours
//   - a harness that is not installed is skipped, not created

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const HOME = os.homedir();
const PROBE = path.resolve(import.meta.dirname, 'probe.mjs').replace(/\\/g, '/');
const TAG = 'offcut-probe';
const uninstall = process.argv.includes('--uninstall');

if (!fs.existsSync(PROBE)) {
  console.error(`probe not found at ${PROBE}`);
  process.exit(1);
}

const cmd = (label) => `node "${PROBE}" ${label}`;
const isOurs = (o) => JSON.stringify(o).includes(TAG) || JSON.stringify(o).includes('probe.mjs');

// Claude / Codex / Grok share this schema — verified against a real
// ~/.codex/hooks.json and Grok's shipped hooks documentation.
const pascalGroup = (label, matcher) => ({
  ...(matcher ? { matcher } : {}),
  hooks: [{ type: 'command', command: cmd(label), timeout: 5, statusMessage: TAG }],
});

const PASCAL = {
  SessionStart: [pascalGroup('SessionStart')],
  UserPromptSubmit: [pascalGroup('UserPromptSubmit')],
  PreToolUse: [pascalGroup('PreToolUse', 'Write|Edit')],
  PostToolUse: [pascalGroup('PostToolUse', 'Write|Edit')],
  SubagentStart: [pascalGroup('SubagentStart')],
};

// Cursor: camelCase events, flat handlers, version field.
const CURSOR = {
  version: 1,
  hooks: {
    sessionStart: [{ command: cmd(`cursor-sessionStart-${TAG}`) }],
    beforeSubmitPrompt: [{ command: cmd(`cursor-beforeSubmitPrompt-${TAG}`) }],
    preToolUse: [{ command: cmd(`cursor-preToolUse-${TAG}`) }],
    afterFileEdit: [{ command: cmd(`cursor-afterFileEdit-${TAG}`) }],
  },
};

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^﻿/, '')); }
  catch { return null; }
}

function backup(p) {
  if (!fs.existsSync(p)) return 'new';
  const b = `${p}.offcut-backup`;
  if (!fs.existsSync(b)) fs.copyFileSync(p, b);
  return 'backed up';
}

// Merge our groups into an existing hooks object without disturbing anything
// already there. Ours are stripped first so re-running is idempotent.
function mergeHooks(target, spec) {
  for (const [event, groups] of Object.entries(spec)) {
    const kept = (target[event] || []).filter((g) => !isOurs(g));
    const merged = uninstall ? kept : [...kept, ...groups];
    if (merged.length) target[event] = merged;
    else delete target[event];
  }
  return target;
}

const results = [];

function apply(name, file, mutate, requiredDir) {
  if (requiredDir && !fs.existsSync(requiredDir)) {
    results.push([name, 'skipped — harness not installed', file]);
    return;
  }
  if (uninstall && !fs.existsSync(file)) {
    results.push([name, 'skipped — nothing to remove', file]);
    return;
  }
  const state = backup(file);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const out = mutate(readJson(file));
  if (out === null) {
    if (fs.existsSync(file)) fs.rmSync(file);
    results.push([name, 'removed', file]);
    return;
  }
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  results.push([name, uninstall ? `cleaned (${state})` : `installed (${state})`, file]);
}

// Claude Code — settings.json holds much more than hooks; touch only .hooks
apply('claude', path.join(HOME, '.claude', 'settings.json'), (cur) => {
  const s = cur || {};
  s.hooks = mergeHooks(s.hooks || {}, PASCAL);
  if (!Object.keys(s.hooks).length) delete s.hooks;
  return s;
}, path.join(HOME, '.claude'));

// Codex — same schema; may already contain another plugin's hook
apply('codex', path.join(HOME, '.codex', 'hooks.json'), (cur) => {
  const s = cur || {};
  s.hooks = mergeHooks(s.hooks || {}, PASCAL);
  return s;
}, path.join(HOME, '.codex'));

// Grok — reads every file in ~/.grok/hooks/, so ours can stand alone
apply('grok', path.join(HOME, '.grok', 'hooks', `${TAG}.json`),
  () => (uninstall ? null : { hooks: PASCAL }),
  path.join(HOME, '.grok'));

// Cursor — camelCase dialect
apply('cursor', path.join(HOME, '.cursor', 'hooks.json'), (cur) => {
  if (uninstall) {
    if (!cur) return null;
    cur.hooks = mergeHooks(cur.hooks || {}, CURSOR.hooks);
    return Object.keys(cur.hooks || {}).length ? cur : null;
  }
  const s = cur || { version: 1, hooks: {} };
  s.version = s.version ?? 1;
  s.hooks = mergeHooks(s.hooks || {}, CURSOR.hooks);
  return s;
}, path.join(HOME, '.cursor'));

const w = Math.max(...results.map(([n]) => n.length));
for (const [n, s, f] of results) console.log(`${n.padEnd(w)}  ${s.padEnd(28)}  ${f}`);

console.log(`\nprobe log: ${path.join(HOME, '.offcut-probe.jsonl')}`);
console.log(uninstall
  ? 'Removed. Backups kept as *.offcut-backup — delete them when satisfied.'
  : 'Now run one prompt in each harness that edits a file, then: node tools/report-probe.mjs');
