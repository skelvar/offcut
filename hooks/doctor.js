#!/usr/bin/env node
// Read-only diagnostic: is Offcut actually working right now?
// Diagnoses; does not repair. Prints `node tools/install.mjs` when fixable.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectActive, inspectServed, paths, DEFAULT_MODE } from './state.js';
import { loadRuleset } from './rules.js';
import {
  pluginRoot,
  HOST_FACTS,
  installTargets,
  managedInstallTargets,
  resolveInstalledScript,
} from './host.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const REPAIR = `node "${path.join(ROOT, 'tools', 'install.mjs').replace(/\\/g, '/')}"`;

/** @typedef {'ok' | 'warn' | 'fail'} Verdict */

const HOOK_SCRIPTS = [
  'hooks/activate.js',
  'hooks/session-end.js',
  'hooks/prompt.js',
  'hooks/subagent.js',
  'hooks/pre-write.js',
  'hooks/post-write.js',
];

/**
 * @param {Verdict} verdict
 * @param {string} check
 * @param {string} detail
 */
function line(verdict, check, detail) {
  const tag = verdict === 'ok' ? 'OK  ' : verdict === 'warn' ? 'WARN' : 'FAIL';
  console.log(`${tag}  ${check}: ${detail}`);
}

function tryWritable(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.doctor-write-${process.pid}`);
    fs.writeFileSync(probe, 'ok\n', 'utf8');
    fs.unlinkSync(probe);
    return true;
  } catch {
    return false;
  }
}

function readJson(p) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return null;
  }
}

const OFFCUT_SCRIPT_RE =
  /hooks[/\\](activate|session-end|prompt|subagent|pre-write|post-write)\.js/i;

/**
 * Collect absolute Offcut script paths from an installed hooks config.
 * Ignores other plugins' hooks that share the same settings file.
 * @param {object | null} config
 * @returns {string[]}
 */
function scriptPathsFromConfig(config) {
  const found = [];
  const hooks = config?.hooks;
  if (!hooks || typeof hooks !== 'object') return found;
  for (const groups of Object.values(hooks)) {
    if (!Array.isArray(groups)) continue;
    for (const group of groups) {
      const handlers = Array.isArray(group?.hooks) ? group.hooks : [group];
      for (const h of handlers) {
        const cmd = String(h?.command || '');
        if (!OFFCUT_SCRIPT_RE.test(cmd) && !cmd.includes('offcut-hooks')) continue;
        const m = cmd.match(/node\s+"([^"]+)"/i) || cmd.match(/node\s+(\S+)/i);
        if (m) found.push(m[1]);
      }
    }
  }
  return found;
}

function detectInstalledHosts() {
  /** @type {{ host: string, file: string, config: object | null, managed?: boolean, root?: string }[]} */
  const out = [];
  for (const t of installTargets()) {
    if (!fs.existsSync(t.requiredDir)) continue;
    if (!fs.existsSync(t.file)) continue;
    const config = readJson(t.file);
    const blob = JSON.stringify(config || {});
    const ours =
      blob.includes('offcut-hooks') ||
      blob.includes('hooks/activate.js') ||
      blob.includes('hooks\\activate.js');
    if (!ours) continue;
    out.push({ host: t.host, file: t.file, config });
  }
  for (const managed of managedInstallTargets()) {
    if (scriptPathsFromConfig(managed.config).length) out.push(managed);
  }
  return out;
}

/** Install-root identity, case-insensitive where the filesystem is. */
function sameDir(a, b) {
  if (!a || !b) return false;
  try {
    const norm = (x) => {
      const r = path.resolve(String(x));
      return process.platform === 'win32' ? r.toLowerCase() : r;
    };
    return norm(a) === norm(b);
  } catch {
    return false;
  }
}

function formatAge(mtime) {
  if (!mtime) return 'unknown';
  const ms = Date.now() - mtime.getTime();
  if (ms < 0) return mtime.toISOString();
  const sec = Math.floor(ms / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 48) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  return `${days}d ago (${mtime.toISOString()})`;
}

export function runDoctor(opts = {}) {
  /** @type {{ verdict: Verdict, check: string, detail: string }[]} */
  const lines = [];
  /** @type {Verdict[]} */
  const verdicts = [];
  const record = (verdict, check, detail) => {
    verdicts.push(verdict);
    lines.push({ verdict, check, detail });
    if (!opts.silent) line(verdict, check, detail);
  };

  const p = paths();

  // 1. state dir exists and is writable
  if (!fs.existsSync(p.dir)) {
    record('fail', 'state dir', `missing — ${p.dir} (hooks have never activated)`);
  } else if (!tryWritable(p.dir)) {
    record('fail', 'state dir', `not writable — ${p.dir}`);
  } else {
    record('ok', 'state dir', `exists and writable — ${p.dir}`);
  }

  // 2. active exists and parses
  const active = inspectActive();
  if (active.state === 'missing') {
    record(
      'fail',
      'active',
      'missing — SessionStart never ran (not "default full")',
    );
  } else if (active.state === 'corrupt') {
    record(
      'fail',
      'active',
      `corrupt — unparseable contents ${JSON.stringify(active.raw?.slice(0, 40) || '')}; hooks fail-safe to "${DEFAULT_MODE}"`,
    );
  } else {
    record('ok', 'active', `ok — mode ${active.mode}`);
  }

  // 3. when activation last ran
  if (active.state === 'ok' || active.state === 'corrupt') {
    const age = formatAge(active.mtime);
    // Every SessionStart rewrites `active`, so its mtime is the last session
    // start. If you are running doctor you are in a session — activation older
    // than a long session means SessionStart did not fire for it. 7 days was
    // far too generous: a checkout moved days ago read as OK while the
    // statusline kept printing a mode.
    const staleMs = 24 * 60 * 60 * 1000;
    const old = active.mtime && Date.now() - active.mtime.getTime() > staleMs;
    record(
      old ? 'warn' : 'ok',
      'activation',
      old
        ? `last touched ${age} — SessionStart has not fired since; hooks are probably not running`
        : `last touched ${age}`,
    );
  } else {
    record('fail', 'activation', 'never — no active file');
  }

  // 4. detected host(s) and tier
  const served = inspectServed();
  const installed = detectInstalledHosts();
  if (!installed.length) {
    record('fail', 'host', 'no Offcut hooks found in known harness configs');
  } else {
    for (const inst of installed) {
      const fact = HOST_FACTS[inst.host];
      const tier = fact?.tier ?? '?';
      const note = fact?.tierNote || '';
      const v = tier === 3 ? 'warn' : 'ok';
      record(
        v,
        `host:${inst.host}`,
        `${fact?.label || inst.host} — tier ${tier} (${note})`,
      );
    }
  }

  // 5. ruleset file readable
  const root = opts.root || pluginRoot();
  const ruleset = loadRuleset(root);
  const skillPath = path.join(root, 'skills', 'offcut', 'SKILL.md');
  if (ruleset.source === 'file') {
    record('ok', 'ruleset', `readable — ${skillPath}`);
  } else {
    record(
      'warn',
      'ruleset',
      `unreadable — using hardcoded fallback (${skillPath})`,
    );
  }

  // 5b. Is the ruleset the model actually received the one sitting here?
  // Check 5 proves a file is readable at this root; it cannot prove a hook read
  // it. Two copies can be installed at once and only the hook that ran knows
  // which it opened, so this compares its record against this root.
  // offcut: a bench OFFCUT_RULESET_PATH override still records the plugin root,
  // so this line reads OK while the override supplies the text. Record the
  // served source alongside the root if that override ever ships to users.
  if (served.state === 'ok' && served.emitted === false) {
    record('ok', 'ruleset served', 'mode was off at SessionStart — no ruleset was served');
  } else if (served.state === 'missing') {
    // No record splits into two very different states. If this copy's hook is
    // newer than the last SessionStart, nothing has run it yet and nothing
    // could have recorded — an upgrade away from a warning, not a fault. If it
    // is older, a session did start with this hook in place and left no
    // record, so some other copy served that session.
    let hookMtime = null;
    try {
      hookMtime = fs.statSync(path.join(root, 'hooks', 'activate.js')).mtime;
    } catch {
      // a missing hook script is check 6's business
    }
    const notRunYet =
      !active.mtime || (hookMtime && hookMtime.getTime() > active.mtime.getTime());
    record(
      notRunYet ? 'ok' : 'warn',
      'ruleset served',
      notRunYet
        ? 'not yet recorded — no session has started since this copy was installed; the next one will name the serving copy'
        : `no record, though a session started ${formatAge(active.mtime)} — this copy would have left one, so another copy served it`,
    );
  } else if (!sameDir(served.root, root)) {
    record(
      'warn',
      'ruleset served',
      `a different copy served it — ${served.root}, not this root (${root}); both are installed, the model gets whichever hook fires, so edits here need never reach it`,
    );
  } else {
    let rulesetMtime = null;
    try {
      rulesetMtime = fs.statSync(skillPath).mtime;
    } catch {
      // unreadable is check 5's business, not this one's
    }
    // served's mtime is the moment the ruleset was read. `active` is the wrong
    // clock here: a mid-session mode switch rewrites it and would hide an edit.
    const editedSince =
      rulesetMtime && served.mtime && rulesetMtime.getTime() > served.mtime.getTime();
    record(
      editedSince ? 'warn' : 'ok',
      'ruleset served',
      editedSince
        ? `this root, but SKILL.md changed ${formatAge(rulesetMtime)} — after the last SessionStart, so the running session still holds the older text; restart to serve it`
        : `this root — ${served.root}`,
    );
  }

  // 6. hook scripts exist in this checkout, and where any installed config points
  let missing = [];
  let checked = 0;
  for (const inst of installed) {
    const refs = scriptPathsFromConfig(inst.config);
    for (let abs of refs) {
      abs = resolveInstalledScript(inst, abs);
      if (abs.includes('${')) continue;
      checked += 1;
      if (!fs.existsSync(abs)) missing.push(abs);
    }
  }
  for (const rel of HOOK_SCRIPTS) {
    const abs = path.join(root, rel);
    checked += 1;
    if (!fs.existsSync(abs)) missing.push(abs);
  }
  missing = [...new Set(missing)];
  if (missing.length) {
    record(
      'fail',
      'hook scripts',
      `missing ${missing.length}/${checked} — moved checkout? e.g. ${missing[0]}`,
    );
  } else {
    record('ok', 'hook scripts', `all referenced scripts present (${checked} checked)`);
  }

  // 7. subagent coverage (own line)
  if (!installed.length) {
    record('fail', 'subagent coverage', 'unknown — no host installed');
  } else {
    for (const inst of installed) {
      const fact = HOST_FACTS[inst.host];
      const status = fact?.subagent || 'unverified';
      const note = fact?.subagentNote || '';
      const v = status === 'verified' ? 'ok' : 'warn';
      record(v, `subagent:${inst.host}`, `${status} — ${note}`);
    }
  }

  // 8. language coverage
  record(
    'warn',
    'language coverage',
    'write-time challenge is JS/TS (+ dependency manifests) only; other languages get the reminder, not write signals',
  );

  if (!opts.silent) {
    console.log('');
    const failed = verdicts.filter((v) => v === 'fail').length;
    const warned = verdicts.filter((v) => v === 'warn').length;
    if (failed) {
      console.log(`Result: ${failed} fail, ${warned} warn — Offcut is not healthy.`);
      console.log('Repair (merges safely, does not rewrite unrelated hooks):');
      console.log(`  ${REPAIR}`);
    } else if (warned) {
      console.log(`Result: ok with ${warned} warn — see lines above.`);
      console.log(`If hooks are missing or paths are wrong: ${REPAIR}`);
    } else {
      console.log('Result: ok — state and hooks look healthy.');
    }
  }

  return {
    lines,
    verdicts,
    failed: verdicts.filter((v) => v === 'fail').length,
    warned: verdicts.filter((v) => v === 'warn').length,
    repairCommand: REPAIR,
  };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = runDoctor();
  process.exit(result.failed ? 1 : 0);
}
