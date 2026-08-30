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
  ALL_SIGNALS,
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

test('signal new-file was deleted: creating a file is not evidence', () => {
  assert.equal(
    PRE_SIGNALS.find((s) => s.id === 'new-file'),
    undefined,
  );
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

  const commentPadding = Array.from(
    { length: LARGE_FIRST_WRITE_LINES + 5 },
    (_, i) => `// padding ${i}`,
  ).join('\n');
  assert.equal(
    sig.check(view({ pathExists: false, content: commentPadding, shape: 'full' })),
    false,
    'comment padding is not a large implementation',
  );
  assert.equal(
    runSignals(
      [sig],
      view({
        path: 'large.py',
        pathExists: false,
        content: big,
        addedContent: big,
        shape: 'full',
      }),
    ).length,
    0,
    'JS/TS line heuristics must not claim coverage on Python',
  );
});

test('signal new-dependency: positive on package.json dep add; negative on src edit', () => {
  const sig = PRE_SIGNALS.find((s) => s.id === 'new-dependency');
  assert.equal(
    sig.check(
      view({
        path: 'package.json',
        addedContent: '"dependencies": {\n  "left-pad": "1.0.0"\n}',
        content: '"dependencies": {\n  "left-pad": "1.0.0"\n}',
        pathExists: false,
      }),
    ),
    true,
  );
  assert.equal(
    sig.check(
      view({
        path: 'package.json',
        addedContent: '"dependencies": {\n  "left-pad": "1.0.0"\n}',
        content: '"dependencies": {\n  "left-pad": "1.0.0"\n}',
        pathExists: true,
        shape: 'full',
      }),
    ),
    false,
    'rewriting an existing manifest does not prove that its dependencies are new',
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
  assert.equal(
    sig.check(
      view({
        path: 'package.json',
        addedContent: '    "node": ">=18",\n',
        content: '    "node": ">=18",\n',
        shape: 'fragment',
      }),
    ),
    false,
    'package engine metadata is not a dependency',
  );
  assert.equal(
    sig.check(
      view({
        path: 'package.json',
        addedContent: '    "homepage": "https://example.test/project",\n',
        content: '    "homepage": "https://example.test/project",\n',
        shape: 'fragment',
      }),
    ),
    false,
    'package metadata URLs are not dependencies',
  );
  for (const ambiguous of [
    '    "vscode": "^1.80.0",\n',
    '    "port": "3000",\n',
    '    "left-pad": "^1.0.0",\n',
  ]) {
    assert.equal(
      sig.check(
        view({
          path: 'package.json',
          addedContent: ambiguous,
          content: ambiguous,
          shape: 'fragment',
        }),
      ),
      false,
      `bare package line is not enough context: ${ambiguous.trim()}`,
    );
  }
  assert.equal(
    sig.check(
      view({
        path: 'Cargo.toml',
        addedContent: '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2024"\n',
        content: '[package]\nname = "demo"\nversion = "0.1.0"\nedition = "2024"\n',
      }),
    ),
    false,
    'Cargo package metadata is not a dependency',
  );
  assert.equal(
    sig.check(
      view({
        path: 'Cargo.toml',
        addedContent: '[workspace.dependencies]\nserde = { version = "1" }\n',
        content: '[workspace.dependencies]\nserde = { version = "1" }\n',
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
  assert.equal(
    sig.check(
      view({
        content: 'const note = "interface Fake {} class One implements Fake {}";\n',
      }),
    ),
    false,
    'an abstraction described in a string is not source structure',
  );
  assert.equal(
    sig.check(
      view({
        content: 'const pattern = /interface Fake {} class One implements Fake {}/;\n',
      }),
    ),
    false,
    'an abstraction described in a regular expression is not source structure',
  );
  assert.equal(
    sig.check(
      view({
        content:
          'if (enabled) /interface Fake {} class One implements Fake {}/.test(value);\n',
      }),
    ),
    false,
    'a regex expression after a control condition is not source structure',
  );
  // Name-shape alone is not an abstraction (ttl-cache false positive).
  const factory = `
export function createCache({ defaultTtlMs = 1000 } = {}) {
  const store = new Map();
  return { get() { return store }, set() { store.set(1, 1) } };
}
`;
  assert.equal(sig.check(view({ content: factory })), false);
  assert.equal(
    runSignals(
      [sig],
      view({
        path: 'View.tsx',
        content:
          'export function View() { return <div>interface Fake class One implements Fake</div>; }',
        addedContent:
          'export function View() { return <div>interface Fake class One implements Fake</div>; }',
        context: 'diff',
      }),
    ).length,
    0,
    'the lightweight lexer must not claim JSX/TSX structural coverage',
  );
});

test('signal config-for-constant is deleted', () => {
  // Phase 7: syntax match fired on 47.9% of real files; same retirement path as new-file.
  assert.equal(
    PRE_SIGNALS.find((s) => s.id === 'config-for-constant'),
    undefined,
  );
});

test('post signal exported-unused: needs corpus; silent without one', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'exported-unused');
  assert.match(sig.message, /scanned scope/i);
  const orphan = 'export function helper(){ return 1 }\n';
  // Write-time: no corpus → not decidable.
  assert.equal(sig.check(view({ content: orphan })), false);
  // Multi-module corpus with no caller → fire.
  assert.equal(
    sig.check(
      view({
        content: orphan,
        corpus: `${orphan}\nimport { other } from "./x.js";\n`,
      }),
    ),
    true,
  );
  // Caller present in corpus → silent.
  assert.equal(
    sig.check(
      view({
        content: orphan,
        corpus: `${orphan}\nimport { helper } from "./h.js";\nhelper();\n`,
      }),
    ),
    false,
  );
  assert.equal(
    sig.check(
      view({
        content: '// export function future() {}\n',
        corpus: 'import { other } from "./x.js";\n// export function future() {}\n',
      }),
    ),
    false,
    'an export described in a comment is not an exported symbol',
  );
  // Write context must not select the signal.
  assert.ok(!sig.contexts.includes('write'));
});

test('post signal new-config-surface: positive and negative', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'new-config-surface');
  assert.equal(
    sig.check(view({ addedContent: 'import { cosmiconfig } from "cosmiconfig";\n' })),
    true,
  );
  // process.env alone is often the requested surface — not a new framework.
  assert.equal(
    sig.check(view({ addedContent: 'const x = process.env.NEW_FLAG;\n' })),
    false,
  );
  assert.equal(
    sig.check(view({ addedContent: 'const x = 1 + 2;\n' })),
    false,
  );
  assert.equal(
    sig.check(view({ addedContent: '// defineConfig may be added later\n' })),
    false,
  );
  assert.equal(
    sig.check(view({ addedContent: 'const note = "call getConfig later";\n' })),
    false,
  );
  assert.equal(
    sig.check(view({ addedContent: 'const pattern = /defineConfig\\(/;\n' })),
    false,
  );
});

test('post signal single-call-wrapper is deleted', () => {
  assert.equal(
    POST_SIGNALS.find((s) => s.id === 'single-call-wrapper'),
    undefined,
  );
  assert.equal(
    ALL_SIGNALS.find((s) => s.id === 'single-call-wrapper'),
    undefined,
  );
});

test('post signal unused-default-param: positive and negative', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'unused-default-param');
  assert.match(sig.message, /never read/i);
  assert.doesNotMatch(sig.message, /no call site passes/i);
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
  assert.equal(
    sig.check(view({ content: '// function future(timeout = 30) {}\n' })),
    false,
  );
  assert.equal(
    sig.check(view({ content: 'const note = "function future(timeout = 30) {}";\n' })),
    false,
  );
  assert.equal(
    sig.check(view({ content: 'const pattern = /function future(timeout = 30)/;\n' })),
    false,
  );
  assert.equal(
    sig.check(
      view({
        content:
          'function greeting(prefix = "Hi") { return `${prefix}, world`; }\n',
      }),
    ),
    false,
    'a parameter used inside a template interpolation is not unused',
  );
  assert.equal(
    sig.check(
      view({
        content:
          'function greeting(prefix = "Hi") { return `literal prefix only`; }\n',
      }),
    ),
    true,
    'literal template text must not count as a parameter reference',
  );
  assert.equal(
    sig.check(
      view({
        content:
          "const apiError = (parsed && parsed.terminal_reason === 'api_error') || status >= 400;\n",
      }),
    ),
    false,
    'a parenthesized assignment is not an arrow-function parameter list',
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
    // Truncation must silence content-based signals.
    const decision = decidePreWrite(norm, 'full');
    assert.equal(decision, null);
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
    const target = path.join(dir, 'fresh.ts');
    const content =
      'interface Store { get(k: string): string }\n' +
      'class MemoryStore implements Store { get(k: string) { return k } }\n';
    const payload = {
      hook_event_name: 'PreToolUse',
      session_id: 'once-a',
      cwd: dir,
      tool_name: 'Write',
      tool_input: { file_path: target, content },
    };
    const first = await handlePreWrite(normalize(payload));
    assert.ok(first?.hookSpecificOutput?.additionalContext.includes('one implementation'));
    const second = await handlePreWrite(normalize(payload));
    assert.equal(second, null, 'same signal must not re-fire in session');

    // Different session can fire again.
    const other = await handlePreWrite(
      normalize({ ...payload, session_id: 'once-b' }),
    );
    assert.ok(other?.hookSpecificOutput?.additionalContext.includes('one implementation'));
  });
});

test('one challenge per signal remains true across concurrent hook processes', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const payload = JSON.stringify({
      hook_event_name: 'PreToolUse',
      session_id: 'parallel-once',
      cwd: dir,
      tool_name: 'Write',
      tool_input: {
        file_path: path.join(dir, 'parallel.ts'),
        content:
          'interface Store { get(k: string): string }\n' +
          'class MemoryStore implements Store { get(k: string) { return k } }\n',
      },
    });

    const results = await Promise.all([
      runHookScript('pre-write.js', payload, { OFFCUT_STATE_DIR: dir }),
      runHookScript('pre-write.js', payload, { OFFCUT_STATE_DIR: dir }),
    ]);
    assert.deepEqual(results.map((result) => result.code), [0, 0]);
    const emitted = results.filter((result) => result.stdout.trim());
    assert.equal(
      emitted.length,
      1,
      `concurrent hooks emitted ${emitted.length} copies of one session signal`,
    );
    assert.match(emitted[0].stdout, /one implementation/i);
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
          file_path: path.join(dir, 'n.ts'),
          content:
            'interface Store { get(k: string): string }\n' +
            'class MemoryStore implements Store { get(k: string) { return k } }\n',
        },
      }),
    );
    assert.ok(out?.hookSpecificOutput?.additionalContext.includes('one implementation'));
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
    const body =
      'interface Store { get(k: string): string }\n' +
      'class MemoryStore implements Store { get(k: string) { return k } }\n';
    const spellings = [
      { hook_event_name: 'PreToolUse', tool_name: 'Write', session_id: 'w1',
        tool_input: { file_path: path.join(dir, 'a1.ts'), content: body } },
      { hook_event_name: 'PreToolUse', tool_name: 'Edit', session_id: 'w2',
        tool_input: { file_path: path.join(dir, 'a2.ts'), old_string: '', new_string: body } },
      { hook_event_name: 'PreToolUse', tool_name: 'apply_patch', session_id: 'w3',
        transcript_path: '/tmp/.codex/sessions/t.jsonl',
        tool_input: {
          path: path.join(dir, 'a3.ts'),
          patch: `*** Begin Patch\n*** Add File: ${path.join(dir, 'a3.ts').replace(/\\/g, '/')}\n${body.split('\n').map((l) => `+${l}`).join('\n')}\n*** End Patch`,
        } },
      { hookEventName: 'pre_tool_use', toolName: 'write', sessionId: 'w4',
        toolInput: { path: path.join(dir, 'a4.ts'), content: body } },
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
  const preCmd = cfg.hooks.PreToolUse[0].hooks[0].command;
  const postCmd = cfg.hooks.PostToolUse[0].hooks[0].command;
  assert.equal(cfg.hooks.PreToolUse[0].hooks[0].args, undefined);
  assert.equal(cfg.hooks.PostToolUse[0].hooks[0].args, undefined);
  const pre = preCmd.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/)?.[1];
  const post = postCmd.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/)?.[1];
  assert.ok(fs.existsSync(path.join(root, pre)));
  assert.ok(fs.existsSync(path.join(root, post)));
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

test('extractWriteFields: apply_patch may use tool_input.command', () => {
  // Measured 2026-08-24: one host's PreToolUse for apply_patch carries the
  // patch blob in tool_input.command, not patch/input/file_path.
  const patch =
    '*** Begin Patch\n*** Add File: D:/rightseam/new-file.ts\n+export interface A {}\n+export class B implements A {}\n*** End Patch';
  const fields = extractWriteFields({ command: patch }, 'fragment');
  assert.equal(fields.path, 'D:/rightseam/new-file.ts');
  assert.match(fields.addedContent, /export interface A/);
  assert.match(fields.addedContent, /export class B implements A/);
  assert.equal(fields.addedContent.includes('+'), false);
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
