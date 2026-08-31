#!/usr/bin/env node
// Install Offcut hooks into every detected harness.
//
//   node tools/install.mjs            # install
//   node tools/install.mjs --uninstall
//
// Safety contract (same as install-probe.mjs):
//   - every pre-existing file gets one original snapshot next to it
//   - existing hooks are MERGED, never replaced
//   - malformed existing configs are reported and left byte-for-byte intact
//   - every entry it adds is tagged, so --uninstall removes only ours
//   - a harness that is not installed is skipped, not created
//
// Path resolution (Phase 3 measurement 2026-08-24):
//   ${CLAUDE_PLUGIN_ROOT} is absent from settings/hooks-dir installs on all
//   three hosts. Grok silently ignores an `args` array. This installer writes
//   absolute paths as a single `command` string — the form that worked on
//   Claude, Codex, Cursor, and Grok. Hook scripts are not modified.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import {
  nativeInstallTargets,
  NATIVE_MANAGED_START,
  NATIVE_MANAGED_END,
} from '../hooks/host.js';

const HOME = os.homedir();
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TAG = 'offcut-hooks';
export const MANAGED_START = NATIVE_MANAGED_START;
export const MANAGED_END = NATIVE_MANAGED_END;
const uninstall = process.argv.includes('--uninstall');
const KERNEL = fs.readFileSync(path.join(ROOT, 'rules', 'offcut.md'), 'utf8').trim();
const CURSOR_FRONTMATTER = '---\nalwaysApply: true\n---\n';

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
        command: `${hookCommand(script)} ${TAG}`,
        timeout: 5,
        statusMessage: TAG,
      },
    ],
  };
}

function cursorHandler(event, matcher) {
  return {
    command: `${hookCommand(absScript(SCRIPTS[event]))} ${TAG}`,
    ...(matcher ? { matcher } : {}),
    timeout: 5,
  };
}

const PASCAL = {
  SessionStart: [pascalGroup('SessionStart', 'startup|resume|clear|compact|fork')],
  SessionEnd: [pascalGroup('SessionEnd')],
  UserPromptSubmit: [pascalGroup('UserPromptSubmit')],
  SubagentStart: [pascalGroup('SubagentStart')],
  // apply_patch is Codex's write tool — Write|Edit alone does not match it
  // (measured Phase 9: PreToolUse silent, no fired-* for apply_patch session).
  PreToolUse: [pascalGroup('PreToolUse', 'Write|Edit|apply_patch')],
  PostToolUse: [pascalGroup('PostToolUse', 'Write|Edit|apply_patch')],
};

// Cursor's native config is versioned, camelCase, and has flat handlers.
// Its Write tool covers whole-file and patch edits on the measured wire.
const CURSOR = {
  sessionStart: [cursorHandler('SessionStart')],
  sessionEnd: [cursorHandler('SessionEnd')],
  beforeSubmitPrompt: [cursorHandler('UserPromptSubmit')],
  // Cursor 3.17.19 accepts subagentStart additional_context but does not pass
  // it to the child. Its verified delivery seam is a Subagent input rewrite.
  preToolUse: [
    cursorHandler('PreToolUse', 'Write'),
    cursorHandler('SubagentStart', 'Subagent'),
  ],
  postToolUse: [cursorHandler('PostToolUse', 'Write')],
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

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function isValidHookEntry(entry) {
  if (!isRecord(entry)) return false;
  if (entry.hooks === undefined) return true;
  return Array.isArray(entry.hooks) && entry.hooks.every(isRecord);
}

function isValidHookConfig(config) {
  if (!isRecord(config)) return false;
  if (config.hooks === undefined) return true;
  if (!isRecord(config.hooks)) return false;
  return Object.values(config.hooks).every(
    (entries) => Array.isArray(entries) && entries.every(isValidHookEntry),
  );
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
  // Remove the prior Offcut shape from every event first. This also migrates
  // hooks that moved between lifecycle seams in a newer release. PascalCase
  // groups can contain handlers from multiple owners, so filter their nested
  // hooks instead of deleting a whole group when only one handler is ours.
  for (const [event, groups] of Object.entries(target)) {
    const kept = groups.flatMap((group) => {
      if (!Array.isArray(group?.hooks)) return ours(group) ? [] : [group];
      const hooks = group.hooks.filter((handler) => !ours(handler));
      if (!hooks.length) return [];
      if (hooks.length === group.hooks.length) return [group];
      return [{ ...group, hooks }];
    });
    if (kept.length) target[event] = kept;
    else delete target[event];
  }
  if (!remove) {
    for (const [event, groups] of Object.entries(spec)) {
      target[event] = [...(target[event] || []), ...groups];
    }
  }
  return target;
}

/**
 * Add, replace, or remove Offcut's bounded instruction block without touching
 * any foreign bytes. The leading separator belongs to the managed fragment, so
 * uninstall restores the exact prior content.
 * @param {string} current
 * @param {string} kernel
 * @param {{ uninstall?: boolean }} [opts]
 * @returns {string}
 */
export function mergeManagedText(current, kernel, opts = {}) {
  let text = String(current ?? '');
  const startAtZero = text.startsWith(MANAGED_START) ? 0 : -1;
  const separatedStart = text.indexOf(`\n${MANAGED_START}`);
  const start = startAtZero === 0 ? 0 : separatedStart;
  if (start !== -1) {
    const markerStart = start === 0 ? 0 : start + 1;
    const end = text.indexOf(MANAGED_END, markerStart);
    if (end !== -1) {
      let after = end + MANAGED_END.length;
      if (text[after] === '\r' && text[after + 1] === '\n') after += 2;
      else if (text[after] === '\n') after += 1;
      text = text.slice(0, start) + text.slice(after);
    }
  }
  if (opts.uninstall) return text;

  const block = `${MANAGED_START}\n${String(kernel).trim()}\n${MANAGED_END}\n`;
  return text ? `${text}\n${block}` : block;
}

const results = [];
let failed = false;

function apply(name, file, mutate, requiredDir, validate = () => true) {
  if (requiredDir && !fs.existsSync(requiredDir)) {
    results.push([name, 'skipped — harness not installed', file]);
    return;
  }
  if (uninstall && !fs.existsSync(file)) {
    results.push([name, 'skipped — nothing to remove', file]);
    return;
  }
  const exists = fs.existsSync(file);
  const current = exists ? readJson(file) : null;
  if (exists && (!isValidHookConfig(current) || !validate(current))) {
    failed = true;
    results.push([name, 'failed — invalid JSON or hooks config', file]);
    return;
  }
  try {
    const state = backup(file);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const out = mutate(current);
    if (out === null) {
      if (fs.existsSync(file)) fs.rmSync(file);
      results.push([name, 'removed', file]);
      return;
    }
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    results.push([name, uninstall ? `cleaned (${state})` : `installed (${state})`, file]);
  } catch (error) {
    failed = true;
    const kind = error?.code ? `filesystem error (${error.code})` : 'install error';
    results.push([name, `failed — ${kind}`, file]);
  }
}

function applyNative(target) {
  const { host, file, requiredDir } = target;
  const name = `${host} rules`;
  if (!fs.existsSync(requiredDir)) {
    results.push([name, 'skipped — harness not installed', file]);
    return;
  }
  if (uninstall && !fs.existsSync(file)) {
    results.push([name, 'skipped — nothing to remove', file]);
    return;
  }

  try {
    const exists = fs.existsSync(file);
    const state = backup(file);
    const current = exists
      ? fs.readFileSync(file, 'utf8')
      : host === 'cursor'
        ? CURSOR_FRONTMATTER
        : '';
    let out = mergeManagedText(current, KERNEL, { uninstall });
    if (host === 'cursor' && out === CURSOR_FRONTMATTER) out = '';
    if (!out) {
      if (exists) fs.rmSync(file);
      results.push([name, 'removed', file]);
      return;
    }
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, out, 'utf8');
    results.push([name, uninstall ? `cleaned (${state})` : `installed (${state})`, file]);
  } catch (error) {
    failed = true;
    const kind = error?.code ? `filesystem error (${error.code})` : 'install error';
    results.push([name, `failed — ${kind}`, file]);
  }
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
    'cursor',
    path.join(HOME, '.cursor', 'hooks.json'),
    (cur) => {
      const s = cur || { version: 1 };
      s.version ??= 1;
      const hooks = mergeHooks(s.hooks || {}, CURSOR, { uninstall });
      if (Object.keys(hooks).length) s.hooks = hooks;
      else delete s.hooks;
      return s;
    },
    path.join(HOME, '.cursor'),
    (cur) => cur.version === undefined || cur.version === 1,
  );

  apply(
    'grok',
    path.join(HOME, '.grok', 'hooks', `${TAG}.json`),
    (cur) => {
      const s = cur || {};
      s.hooks = mergeHooks(s.hooks || {}, PASCAL, { uninstall });
      if (!Object.keys(s.hooks).length) delete s.hooks;
      if (uninstall && !Object.keys(s).length) return null;
      return s;
    },
    path.join(HOME, '.grok'),
  );

  for (const target of nativeInstallTargets(HOME)) applyNative(target);

  const w = Math.max(...results.map(([n]) => n.length), 4);
  for (const [n, s, f] of results) {
    console.log(`${n.padEnd(w)}  ${s.padEnd(28)}  ${f}`);
  }
  console.log(
    uninstall
      ? '\nRemoved. Backups kept as *.offcut-backup — delete them when satisfied.\nState dir ~/.offcut/ is left in place; delete it manually if desired.'
      : `\nInstalled from ${ROOT}\nOpen a NEW session on each host (hooks load at session start).\nUninstall: node tools/install.mjs --uninstall`,
  );
  if (failed) process.exitCode = 1;
}

const isMain =
  process.argv[1] &&
  fs.realpathSync(fileURLToPath(import.meta.url)) === fs.realpathSync(process.argv[1]);
if (isMain) main();
