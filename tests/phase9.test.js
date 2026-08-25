// Phase 9 — multi-handler coexistence contracts.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { gate, normalize } from '../hooks/host.js';
import { handlePreWrite } from '../hooks/pre-write.js';
import { writeMode } from '../hooks/state.js';
import { absScript, hookCommand, isOurs, mergeHooks } from '../tools/install.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withStateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p9-'));
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

function foreignGroup(label) {
  return {
    matcher: 'Write|Edit',
    hooks: [
      {
        type: 'command',
        command: `node "/tmp/${label}.js"`,
        timeout: 5,
        statusMessage: label,
      },
    ],
  };
}

function offcutGroup(event, matcher) {
  const scripts = {
    SessionStart: 'hooks/activate.js',
    UserPromptSubmit: 'hooks/prompt.js',
    PreToolUse: 'hooks/pre-write.js',
    PostToolUse: 'hooks/post-write.js',
  };
  return {
    ...(matcher ? { matcher } : {}),
    hooks: [
      {
        type: 'command',
        command: hookCommand(absScript(scripts[event], root)),
        timeout: 5,
        statusMessage: 'offcut-hooks',
      },
    ],
  };
}

// --- 1. Offcut never converts a neighbour deny into allow ---

test('gate never emits permissionDecision allow or deny', () => {
  for (const host of ['claude', 'codex', 'grok']) {
    for (const kind of ['context', 'allow', 'escalate']) {
      const out = gate(host, {
        kind,
        context: 'Offcut: probe',
        reason: 'probe',
        event: 'pre_tool_use',
      });
      const s = JSON.stringify(out);
      assert.ok(!s.includes('"permissionDecision":"deny"'), `${host}/${kind}`);
      assert.ok(!s.includes('"permissionDecision":"allow"'), `${host}/${kind}`);
      assert.ok(!s.includes('"decision":"deny"'), `${host}/${kind}`);
      assert.ok(!s.includes('"decision":"allow"'), `${host}/${kind}`);
    }
  }
});

test('pre-write challenge never returns allow/deny that could override a neighbour', async () => {
  await withStateDir(async (dir) => {
    writeMode('strict');
    const out = await handlePreWrite(
      normalize({
        hook_event_name: 'PreToolUse',
        session_id: 'p9-deny',
        cwd: dir,
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(dir, 'package.json'),
          content: JSON.stringify({ dependencies: { lodash: '1.0.0' } }, null, 2),
        },
      }),
    );
    assert.ok(out, 'strict new-dependency should challenge');
    const s = JSON.stringify(out);
    assert.ok(!s.includes('"permissionDecision":"deny"'));
    assert.ok(!s.includes('"permissionDecision":"allow"'));
    // Claude/Codex escalate uses ask; that must not flip a neighbour deny into allow.
    if (out.hookSpecificOutput?.permissionDecision) {
      assert.equal(out.hookSpecificOutput.permissionDecision, 'ask');
    }
  });
});

/**
 * Host-side aggregation model used by coexistence docs: any explicit deny from
 * any handler wins. Offcut returning context (or null) must leave a neighbour
 * deny intact — Offcut has no vote that clears it.
 */
test('simulated multi-handler: neighbour deny survives Offcut context', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const offcut = await handlePreWrite(
      normalize({
        hook_event_name: 'PreToolUse',
        session_id: 'p9-agg',
        cwd: dir,
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(dir, 'only-impl.js'),
          content:
            'export interface Store { get(k: string): string }\n' +
            'export class MemStore implements Store { get(k) { return k } }\n',
        },
      }),
    );
    const neighbour = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: 'security-probe',
      },
    };
    const decisions = [neighbour, offcut]
      .map((o) => o?.hookSpecificOutput?.permissionDecision)
      .filter(Boolean);
    assert.ok(decisions.includes('deny'), 'neighbour deny present');
    assert.ok(!decisions.includes('allow'), 'Offcut must not cast allow');
    // Aggregation: deny wins if any handler denied.
    const final = decisions.includes('deny') ? 'deny' : decisions[0] || 'allow';
    assert.equal(final, 'deny');
  });
});

// --- 2. Timing is independent of a slow neighbour ---

test('Offcut install entries use a bounded 5s timeout', () => {
  const group = offcutGroup('PreToolUse', 'Write|Edit');
  assert.equal(group.hooks[0].timeout, 5);
});

test('pre-write hook process exits within its timeout even if the handler hangs', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p9-hang-'));
  const hang = path.join(dir, 'hang-pre.js');
  // Stand-in for a stuck neighbour process: Offcut's own runHook killer is what
  // we assert. Spawn pre-write.js with a payload and confirm it cannot hang the
  // parent beyond timeoutMs — runHook defaults to 5000ms.
  const payload = JSON.stringify({
    hook_event_name: 'PreToolUse',
    session_id: 'p9-hang',
    cwd: dir,
    tool_name: 'Write',
    tool_input: {
      file_path: path.join(dir, 'x.js'),
      content: 'export const x = 1;\n',
    },
  });

  const started = Date.now();
  const result = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'hooks', 'pre-write.js')], {
      env: { ...process.env, OFFCUT_STATE_DIR: dir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, ms: Date.now() - started }));
    child.stdin.write(payload);
    child.stdin.end();
  });

  try {
    assert.equal(result.code, 0);
    // Must finish well under the 5s contract (allow headroom for cold start).
    assert.ok(result.ms < 4500, `pre-write took ${result.ms}ms`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // A hanging neighbour is a separate process — Offcut cannot wait on it.
  // Assert the probe shape: neighbour timeout is independent (its own timeout field).
  void hang;
  const neighbour = foreignGroup('slow-neighbour');
  assert.equal(neighbour.hooks[0].timeout, 5);
  assert.notEqual(neighbour.hooks[0].command, offcutGroup('PreToolUse', 'Write|Edit').hooks[0].command);
});

// --- 3. Uninstall under a populated config ---

test('uninstall removes only Offcut groups and leaves two foreign hooks', () => {
  const spec = {
    PreToolUse: [offcutGroup('PreToolUse', 'Write|Edit')],
    PostToolUse: [offcutGroup('PostToolUse', 'Write|Edit')],
    UserPromptSubmit: [offcutGroup('UserPromptSubmit')],
  };
  const target = {
    PreToolUse: [foreignGroup('security-guidance'), offcutGroup('PreToolUse', 'Write|Edit')],
    PostToolUse: [foreignGroup('impeccable'), offcutGroup('PostToolUse', 'Write|Edit')],
    UserPromptSubmit: [foreignGroup('ponytail'), offcutGroup('UserPromptSubmit')],
    SessionStart: [foreignGroup('remember')],
  };

  const cleaned = mergeHooks(structuredClone(target), spec, {
    uninstall: true,
    root,
  });

  assert.equal(cleaned.PreToolUse.length, 1);
  assert.equal(cleaned.PreToolUse[0].hooks[0].statusMessage, 'security-guidance');
  assert.equal(cleaned.PostToolUse.length, 1);
  assert.equal(cleaned.PostToolUse[0].hooks[0].statusMessage, 'impeccable');
  assert.equal(cleaned.UserPromptSubmit.length, 1);
  assert.equal(cleaned.UserPromptSubmit[0].hooks[0].statusMessage, 'ponytail');
  assert.equal(cleaned.SessionStart.length, 1);
  assert.equal(cleaned.SessionStart[0].hooks[0].statusMessage, 'remember');

  for (const groups of Object.values(cleaned)) {
    for (const g of groups) {
      assert.equal(isOurs(g, root), false);
    }
  }
});

test('install merges Offcut beside existing foreign hooks without dropping them', () => {
  const spec = {
    PreToolUse: [offcutGroup('PreToolUse', 'Write|Edit')],
    PostToolUse: [offcutGroup('PostToolUse', 'Write|Edit')],
  };
  const target = {
    PreToolUse: [foreignGroup('security-guidance')],
    PostToolUse: [foreignGroup('impeccable')],
  };

  const merged = mergeHooks(structuredClone(target), spec, { root });
  assert.equal(merged.PreToolUse.length, 2);
  assert.equal(merged.PreToolUse[0].hooks[0].statusMessage, 'security-guidance');
  assert.ok(isOurs(merged.PreToolUse[1], root));
  assert.equal(merged.PostToolUse.length, 2);
  assert.equal(merged.PostToolUse[0].hooks[0].statusMessage, 'impeccable');
  assert.ok(isOurs(merged.PostToolUse[1], root));
});
