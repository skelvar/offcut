#!/usr/bin/env node
// Install Offcut hooks into every detected harness.
//
//   node tools/install.mjs            # install
//   node tools/install.mjs --uninstall
//
// Safety contract (same as install-probe.mjs):
//   - every file it touches is backed up first, next to the original
//   - existing hooks are MERGED, never replaced
//   - every entry it adds is tagged, so --uninstall removes only ours
//   - a harness that is not installed is skipped, not created
//
// Path resolution (Phase 3 measurement 2026-08-24):
//   ${CLAUDE_PLUGIN_ROOT} is absent from settings/hooks-dir installs on all
//   three hosts. Grok silently ignores an `args` array. This installer writes
//   absolute paths as a single `command` string — the form that worked on
//   Claude, Codex, and Grok. Hook scripts are not modified.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const HOME = os.homedir();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAG = 'offcut-hooks';
const uninstall = process.argv.includes('--uninstall');

const SCRIPTS = {
  SessionStart: 'hooks/activate.js',
  SessionEnd: 'hooks/session-end.js',
  UserPromptSubmit: 'hooks/prompt.js',
  SubagentStart: 'hooks/subagent.js',
  PreToolUse: 'hooks/pre-write.js',
  PostToolUse: 'hooks/post-write.js',
};

/** Absolute forward-slash path to a hook script under this checkout. */
export function absScript(rel, root = ROOT) {
  return path.join(root, rel).replace(/\\/g, '/');
}

/**
 * Single-string command proven on Claude / Codex / Grok (Windows, 2026-08-24).
 *
 * Plain `node "abs"` — not `command`+`args` (Grok ignores args) and not
 * `cmd /c "where node && node …"` (Claude Code on Windows spawns via bash;
 * nested cmd quoting fails silently). Missing `node` fails open on measured
 * hosts rather than hanging the session.
 */
export function hookCommand(scriptAbs, _platform = process.platform) {
  return `node "${scriptAbs}"`;
}

function pascalGroup(event, matcher) {
  const script = absScript(SCRIPTS[event]);
  return {
    ...(matcher ? { matcher } : {}),
    hooks: [
      {
        type: 'command',
        command: hookCommand(script),
        timeout: 5,
        statusMessage: TAG,
      },
    ],
  };
}

const PASCAL = {
  SessionStart: [pascalGroup('SessionStart', 'startup|resume|clear|compact|fork')],
  SessionEnd: [pascalGroup('SessionEnd')],
  UserPromptSubmit: [pascalGroup('UserPromptSubmit')],
  SubagentStart: [pascalGroup('SubagentStart')],
  PreToolUse: [pascalGroup('PreToolUse', 'Write|Edit')],
  PostToolUse: [pascalGroup('PostToolUse', 'Write|Edit')],
};

/** True when a hook group was written by this installer (tag or our script path). */
export function isOurs(o, root = ROOT) {
  const s = JSON.stringify(o);
  if (s.includes(TAG)) return true;
  return Object.values(SCRIPTS).some((rel) => s.includes(absScript(rel, root)));
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

function backup(p) {
  if (!fs.existsSync(p)) return 'new';
  const b = `${p}.offcut-backup`;
  if (!fs.existsSync(b)) fs.copyFileSync(p, b);
  return 'backed up';
}

/**
 * Merge Offcut groups into an existing hooks map without replacing foreign ones.
 * Pure — uninstall is an argument so tests can exercise both directions.
 * @param {Record<string, object[]>} target
 * @param {Record<string, object[]>} spec
 * @param {{ uninstall?: boolean, root?: string }} [opts]
 */
export function mergeHooks(target, spec, opts = {}) {
  const remove = Boolean(opts.uninstall);
  const root = opts.root || ROOT;
  const ours = (o) => isOurs(o, root);
  for (const [event, groups] of Object.entries(spec)) {
    const kept = (target[event] || []).filter((g) => !ours(g));
    const merged = remove ? kept : [...kept, ...groups];
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

function main() {
  apply(
    'claude',
    path.join(HOME, '.claude', 'settings.json'),
    (cur) => {
      const s = cur || {};
      s.hooks = mergeHooks(s.hooks || {}, PASCAL, { uninstall });
      if (!Object.keys(s.hooks).length) delete s.hooks;
      return s;
    },
    path.join(HOME, '.claude'),
  );

  apply(
    'codex',
    path.join(HOME, '.codex', 'hooks.json'),
    (cur) => {
      const s = cur || {};
      s.hooks = mergeHooks(s.hooks || {}, PASCAL, { uninstall });
      return s;
    },
    path.join(HOME, '.codex'),
  );

  apply(
    'grok',
    path.join(HOME, '.grok', 'hooks', `${TAG}.json`),
    () => (uninstall ? null : { hooks: PASCAL }),
    path.join(HOME, '.grok'),
  );

  const w = Math.max(...results.map(([n]) => n.length), 4);
  for (const [n, s, f] of results) {
    console.log(`${n.padEnd(w)}  ${s.padEnd(28)}  ${f}`);
  }
  console.log(
    uninstall
      ? '\nRemoved. Backups kept as *.offcut-backup — delete them when satisfied.\nState dir ~/.offcut/ is left in place; delete it manually if desired.'
      : `\nInstalled from ${ROOT}\nOpen a NEW session on each host (hooks load at session start).\nUninstall: node tools/install.mjs --uninstall`,
  );
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) main();
