import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  classifyWriteTool,
  normalize,
  gate,
} from '../hooks/host.js';
import {
  writeMode,
  hasFiredSignal,
  markFiredSignal,
} from '../hooks/state.js';
import {
  PRE_SIGNALS,
  POST_SIGNALS,
  LARGE_FIRST_WRITE_LINES,
  extractWriteFields,
  runSignals,
} from '../hooks/signals.js';
import { handlePreWrite, decidePreWrite, buildPreView } from '../hooks/pre-write.js';
import { handlePostWrite, decidePostWrite } from '../hooks/post-write.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withStateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p2-'));
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

function runHookScript(script, stdin, env = {}, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'hooks', script)], {
      cwd: root,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => {
      child.kill('SIGKILL');
      reject(new Error(`hook hung: ${script}`));
    }, timeoutMs);
    child.stdout.on('data', (d) => {
      stdout += d;
    });
    child.stderr.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr });
    });
    if (stdin === null) {
      // leave open
    } else {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

function view(partial) {
  return {
    path: null,
    content: '',
    addedContent: '',
    shape: 'full',
    pathExists: true,
    truncated: false,
    ...partial,
  };
}

// --- classifyWriteTool: four spellings ---

test('classifyWriteTool: Write/write are full; Edit/apply_patch/search_replace are fragment', () => {
  assert.deepEqual(classifyWriteTool('Write'), { isWrite: true, shape: 'full' });
  assert.deepEqual(classifyWriteTool('write'), { isWrite: true, shape: 'full' });
  assert.deepEqual(classifyWriteTool('Edit'), { isWrite: true, shape: 'fragment' });
  assert.deepEqual(classifyWriteTool('apply_patch'), { isWrite: true, shape: 'fragment' });
  assert.deepEqual(classifyWriteTool('search_replace'), { isWrite: true, shape: 'fragment' });
  assert.deepEqual(classifyWriteTool('Bash'), { isWrite: false, shape: null });
});

test('normalize: exposes writeTool for all four spellings', () => {
  assert.equal(
    normalize({ hook_event_name: 'PreToolUse', tool_name: 'Write' }).writeTool.shape,
    'full',
  );
  assert.equal(
    normalize({ hook_event_name: 'PreToolUse', tool_name: 'Edit' }).writeTool.shape,
    'fragment',
  );
  assert.equal(
    normalize({
      hook_event_name: 'PreToolUse',
      tool_name: 'apply_patch',
      transcript_path: '/tmp/.codex/sessions/x.jsonl',
    }).writeTool.shape,
    'fragment',
  );
  assert.equal(
    normalize({ hookEventName: 'pre_tool_use', toolName: 'write' }).writeTool.shape,
    'full',
  );
  assert.equal(
    normalize({ hookEventName: 'pre_tool_use', toolName: 'search_replace' }).writeTool.shape,
    'fragment',
  );
});

// --- gate escalate / deny unreachable ---

test('gate escalate: Claude/Codex use permissionDecision ask; Grok degrades to context', () => {
  const c = gate('claude', {
    kind: 'escalate',
    reason: 'dep',
    context: 'Offcut: new dependency',
  });
  assert.equal(c.hookSpecificOutput.permissionDecision, 'ask');
  assert.ok(!JSON.stringify(c).includes('escalate'));
  assert.ok(!JSON.stringify(c).includes('"deny"'));

  const g = gate('grok', {
    kind: 'escalate',
    reason: 'dep',
    context: 'Offcut: new dependency',
  });
  // No permissionDecision / decision ask — context only.
  assert.equal(g.decision, undefined);
  assert.equal(g.hookSpecificOutput.permissionDecision, undefined);
  assert.match(g.hookSpecificOutput.additionalContext, /new dependency/);
  assert.ok(!JSON.stringify(g).includes('"deny"'));
});

test('deny is unreachable across modes and inputs', async () => {
  await withStateDir(async (dir) => {
    const modes = ['off', 'lite', 'full', 'strict'];
    const payloads = [
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Write',
        session_id: 'd1',
        cwd: dir,
        tool_input: {
          file_path: path.join(dir, 'brand-new.js'),
          content: 'export const x = 1;\n',
        },
      },
      {
        hook_event_name: 'PreToolUse',
        tool_name: 'Edit',
        session_id: 'd2',
        cwd: dir,
        tool_input: {
          file_path: path.join(dir, 'package.json'),
          old_string: '"dependencies": {\n',
          new_string: '"dependencies": {\n  "lodash": "^4.0.0",\n',
        },
      },
      {
        hookEventName: 'pre_tool_use',
        toolName: 'write',
        sessionId: 'd3',
        cwd: dir,
        toolInput: { path: path.join(dir, 'a.js'), content: 'x'.repeat(5000) },
        toolInputTruncated: true,
      },
    ];
    for (const mode of modes) {
      writeMode(mode);
      for (const p of payloads) {
        const out = await handlePreWrite(normalize(p));
        if (!out) continue;
        const s = JSON.stringify(out);
        assert.ok(!s.includes('"deny"'), `deny leaked in mode=${mode}`);
        assert.ok(!s.includes('"permissionDecision":"deny"'));
      }
    }
  });
});

// --- signals: positive + negative each ---

test('signal new-file: positive when path missing; negative when exists', () => {
  const sig = PRE_SIGNALS.find((s) => s.id === 'new-file');
  assert.equal(sig.check(view({ pathExists: false })), true);
  assert.equal(sig.check(view({ pathExists: true })), false);
  assert.equal(sig.check(view({ pathExists: null })), false);
});

test('signal large-first-write: positive on big new full write; negative otherwise', () => {
  const sig = PRE_SIGNALS.find((s) => s.id === 'large-first-write');
  const big = Array.from({ length: LARGE_FIRST_WRITE_LINES + 5 }, (_, i) => `line ${i}`).join('\n');
  assert.equal(
    sig.check(view({ pathExists: false, content: big, shape: 'full' })),
    true,
  );
  assert.equal(
    sig.check(view({ pathExists: false, content: 'tiny\n', shape: 'full' })),
    false,
  );
  assert.equal(
    sig.check(view({ pathExists: true, content: big, shape: 'full' })),
    false,
  );
  // Shape filter: fragment never selected by runSignals for this signal.
  const hits = runSignals(PRE_SIGNALS, view({
    pathExists: false,
    content: big,
    shape: 'fragment',
    truncated: false,
  }));
  assert.ok(!hits.find((h) => h.id === 'large-first-write'));
});

test('signal new-dependency: positive on package.json dep add; negative on src edit', () => {
  const sig = PRE_SIGNALS.find((s) => s.id === 'new-dependency');
  assert.equal(
    sig.check(
      view({
        path: 'package.json',
        addedContent: '"dependencies": {\n  "left-pad": "1.0.0"\n}',
        content: '"dependencies": {\n  "left-pad": "1.0.0"\n}',
      }),
    ),
    true,
  );
  assert.equal(
    sig.check(
      view({
        path: 'src/app.js',
        addedContent: 'import leftPad from "left-pad";\n',
        content: 'import leftPad from "left-pad";\n',
      }),
    ),
    false,
  );
  assert.equal(
    sig.check(
      view({
        path: 'requirements.txt',
        addedContent: 'requests==2.0.0\n',
        content: 'requests==2.0.0\n',
      }),
    ),
    true,
  );
});

test('signal speculative-abstraction: positive one-impl interface; negative two-impl', () => {
  const sig = PRE_SIGNALS.find((s) => s.id === 'speculative-abstraction');
  const one = `
interface Store { get(k: string): string }
class MemoryStore implements Store { get(k: string) { return k } }
`;
  const two = `
interface Store { get(k: string): string }
class MemoryStore implements Store { get(k: string) { return k } }
class DiskStore implements Store { get(k: string) { return k } }
`;
  assert.equal(sig.check(view({ content: one })), true);
  assert.equal(sig.check(view({ content: two })), false);
  assert.equal(sig.check(view({ content: 'function add(a,b){return a+b}' })), false);
});

test('signal config-for-constant: positive unread key; negative when key is read', () => {
  const sig = PRE_SIGNALS.find((s) => s.id === 'config-for-constant');
  assert.equal(
    sig.check(
      view({
        path: 'config/settings.js',
        addedContent: 'export const MAX_RETRIES = 3;\n',
        content: 'export const MAX_RETRIES = 3;\n',
      }),
    ),
    true,
  );
  assert.equal(
    sig.check(
      view({
        path: 'config/settings.js',
        content: 'export const MAX_RETRIES = 3;\nexport function run(){ return MAX_RETRIES }\n',
        addedContent: 'export const MAX_RETRIES = 3;\nexport function run(){ return MAX_RETRIES }\n',
      }),
    ),
    false,
  );
});

test('post signal exported-unused: positive and negative', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'exported-unused');
  assert.equal(
    sig.check(view({ content: 'export function helper(){ return 1 }\n' })),
    true,
  );
  assert.equal(
    sig.check(
      view({
        content: 'export function helper(){ return 1 }\nhelper();\n',
      }),
    ),
    false,
  );
});

test('post signal new-config-surface: positive and negative', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'new-config-surface');
  assert.equal(
    sig.check(view({ addedContent: 'const x = process.env.NEW_FLAG;\n' })),
    true,
  );
  assert.equal(
    sig.check(view({ addedContent: 'const x = 1 + 2;\n' })),
    false,
  );
});

test('post signal single-call-wrapper: positive and negative', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'single-call-wrapper');
  assert.equal(
    sig.check(
      view({
        addedContent: 'export function save(x){ return db.save(x) }\n',
        content: 'export function save(x){ return db.save(x) }\n',
      }),
    ),
    true,
  );
  assert.equal(
    sig.check(
      view({
        addedContent: 'export function save(x){ validate(x); return db.save(x) }\n',
        content: 'export function save(x){ validate(x); return db.save(x) }\n',
      }),
    ),
    false,
  );
});

test('post signal unused-default-param: positive and negative', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'unused-default-param');
  assert.equal(
    sig.check(view({ content: 'function load(path, opts = {}){ return read(path) }\n' })),
    true,
  );
  assert.equal(
    sig.check(
      view({
        content:
          'function load(path, opts = {}){ return read(path, opts) }\nload("a", { opts: 1 });\n',
      }),
    ),
    false,
  );
});

// --- truncation silence ---

test('truncated payloads produce silence for content signals', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const big = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
    const norm = normalize({
      hookEventName: 'pre_tool_use',
      sessionId: 'trunc',
      cwd: dir,
      toolName: 'write',
      toolInput: {
        path: path.join(dir, 'huge-new.js'),
        content: big,
      },
      toolInputTruncated: true,
    });
    // Content looks like it should trip large-first-write + speculative etc.
    // Truncation must silence content-based signals. new-file does not need content.
    const decision = decidePreWrite(norm, 'full');
    // new-file may still fire (needsContent: false). Force content-only by existing path:
    fs.writeFileSync(path.join(dir, 'huge-new.js'), 'x');
    const norm2 = normalize({
      hookEventName: 'pre_tool_use',
      sessionId: 'trunc2',
      cwd: dir,
      toolName: 'write',
      toolInput: {
        path: path.join(dir, 'huge-new.js'),
        content:
          'interface A {}\nclass B implements A {}\n' + big,
      },
      toolInputTruncated: true,
    });
    assert.equal(decidePreWrite(norm2, 'full'), null);

    const post = decidePostWrite(
      normalize({
        hookEventName: 'post_tool_use',
        sessionId: 'trunc3',
        toolName: 'write',
        toolInput: { path: 'a.js', content: 'export function orphan(){}' },
        toolResult: {},
        toolInputTruncated: true,
      }),
      'full',
    );
    assert.equal(post, null);
    void decision;
  });
});

// --- once per session ---

test('one challenge per signal per session', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const target = path.join(dir, 'fresh.js');
    const payload = {
      hook_event_name: 'PreToolUse',
      session_id: 'once-a',
      cwd: dir,
      tool_name: 'Write',
      tool_input: { file_path: target, content: 'x=1\n' },
    };
    const first = await handlePreWrite(normalize(payload));
    assert.ok(first?.hookSpecificOutput?.additionalContext.includes('new file'));
    const second = await handlePreWrite(normalize(payload));
    assert.equal(second, null, 'same signal must not re-fire in session');

    // Different session can fire again.
    const other = await handlePreWrite(
      normalize({ ...payload, session_id: 'once-b' }),
    );
    assert.ok(other?.hookSpecificOutput?.additionalContext.includes('new file'));
  });
});

test('fired signals are scoped by session id', () => {
  return withStateDir(() => {
    markFiredSignal('s1', 'new-file');
    assert.equal(hasFiredSignal('s1', 'new-file'), true);
    assert.equal(hasFiredSignal('s2', 'new-file'), false);
  });
});

// --- escalate only strict + new-dependency ---

test('escalate only in strict for new-dependency; otherwise context', async () => {
  await withStateDir(async (dir) => {
    const pkg = path.join(dir, 'package.json');
    fs.writeFileSync(pkg, '{"dependencies":{}}\n');
    const payload = {
      hook_event_name: 'PreToolUse',
      session_id: 'dep',
      cwd: dir,
      tool_name: 'Edit',
      tool_input: {
        file_path: pkg,
        old_string: '"dependencies":{}',
        new_string: '"dependencies":{"lodash":"4.0.0"}',
      },
    };

    writeMode('full');
    const full = await handlePreWrite(normalize({ ...payload, session_id: 'dep-full' }));
    assert.ok(full?.hookSpecificOutput?.additionalContext.includes('new dependency'));
    assert.equal(full.hookSpecificOutput.permissionDecision, undefined);

    writeMode('strict');
    const hard = await handlePreWrite(normalize({ ...payload, session_id: 'dep-strict' }));
    assert.equal(hard.hookSpecificOutput.permissionDecision, 'ask');
    assert.match(hard.hookSpecificOutput.permissionDecisionReason, /new dependency/);
  });
});

test('non-dependency signals never escalate even in strict', async () => {
  await withStateDir(async (dir) => {
    writeMode('strict');
    const out = await handlePreWrite(
      normalize({
        hook_event_name: 'PreToolUse',
        session_id: 'nd',
        cwd: dir,
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(dir, 'n.js'),
          content: 'x=1\n',
        },
      }),
    );
    assert.ok(out?.hookSpecificOutput?.additionalContext.includes('new file'));
    assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  });
});

// --- silent when nothing fires / mode off ---

test('silent exit when nothing fires or mode off', async () => {
  await withStateDir(async (dir) => {
    const existing = path.join(dir, 'ok.js');
    fs.writeFileSync(existing, 'const a = 1;\n');
    writeMode('full');
    const quiet = await handlePreWrite(
      normalize({
        hook_event_name: 'PreToolUse',
        session_id: 'q',
        cwd: dir,
        tool_name: 'Write',
        tool_input: { file_path: existing, content: 'const a = 1;\nconst b = 2;\n' },
      }),
    );
    assert.equal(quiet, null);

    writeMode('off');
    const off = await handlePreWrite(
      normalize({
        hook_event_name: 'PreToolUse',
        session_id: 'q2',
        cwd: dir,
        tool_name: 'Write',
        tool_input: {
          file_path: path.join(dir, 'nope.js'),
          content: 'x\n',
        },
      }),
    );
    assert.equal(off, null);
  });
});

// --- contract: four tool names through handlers ---

test('contract: all four write spellings reach pre-write handler', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const spellings = [
      { hook_event_name: 'PreToolUse', tool_name: 'Write', session_id: 'w1',
        tool_input: { file_path: path.join(dir, 'a1.js'), content: '1\n' } },
      { hook_event_name: 'PreToolUse', tool_name: 'Edit', session_id: 'w2',
        tool_input: { file_path: path.join(dir, 'a2.js'), old_string: '', new_string: '1\n' } },
      { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', session_id: 'w3',
        transcript_path: '/tmp/.codex/sessions/t.jsonl',
        tool_input: { path: path.join(dir, 'a3.js'), patch: '*** Add File\n+1\n' } },
      { hookEventName: 'pre_tool_use', toolName: 'write', sessionId: 'w4',
        toolInput: { path: path.join(dir, 'a4.js'), content: '1\n' } },
    ];
    for (const p of spellings) {
      const out = await handlePreWrite(normalize({ ...p, cwd: dir }));
      assert.ok(out?.hookSpecificOutput?.additionalContext, JSON.stringify(p));
    }
  });
});

// --- failure contract on new hooks ---

test('failure: pre-write/post-write hang, malformed, empty, BOM, missing state', async () => {
  await withStateDir(async (dir) => {
    for (const script of ['pre-write.js', 'post-write.js']) {
      const malformed = await runHookScript(script, 'not-json{', {
        OFFCUT_STATE_DIR: dir,
        CLAUDE_PLUGIN_ROOT: root,
      });
      assert.equal(malformed.code, 0);
      assert.equal(malformed.stdout, '');

      const empty = await runHookScript(script, '', {
        OFFCUT_STATE_DIR: dir,
        CLAUDE_PLUGIN_ROOT: root,
      });
      assert.equal(empty.code, 0);

      writeMode('full');
      const bomPayload =
        '\uFEFF' +
        JSON.stringify({
          hook_event_name: script.startsWith('pre') ? 'PreToolUse' : 'PostToolUse',
          tool_name: 'Write',
          session_id: 'bom',
          cwd: dir,
          tool_input: {
            file_path: path.join(dir, `bom-${script}.js`),
            content: 'export const only = 1;\n',
          },
          tool_response: {},
        });
      const bom = await runHookScript(script, bomPayload, {
        OFFCUT_STATE_DIR: dir,
        CLAUDE_PLUGIN_ROOT: root,
      });
      assert.equal(bom.code, 0);

      const hang = await runHookScript(
        script,
        null,
        { OFFCUT_STATE_DIR: dir, CLAUDE_PLUGIN_ROOT: root },
        5000,
      );
      assert.equal(hang.code, 0);
    }
  });
});

// --- budget ---

test('write path measured under 50ms', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const norm = normalize({
      hook_event_name: 'PreToolUse',
      session_id: 'perf',
      cwd: dir,
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(dir, 'p.js'),
        content: 'const x = 1;\n',
      },
    });
    const t0 = performance.now();
    for (let i = 0; i < 20; i++) {
      // Fresh session ids so once-per-session does not short-circuit the work.
      await handlePreWrite({ ...norm, sessionId: `perf-${i}` });
    }
    const avg = (performance.now() - t0) / 20;
    assert.ok(avg < 50, `avg ${avg.toFixed(2)}ms >= 50ms`);
  });
});

// --- hooks.json wiring ---

test('adapters/claude/hooks.json wires PreToolUse and PostToolUse', () => {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(root, 'adapters', 'claude', 'hooks.json'), 'utf8'),
  );
  assert.ok(cfg.hooks.PreToolUse);
  assert.match(cfg.hooks.PreToolUse[0].matcher, /Write/);
  assert.match(cfg.hooks.PreToolUse[0].matcher, /Edit/);
  assert.ok(cfg.hooks.PostToolUse);
  const pre = cfg.hooks.PreToolUse[0].hooks[0].args[0];
  const post = cfg.hooks.PostToolUse[0].hooks[0].args[0];
  assert.ok(fs.existsSync(path.join(root, pre.replace('${CLAUDE_PLUGIN_ROOT}/', ''))));
  assert.ok(fs.existsSync(path.join(root, post.replace('${CLAUDE_PLUGIN_ROOT}/', ''))));
});

test('extractWriteFields: full vs fragment shapes', () => {
  assert.equal(
    extractWriteFields({ file_path: 'a.js', content: 'hello' }, 'full').content,
    'hello',
  );
  assert.equal(
    extractWriteFields(
      { file_path: 'a.js', old_string: 'a', new_string: 'b' },
      'fragment',
    ).addedContent,
    'b',
  );
});

test('buildPreView respects truncation and shape', () => {
  return withStateDir((dir) => {
    const norm = normalize({
      hookEventName: 'pre_tool_use',
      cwd: dir,
      toolName: 'search_replace',
      toolInput: {
        file_path: path.join(dir, 'x.js'),
        old_string: '',
        new_string: 'hi',
      },
      toolInputTruncated: false,
    });
    const v = buildPreView(norm);
    assert.equal(v.shape, 'fragment');
    assert.equal(v.pathExists, false);
  });
});

test('signals: runSignals never throws on a bad signal list', () => {
  // Hooks must never throw — a throw becomes a nonzero exit and a visible
  // hook failure in the user's transcript. Found by adversarial pass.
  const view = {
    toolName: 'Write', shape: 'full', path: 'x.js', pathExists: false,
    content: 'x', truncated: false, mode: 'full',
  };
  for (const bad of [null, undefined, 'nope', 42, {}]) {
    assert.deepEqual(runSignals(bad, view), [], `threw or misbehaved on ${String(bad)}`);
  }
  assert.deepEqual(runSignals([null, undefined, { id: 'x' }], view), []);
});
