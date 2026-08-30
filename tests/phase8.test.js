import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { normalize, pluginRoot } from '../hooks/host.js';
import {
  writeMode,
  clearMode,
  writeDefaultMode,
  readMode,
  inspectActive,
  writeServedRoot,
  inspectServed,
  hasFiredSignal,
  markFiredSignal,
  markPendingSignal,
  confirmPendingSignals,
  clearPendingSignals,
  resetSuppression,
  pruneOnSessionEnd,
  pruneStaleFiles,
  paths,
  CONTEXT_WIPING_SOURCES,
} from '../hooks/state.js';
import * as stateModule from '../hooks/state.js';
import { handleActivate } from '../hooks/activate.js';
import { handlePrompt } from '../hooks/prompt.js';
import { handlePreWrite } from '../hooks/pre-write.js';
import { handlePostWrite } from '../hooks/post-write.js';
import { handleSessionEnd } from '../hooks/session-end.js';
import { runDoctor } from '../hooks/doctor.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withStateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p8-'));
  const prev = process.env.OFFCUT_STATE_DIR;
  process.env.OFFCUT_STATE_DIR = dir;
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      if (prev === undefined) delete process.env.OFFCUT_STATE_DIR;
      else process.env.OFFCUT_STATE_DIR = prev;
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function runStatuslinePs1(dir, payload = null) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-ExecutionPolicy',
        'Bypass',
        '-File',
        path.join(root, 'hooks', 'statusline.ps1'),
      ],
      {
        env: { ...process.env, OFFCUT_STATE_DIR: dir },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    let stdout = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.on('close', (code) => resolve({ code, stdout: stdout.trim() }));
    child.on('error', reject);
    child.stdin.end(payload == null ? '' : JSON.stringify(payload));
  });
}

function abstractionWrite(dir, sessionId = 's') {
  return normalize({
    hook_event_name: 'PreToolUse',
    session_id: sessionId,
    cwd: dir,
    tool_name: 'Write',
    tool_input: {
      file_path: path.join(dir, 'store.ts'),
      content:
        'interface Store { get(k: string): string }\n' +
        'class MemoryStore implements Store { get(k: string) { return k } }\n',
    },
  });
}

function abstractionPost(dir, sessionId = 's') {
  return normalize({
    hook_event_name: 'PostToolUse',
    session_id: sessionId,
    cwd: dir,
    tool_name: 'Write',
    tool_input: {
      file_path: path.join(dir, 'store.ts'),
      content:
        'interface Store { get(k: string): string }\n' +
        'class MemoryStore implements Store { get(k: string) { return k } }\n',
    },
    tool_response: { ok: true },
  });
}

// --- suppression reset by SessionStart source ---

test('CONTEXT_WIPING_SOURCES are clear/compact/fork only', () => {
  assert.deepEqual([...CONTEXT_WIPING_SOURCES].sort(), ['clear', 'compact', 'fork']);
});

for (const source of ['clear', 'compact', 'fork']) {
  test(`SessionStart(${source}) resets signal suppression`, async () => {
    await withStateDir(async () => {
      writeMode('full');
      markFiredSignal('sid', 'new-file');
      assert.equal(hasFiredSignal('sid', 'new-file'), true);

      await handleActivate(
        normalize({
          hook_event_name: 'SessionStart',
          source,
          session_id: 'sid',
        }),
      );
      assert.equal(
        hasFiredSignal('sid', 'new-file'),
        false,
        `${source} must clear suppression`,
      );
    });
  });
}

test('SessionStart(resume) does NOT reset signal suppression', async () => {
  await withStateDir(async () => {
    writeMode('full');
    markFiredSignal('sid', 'new-file');
    await handleActivate(
      normalize({
        hook_event_name: 'SessionStart',
        source: 'resume',
        session_id: 'sid',
      }),
    );
    assert.equal(hasFiredSignal('sid', 'new-file'), true);
  });
});

test('SessionStart(startup) does NOT reset signal suppression', async () => {
  await withStateDir(async () => {
    writeMode('full');
    markFiredSignal('sid', 'new-file');
    await handleActivate(
      normalize({
        hook_event_name: 'SessionStart',
        source: 'startup',
        session_id: 'sid',
      }),
    );
    assert.equal(hasFiredSignal('sid', 'new-file'), true);
  });
});

// --- delivery-aware fired tracking ---

test('challenge lost to a dead turn can be re-issued', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const pre = abstractionWrite(dir, 'dead');
    const first = await handlePreWrite(pre);
    assert.ok(
      first?.hookSpecificOutput?.additionalContext?.includes('one implementation'),
    );
    assert.equal(hasFiredSignal('dead', 'speculative-abstraction'), true);

    // Simulate death: next UserPromptSubmit without PostToolUse — pending cleared.
    await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'dead',
        prompt: 'retry the write',
      }),
    );
    assert.equal(
      hasFiredSignal('dead', 'speculative-abstraction'),
      false,
      'unconfirmed pre pending must drop on next prompt',
    );

    const again = await handlePreWrite(pre);
    assert.ok(
      again?.hookSpecificOutput?.additionalContext?.includes('one implementation'),
      'same signal must re-fire after dead turn',
    );
  });
});

test('successful PostToolUse confirms pre pending — no re-fire', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const pre = abstractionWrite(dir, 'live');
    const first = await handlePreWrite(pre);
    assert.ok(first?.hookSpecificOutput?.additionalContext);

    await handlePostWrite(abstractionPost(dir, 'live'));
    assert.equal(hasFiredSignal('live', 'speculative-abstraction'), true);

    const second = await handlePreWrite(pre);
    assert.equal(second, null, 'confirmed signal must stay suppressed');
  });
});

test('emit alone leaves pending, not confirmed', () => {
  return withStateDir(() => {
    markPendingSignal('p', 'new-file');
    assert.equal(hasFiredSignal('p', 'new-file'), true);
    // clearPending without confirm → re-issuable
    clearPendingSignals('p');
    assert.equal(hasFiredSignal('p', 'new-file'), false);
  });
});

test('legacy fired array format still suppresses', () => {
  return withStateDir(() => {
    const p = paths();
    fs.writeFileSync(p.firedFor('leg'), JSON.stringify(['new-file']) + '\n');
    assert.equal(hasFiredSignal('leg', 'new-file'), true);
  });
});

// --- inspectActive / statusline honesty ---

test('inspectActive: missing vs ok vs corrupt', () => {
  return withStateDir(() => {
    clearMode();
    assert.equal(inspectActive().state, 'missing');

    writeMode('strict');
    const ok = inspectActive();
    assert.equal(ok.state, 'ok');
    assert.equal(ok.mode, 'strict');
    assert.ok(ok.mtime instanceof Date);

    fs.writeFileSync(paths().active, Buffer.from([0x00, 0xff, 0xfe, 0x01]));
    const bad = inspectActive();
    assert.equal(bad.state, 'corrupt');
    // Hooks still fail safe
    assert.equal(readMode(), 'full');
  });
});

test('statusline.ps1: absent active → inactive marker, not a mode', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('statusline.ps1 on Windows');
    return;
  }
  await withStateDir(async (dir) => {
    writeDefaultMode('strict');
    clearMode();
    const r = await runStatuslinePs1(dir);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, 'offcut:-');
    assert.doesNotMatch(r.stdout, /:(full|strict|lite|off)$/);
  });
});

test('statusline.ps1: corrupt active → distinct marker', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('statusline.ps1 on Windows');
    return;
  }
  await withStateDir(async (dir) => {
    fs.writeFileSync(path.join(dir, 'active'), 'not-a-mode\n');
    const r = await runStatuslinePs1(dir);
    assert.equal(r.code, 0);
    assert.equal(r.stdout, 'offcut:!');
  });
});

test('statusline.ps1: healthy active still shows mode', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('statusline.ps1 on Windows');
    return;
  }
  await withStateDir(async (dir) => {
    writeMode('lite');
    const r = await runStatuslinePs1(dir);
    assert.equal(r.stdout, 'offcut:lite');
  });
});

test('statusline.ps1: concurrent sessions display their own modes', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('statusline.ps1 on Windows');
    return;
  }
  await withStateDir(async (dir) => {
    writeMode('full', 'beta');
    writeMode('off', 'alpha');

    const beta = await runStatuslinePs1(dir, { session_id: 'beta' });
    const alpha = await runStatuslinePs1(dir, { session_id: 'alpha' });
    const unknown = await runStatuslinePs1(dir, { session_id: 'not-started' });
    assert.equal(beta.stdout, 'offcut:full');
    assert.equal(alpha.stdout, 'offcut:off');
    assert.equal(unknown.stdout, 'offcut:-');
  });
});

// --- pruning ---

test('SessionEnd prunes turn-* but keeps fired-* for resume', async () => {
  await withStateDir(async () => {
    markFiredSignal('gone', 'new-file');
    markPendingSignal('gone', 'post:x');
    fs.writeFileSync(paths().turnFor('gone'), '3\n');
    assert.ok(fs.existsSync(paths().firedFor('gone')));
    assert.ok(fs.existsSync(paths().turnFor('gone')));

    await handleSessionEnd(
      normalize({ hook_event_name: 'SessionEnd', session_id: 'gone' }),
    );
    // fired survives so SessionStart(resume) suppression still has something to read
    assert.equal(fs.existsSync(paths().firedFor('gone')), true);
    assert.equal(fs.existsSync(paths().turnFor('gone')), false);
  });
});

test('pruneStaleFiles removes ephemeral state but preserves persistent session modes', () => {
  return withStateDir(() => {
    const fired = paths().firedFor('old');
    const turn = paths().turnFor('old');
    const mode = paths().modeFor('old');
    assert.equal(typeof stateModule.writeStyle, 'function');
    assert.equal(stateModule.writeStyle('normal', 'old'), true);
    const style = paths().styleFor('old');
    fs.writeFileSync(fired, '{"confirmed":[],"pending":[]}\n');
    fs.writeFileSync(turn, '1\n');
    fs.writeFileSync(mode, 'full\n');
    const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
    fs.utimesSync(fired, new Date(old), new Date(old));
    fs.utimesSync(turn, new Date(old), new Date(old));
    fs.utimesSync(mode, new Date(old), new Date(old));
    fs.utimesSync(style, new Date(old), new Date(old));

    const n = pruneStaleFiles({ maxAgeMs: 7 * 24 * 60 * 60 * 1000, now: Date.now() });
    assert.ok(n >= 2);
    assert.equal(fs.existsSync(fired), false);
    assert.equal(fs.existsSync(turn), false);
    assert.equal(fs.existsSync(mode), true);
    assert.equal(fs.existsSync(style), true);
  });
});

test('doctor reports the requested session mode, not the latest session mirror', () => {
  return withStateDir(() => {
    writeMode('off', 'alpha');
    writeMode('strict', 'beta');
    const result = runDoctor({ silent: true, root, sessionId: 'alpha' });
    const active = result.lines.find((line) => line.check === 'active');
    assert.equal(active.verdict, 'ok');
    assert.match(active.detail, /session alpha/i);
    assert.match(active.detail, /mode off/i);
    assert.doesNotMatch(active.detail, /strict/i);
  });
});

test('reading a live session mode keeps it out of stale-orphan pruning', () => {
  return withStateDir(() => {
    writeMode('lite', 'long-running');
    const mode = paths().modeFor('long-running');
    const old = Date.now() - 8 * 24 * 60 * 60 * 1000;
    fs.utimesSync(mode, new Date(old), new Date(old));

    assert.equal(readMode('long-running'), 'lite');
    pruneStaleFiles({ maxAgeMs: 7 * 24 * 60 * 60 * 1000, now: Date.now() });
    assert.equal(fs.existsSync(mode), true);
  });
});

test('state.js has no unpaid offcut: prune markers', () => {
  const src = fs.readFileSync(path.join(root, 'hooks', 'state.js'), 'utf8');
  assert.equal(
    /offcut:\s*turn files are never pruned/i.test(src),
    false,
  );
  assert.equal(
    /offcut:\s*fired files are never pruned/i.test(src),
    false,
  );
});

// --- doctor ---

test('doctor reports every required check line', () => {
  return withStateDir(() => {
    writeMode('full');
    const result = runDoctor({ silent: true, root });
    const checks = result.lines.map((l) => l.check);
    for (const need of [
      'state dir',
      'active',
      'activation',
      'ruleset',
      'hook scripts',
      'language coverage',
    ]) {
      assert.ok(
        checks.some((c) => c === need || c.startsWith(need) || c.startsWith('host:') || c.startsWith('subagent:')),
        `missing check category near ${need}; got ${checks.join(', ')}`,
      );
    }
    assert.ok(checks.includes('state dir'));
    assert.ok(checks.includes('active'));
    assert.ok(checks.includes('activation'));
    assert.ok(checks.includes('ruleset'));
    assert.ok(checks.includes('hook scripts'));
    assert.ok(checks.includes('language coverage'));
    assert.ok(
      checks.some((c) => c.startsWith('subagent:')) || checks.includes('subagent coverage'),
      'subagent coverage line required',
    );
    assert.ok(result.repairCommand.includes('install.mjs'));
  });
});

test('doctor: no state dir → fail active/state, prints repair command', () => {
  const dir = path.join(os.tmpdir(), `offcut-doctor-missing-${process.pid}`);
  fs.rmSync(dir, { recursive: true, force: true });
  const prev = process.env.OFFCUT_STATE_DIR;
  process.env.OFFCUT_STATE_DIR = dir;
  try {
    const result = runDoctor({ silent: true, root });
    const byCheck = Object.fromEntries(result.lines.map((l) => [l.check, l]));
    assert.equal(byCheck['state dir'].verdict, 'fail');
    assert.equal(byCheck.active.verdict, 'fail');
    assert.match(byCheck.active.detail, /missing|never/i);
    assert.ok(result.failed >= 1);
    assert.match(result.repairCommand, /install\.mjs/);
  } finally {
    if (prev === undefined) delete process.env.OFFCUT_STATE_DIR;
    else process.env.OFFCUT_STATE_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('doctor: corrupt active → fail with corrupt, hooks still full', () => {
  return withStateDir(() => {
    fs.writeFileSync(paths().active, Buffer.from([0xff, 0x00, 0x01]));
    assert.equal(readMode(), 'full');
    const result = runDoctor({ silent: true, root });
    const active = result.lines.find((l) => l.check === 'active');
    assert.equal(active.verdict, 'fail');
    assert.match(active.detail, /corrupt/i);
  });
});

test('doctor: moved checkout → hook scripts fail', () => {
  return withStateDir(() => {
    writeMode('full');
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-moved-'));
    try {
      // No hook scripts under fakeRoot
      const result = runDoctor({ silent: true, root: fakeRoot });
      const hooks = result.lines.find((l) => l.check === 'hook scripts');
      assert.ok(hooks);
      assert.equal(hooks.verdict, 'fail');
      assert.match(hooks.detail, /missing|moved/i);
    } finally {
      fs.rmSync(fakeRoot, { recursive: true, force: true });
    }
  });
});

test('doctor is read-only — does not create active or repair configs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-doctor-ro-'));
  const prev = process.env.OFFCUT_STATE_DIR;
  process.env.OFFCUT_STATE_DIR = dir;
  try {
    // Empty dir: doctor may mkdir for writability probe but must not write active
    runDoctor({ silent: true, root });
    assert.equal(fs.existsSync(path.join(dir, 'active')), false);
    // Only a hook that served the ruleset may claim it did.
    assert.equal(fs.existsSync(path.join(dir, 'served')), false);
  } finally {
    if (prev === undefined) delete process.env.OFFCUT_STATE_DIR;
    else process.env.OFFCUT_STATE_DIR = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('resetSuppression helper clears fired file', () => {
  return withStateDir(() => {
    markFiredSignal('x', 'a');
    resetSuppression('x');
    assert.equal(hasFiredSignal('x', 'a'), false);
  });
});

test('confirmPendingSignals moves pending to confirmed', () => {
  return withStateDir(() => {
    markPendingSignal('c', 'post:exported-unused');
    markPendingSignal('c', 'new-file');
    confirmPendingSignals('c', (id) => id.startsWith('post:'));
    assert.equal(hasFiredSignal('c', 'post:exported-unused'), true);
    clearPendingSignals('c');
    assert.equal(hasFiredSignal('c', 'post:exported-unused'), true, 'confirmed survives clearPending');
    assert.equal(hasFiredSignal('c', 'new-file'), false, 'unconfirmed pre dropped');
  });
});

test('pruneOnSessionEnd is exported and safe on empty dir', () => {
  return withStateDir(() => {
    pruneOnSessionEnd('nope');
  });
});

// --- doctor: which copy actually served the ruleset ---

/** A second install root holding its own ruleset. */
function makeCopy(body) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-copy-'));
  const rulesDir = path.join(dir, 'rules');
  fs.mkdirSync(rulesDir, { recursive: true });
  fs.writeFileSync(path.join(rulesDir, 'offcut.md'), `${body}\n`, 'utf8');
  return dir;
}

function touch(p, secondsFromNow) {
  const t = Date.now() / 1000 + secondsFromNow;
  fs.utimesSync(p, t, t);
}

/** Give a copy the hook whose age says whether it can have recorded anything. */
function addHook(dir, secondsFromNow) {
  const p = path.join(dir, 'hooks', 'activate.js');
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, '// stand-in for the recording hook\n', 'utf8');
  touch(p, secondsFromNow);
  return p;
}

test('doctor: a second copy served the ruleset → warn naming both roots', () => {
  return withStateDir(() => {
    writeMode('full');
    const other = makeCopy('other copy');
    try {
      writeServedRoot(other);
      const result = runDoctor({ silent: true, root });
      const served = result.lines.find((l) => l.check === 'ruleset served');
      assert.ok(served, 'ruleset served line required');
      assert.equal(served.verdict, 'warn');
      assert.match(served.detail, /different copy/i);
      assert.ok(served.detail.includes(other), 'must name the copy that served');
      assert.ok(served.detail.includes(root), 'must name the root doctor checked');
    } finally {
      fs.rmSync(other, { recursive: true, force: true });
    }
  });
});

test('doctor: same copy served it and the ruleset is unchanged → ok', () => {
  return withStateDir(() => {
    writeMode('full');
    const copy = makeCopy('current');
    try {
      touch(path.join(copy, 'rules', 'offcut.md'), -3600);
      writeServedRoot(copy);
      const result = runDoctor({ silent: true, root: copy });
      const served = result.lines.find((l) => l.check === 'ruleset served');
      assert.equal(served.verdict, 'ok');
      assert.match(served.detail, /this root/i);
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

test('doctor: ruleset edited after the last SessionStart → warn to restart', () => {
  // Editing rules/offcut.md does not reach a session already running. CI checking that
  // AGENTS.md is fresh says nothing about what the live session holds.
  return withStateDir(() => {
    writeMode('full');
    const copy = makeCopy('edited after activation');
    try {
      writeServedRoot(copy);
      touch(path.join(copy, 'rules', 'offcut.md'), 120);
      const result = runDoctor({ silent: true, root: copy });
      const served = result.lines.find((l) => l.check === 'ruleset served');
      assert.equal(served.verdict, 'warn');
      assert.match(served.detail, /restart/i);
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

test('doctor: a mid-session mode switch does not mask an edited ruleset', () => {
  // `active` is rewritten by every mode switch, so it cannot date the last read.
  return withStateDir(() => {
    writeMode('full');
    const copy = makeCopy('body');
    try {
      writeServedRoot(copy);
      touch(path.join(copy, 'rules', 'offcut.md'), 120);
      writeMode('lite');
      const result = runDoctor({ silent: true, root: copy });
      const served = result.lines.find((l) => l.check === 'ruleset served');
      assert.equal(served.verdict, 'warn', 'mode switch must not refresh the read clock');
      assert.match(served.detail, /restart/i);
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

test('doctor: a copy newer than the last session is not yet recorded, not a fault', () => {
  // Upgrading Offcut must not manufacture a warning. Nothing has run the new
  // hook yet, so nothing could have recorded which copy served.
  return withStateDir((dir) => {
    const copy = makeCopy('body');
    addHook(copy, 0);
    try {
      writeMode('full');
      touch(path.join(dir, 'active'), -7200);
      const result = runDoctor({ silent: true, root: copy });
      const served = result.lines.find((l) => l.check === 'ruleset served');
      assert.equal(served.verdict, 'ok');
      assert.match(served.detail, /not yet recorded/i);
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

test('doctor: a session ran with this copy in place and left no record → warn', () => {
  // The other half: this hook was installed before the session started, so it
  // would have recorded. Silence means a different copy served that session.
  return withStateDir(() => {
    const copy = makeCopy('body');
    addHook(copy, -7200);
    try {
      writeMode('full');
      const result = runDoctor({ silent: true, root: copy });
      const served = result.lines.find((l) => l.check === 'ruleset served');
      assert.equal(served.verdict, 'warn');
      assert.match(served.detail, /another copy served it/i);
    } finally {
      fs.rmSync(copy, { recursive: true, force: true });
    }
  });
});

test('doctor: switching off does not erase what the last SessionStart served', () => {
  return withStateDir(() => {
    writeServedRoot(root, 'claude');
    writeMode('off');
    const result = runDoctor({ silent: true, root });
    const served = result.lines.find((l) => l.check === 'ruleset served');
    assert.equal(served.verdict, 'ok');
    assert.match(served.detail, /this root/i);
    assert.doesNotMatch(served.detail, /no ruleset/i);
  });
});

test('handleActivate records the root it served from', async () => {
  await withStateDir(async () => {
    writeDefaultMode('full');
    clearMode();
    await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid' }),
    );
    const rec = inspectServed();
    assert.equal(rec.state, 'ok');
    assert.equal(path.resolve(rec.root), path.resolve(pluginRoot()));
  });
});

test('handleActivate records which copy ran even when the mode is off', async () => {
  await withStateDir(async () => {
    writeDefaultMode('off');
    clearMode();
    const out = await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid' }),
    );
    assert.equal(out, null);
    const rec = inspectServed();
    assert.equal(rec.state, 'ok');
    assert.equal(path.resolve(rec.root), path.resolve(pluginRoot()));
    assert.equal(rec.host, 'claude');
    assert.equal(rec.emitted, false);

    writeMode('full');
    const result = runDoctor({ silent: true, root });
    const served = result.lines.find((line) => line.check === 'ruleset served');
    assert.equal(served.verdict, 'ok');
    assert.match(served.detail, /mode was off.*no ruleset was served/i);
  });
});

test('doctor catches drift no config scan can see: one copy served, another checked', async () => {
  // The measured failure. A host-managed plugin copy registers through its own
  // bundled manifest, so the host settings file never names it — a config scan
  // finds only the checkout. Meanwhile the model is fed the other copy's text
  // and every other check reports healthy.
  await withStateDir(async () => {
    const stale = makeCopy('STALE RULESET MARKER');
    const prev = process.env.PLUGIN_ROOT;
    process.env.PLUGIN_ROOT = stale;
    try {
      writeDefaultMode('full');
      clearMode();
      const out = await handleActivate(
        normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'sid' }),
      );
      assert.match(
        out.hookSpecificOutput.additionalContext,
        /STALE RULESET MARKER/,
        'the model really was served the other copy',
      );

      const result = runDoctor({ silent: true, root });
      const readable = result.lines.find((l) => l.check === 'ruleset');
      const servedLine = result.lines.find((l) => l.check === 'ruleset served');
      assert.equal(readable.verdict, 'ok', 'the readable-file check alone reports healthy');
      assert.equal(servedLine.verdict, 'warn', 'drift must not read as healthy');
      assert.ok(servedLine.detail.includes(stale));
    } finally {
      if (prev === undefined) delete process.env.PLUGIN_ROOT;
      else process.env.PLUGIN_ROOT = prev;
      fs.rmSync(stale, { recursive: true, force: true });
    }
  });
});

test('doctor: stale activation warns rather than reporting OK', async () => {
  // Every SessionStart rewrites `active`, so its mtime is the last session
  // start. A checkout moved days ago used to read OK at a 7-day threshold
  // while the statusline kept printing a mode — hooks silently not running.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-stale-'));
  try {
    fs.writeFileSync(path.join(dir, 'active'), 'full\n');
    const p = path.join(dir, 'active');
    const old = Date.now() / 1000 - 3 * 86400;
    fs.utimesSync(p, old, old);

    const r = spawnSync(process.execPath, [path.join(root, 'hooks', 'doctor.js')], {
      encoding: 'utf8',
      env: { ...process.env, OFFCUT_STATE_DIR: dir },
    });
    const line = (r.stdout || '').split('\n').find((l) => /activation/i.test(l)) || '';
    assert.match(line, /^WARN/, `stale activation not flagged: ${line}`);
    assert.match(line, /not running|stopped firing/i);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
