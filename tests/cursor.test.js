import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  detect,
  emit,
  gate,
  HOST_FACTS,
  installTargets,
  normalize,
  pluginRoot,
} from '../hooks/host.js';
import {
  claimHookDelivery,
  inspectServed,
  writeServedRoot,
} from '../hooks/state.js';
import { isOurs } from '../tools/install.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function runHook(script, payload, stateDir) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'hooks', script)], {
      cwd: root,
      env: { ...process.env, OFFCUT_STATE_DIR: stateDir },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(JSON.stringify(payload));
  });
}

const BASE = {
  conversation_id: 'cursor-conversation',
  generation_id: 'cursor-generation',
  model: 'gpt-5.6-sol-max',
  cursor_version: '3.17.19',
  workspace_roots: ['/D:/rightseam'],
  transcript_path:
    'C:\\Users\\tester\\.cursor\\projects\\d-rightseam\\agent-transcripts\\session\\session.jsonl',
};

const CURSOR = {
  session: {
    ...BASE,
    hook_event_name: 'sessionStart',
    session_id: 'cursor-conversation',
    composer_mode: 'agent',
    is_background_agent: false,
  },
  prompt: {
    ...BASE,
    hook_event_name: 'beforeSubmitPrompt',
    session_id: 'cursor-conversation',
    prompt: 'build a config loader',
    attachments: [],
  },
  pre: {
    ...BASE,
    hook_event_name: 'preToolUse',
    session_id: 'cursor-conversation',
    cwd: 'D:\\rightseam',
    tool_name: 'Write',
    tool_use_id: 'cursor-tool',
    tool_input: {
      file_path: 'D:\\rightseam\\new.js',
      content: 'export const answer = 42;\n',
    },
  },
  post: {
    ...BASE,
    hook_event_name: 'postToolUse',
    session_id: 'cursor-conversation',
    cwd: 'D:\\rightseam',
    tool_name: 'Write',
    tool_use_id: 'cursor-tool',
    tool_input: {
      file_path: 'D:\\rightseam\\new.js',
      content: 'export const answer = 42;\n',
    },
    tool_output: '{"file_path":"D:\\\\rightseam\\\\new.js","success":true}',
    duration: 12,
  },
  preSubagent: {
    ...BASE,
    hook_event_name: 'preToolUse',
    session_id: 'cursor-conversation',
    tool_name: 'Subagent',
    tool_use_id: 'cursor-subagent-tool',
    tool_input: {
      description: 'inspect adapter',
      prompt: 'Inspect the Cursor adapter and report findings.',
      model: 'inherit',
      subagent_type: 'explore',
      run_in_background: false,
    },
  },
  subagent: {
    ...BASE,
    hook_event_name: 'subagentStart',
    session_id: 'cursor-conversation',
    subagent_id: 'cursor-subagent',
    subagent_type: 'explore',
    task: 'inspect the adapter',
    parent_conversation_id: 'cursor-conversation',
    tool_call_id: 'cursor-task-tool',
    subagent_model: 'gpt-5.6-sol-max',
    is_parallel_worker: false,
  },
};

test('cursor contract: detect uses the payload, not model or environment', () => {
  assert.equal(detect(CURSOR.session), 'cursor');
});

test('cursor contract: native event names normalize to Offcut events', () => {
  const expected = new Map([
    [CURSOR.session, 'session_start'],
    [CURSOR.prompt, 'user_prompt_submit'],
    [CURSOR.pre, 'pre_tool_use'],
    [CURSOR.post, 'post_tool_use'],
    [CURSOR.preSubagent, 'pre_tool_use'],
    [CURSOR.subagent, 'subagent_start'],
  ]);

  for (const [fixture, event] of expected) {
    assert.equal(normalize(fixture).event, event);
  }
});

test('cursor contract: normalize preserves Cursor write and correlation fields', () => {
  const pre = normalize(CURSOR.pre);
  assert.equal(pre.host, 'cursor');
  assert.equal(pre.sessionId, 'cursor-conversation');
  assert.equal(pre.generationId, 'cursor-generation');
  assert.equal(pre.toolUseId, 'cursor-tool');
  assert.equal(pre.workspaceRoot, '/D:/rightseam');
  assert.equal(pre.toolName, 'Write');
  assert.deepEqual(pre.toolInput, CURSOR.pre.tool_input);

  const post = normalize(CURSOR.post);
  assert.equal(post.toolResult, CURSOR.post.tool_output);

  const sub = normalize(CURSOR.subagent);
  assert.equal(sub.subagentId, 'cursor-subagent');
  assert.equal(sub.subagentType, 'explore');

  const preSubagent = normalize(CURSOR.preSubagent);
  assert.equal(preSubagent.toolName, 'Subagent');
  assert.deepEqual(preSubagent.toolInput, CURSOR.preSubagent.tool_input);
});

test('cursor contract: context output is native flat JSON only', () => {
  const out = emit('cursor', 'user_prompt_submit', 'remember this');
  assert.deepEqual(out, { additional_context: 'remember this' });
  assert.equal(out.hookSpecificOutput, undefined);
  assert.equal(out.additionalContext, undefined);
});

test('cursor contract: write challenge is context, never a permission vote', () => {
  const out = gate('cursor', {
    kind: 'context',
    event: 'pre_tool_use',
    context: 'name the cheapest version',
  });
  assert.deepEqual(out, { additional_context: 'name the cheapest version' });
  assert.equal(out.permission, undefined);
});

test('cursor contract: unsupported strict escalation degrades honestly to context', () => {
  const out = gate('cursor', {
    kind: 'escalate',
    event: 'pre_tool_use',
    context: 'dependency challenge',
    reason: 'dependency challenge',
  });
  assert.deepEqual(out, { additional_context: 'dependency challenge' });
  assert.equal(out.permission, undefined);
  assert.equal(out.hookSpecificOutput, undefined);
});

test('cursor contract: Subagent rewrite preserves fields without casting an allow vote', () => {
  const updatedInput = {
    ...CURSOR.preSubagent.tool_input,
    prompt: `${CURSOR.preSubagent.tool_input.prompt}\n\nOFFCUT MODE: full`,
  };
  const out = gate('cursor', {
    kind: 'rewrite',
    input: updatedInput,
  });
  assert.deepEqual(out, {
    updated_input: updatedInput,
  });
  assert.equal(out.permission, undefined);
});

test('cursor docs describe the Subagent rewrite as permissionless', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.doesNotMatch(readme, /subagent inheritance returns `allow`/i);
  assert.match(readme, /input-only rewrite and casts no permission vote/i);
});

test('cursor contract: subagent inheritance uses the measured input-rewrite seam', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-subagent-'));
  fs.writeFileSync(path.join(state, 'active'), 'full\n');
  try {
    const result = await runHook('subagent.js', CURSOR.preSubagent, state);
    assert.equal(result.code, 0, result.stderr);
    assert.ok(result.stdout.trim(), 'Subagent preToolUse must return an input rewrite');
    const out = JSON.parse(result.stdout);
    assert.equal(out.permission, undefined, 'input mutation must not override another hook deny');
    assert.deepEqual(
      {
        ...out.updated_input,
        prompt: CURSOR.preSubagent.tool_input.prompt,
      },
      CURSOR.preSubagent.tool_input,
      'rewriting the prompt must preserve every other Subagent input field',
    );
    assert.ok(
      out.updated_input.prompt.startsWith(CURSOR.preSubagent.tool_input.prompt),
      'the original task must remain first and unchanged',
    );
    assert.match(out.updated_input.prompt, /OFFCUT MODE: full/);
    assert.match(out.updated_input.prompt, /cheapest thing that actually works/i);

    fs.writeFileSync(path.join(state, 'active'), 'off\n');
    const disabled = await runHook(
      'subagent.js',
      {
        ...CURSOR.preSubagent,
        tool_use_id: 'cursor-subagent-tool-disabled',
      },
      state,
    );
    assert.equal(disabled.stdout, '', 'off mode must not rewrite subagent tasks');
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test('cursor contract: host facts report the verified rewrite path', () => {
  assert.equal(HOST_FACTS.cursor.subagent, 'verified');
  assert.match(HOST_FACTS.cursor.subagentNote, /preToolUse Subagent input rewrite/i);
  assert.match(HOST_FACTS.cursor.subagentNote, /2026-08-27/);
});

test('cursor contract: plugin root accepts Cursor plugin installation', () => {
  const prev = process.env.CURSOR_PLUGIN_ROOT;
  process.env.CURSOR_PLUGIN_ROOT = 'D:\\cursor-cache\\offcut';
  try {
    assert.equal(pluginRoot(), 'D:\\cursor-cache\\offcut');
  } finally {
    if (prev === undefined) delete process.env.CURSOR_PLUGIN_ROOT;
    else process.env.CURSOR_PLUGIN_ROOT = prev;
  }
});

test('cursor contract: doctor knows the native user hooks location', () => {
  const home = path.join(os.tmpdir(), 'offcut-cursor-home');
  const target = installTargets(home).find((entry) => entry.host === 'cursor');
  assert.deepEqual(target, {
    host: 'cursor',
    file: path.join(home, '.cursor', 'hooks.json'),
    requiredDir: path.join(home, '.cursor'),
  });
});

test('cursor package: native manifest and adapter expose every required lifecycle seam', () => {
  const manifestPath = path.join(root, '.cursor-plugin', 'plugin.json');
  const adapterPath = path.join(root, 'adapters', 'cursor', 'hooks.json');
  assert.ok(fs.existsSync(manifestPath), '.cursor-plugin/plugin.json is required');
  assert.ok(fs.existsSync(adapterPath), 'adapters/cursor/hooks.json is required');

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.name, 'offcut');
  assert.equal(manifest.version, '0.2.0');
  assert.equal(manifest.skills, './skills/');
  assert.equal(manifest.hooks, './adapters/cursor/hooks.json');
  assert.ok(fs.statSync(path.join(root, manifest.skills)).isDirectory());

  const adapter = JSON.parse(fs.readFileSync(adapterPath, 'utf8'));
  assert.equal(adapter.version, 1);
  assert.deepEqual(Object.keys(adapter.hooks).sort(), [
    'beforeSubmitPrompt',
    'postToolUse',
    'preToolUse',
    'sessionEnd',
    'sessionStart',
  ]);

  for (const [event, handlers] of Object.entries(adapter.hooks)) {
    const expectedCount = event === 'preToolUse' ? 2 : 1;
    assert.equal(handlers.length, expectedCount, `${event} handler count`);
    for (const handler of handlers) {
      assert.equal(handler.type, undefined, 'command is Cursor hook default');
      assert.equal(handler.timeout, 5);
      assert.equal(handler.hooks, undefined, 'Cursor handlers are flat');
      assert.match(handler.command, /^node "\.\/hooks\/[^"]+\.js"$/);
      const rel = handler.command.match(/^node "\.\/(.+)"$/)?.[1];
      assert.ok(rel && fs.existsSync(path.join(root, rel)), `${event} command must exist`);
    }
  }
  assert.deepEqual(
    adapter.hooks.preToolUse.map(({ matcher, command }) => ({ matcher, command })),
    [
      { matcher: 'Write', command: 'node "./hooks/pre-write.js"' },
      { matcher: 'Subagent', command: 'node "./hooks/subagent.js"' },
    ],
  );
  assert.equal(adapter.hooks.postToolUse[0].matcher, 'Write');
});

test('cursor install: CLI merges native hooks and uninstall leaves foreign hooks', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-install-'));
  const cursorDir = path.join(home, '.cursor');
  const configPath = path.join(cursorDir, 'hooks.json');
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({
      version: 1,
      hooks: {
        beforeSubmitPrompt: [{ command: 'node "foreign.js"', timeout: 2 }],
        subagentStart: [
          {
            command: `node "${path.join(root, 'hooks', 'subagent.js').replace(/\\/g, '/')}"`,
            timeout: 5,
          },
        ],
      },
    }),
  );

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const installed = spawnSync(process.execPath, [path.join(root, 'tools', 'install.mjs')], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    assert.equal(installed.status, 0, installed.stderr);
    assert.match(installed.stdout, /cursor\s+installed/i);

    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.equal(config.version, 1);
    assert.equal(config.hooks.beforeSubmitPrompt[0].command, 'node "foreign.js"');
    for (const event of [
      'sessionStart',
      'sessionEnd',
      'beforeSubmitPrompt',
      'preToolUse',
      'postToolUse',
    ]) {
      const ours = config.hooks[event].filter((entry) =>
        /[\\/]hooks[\\/][^"]+\.js/.test(entry.command),
      );
      const expectedCount = event === 'preToolUse' ? 2 : 1;
      assert.equal(ours.length, expectedCount, `${event} Offcut handler count`);
      for (const handler of ours) {
        assert.equal(handler.hooks, undefined, `${event} handler must stay flat`);
        assert.match(
          handler.command,
          / offcut-hooks$/,
          `${event} handler must remain identifiable after a checkout moves`,
        );
      }
    }
    assert.equal(config.hooks.subagentStart, undefined);
    assert.deepEqual(
      config.hooks.preToolUse
        .filter((entry) => /[\\/]hooks[\\/][^"]+\.js/.test(entry.command))
        .map((entry) => entry.matcher),
      ['Write', 'Subagent'],
    );

    const removed = spawnSync(
      process.execPath,
      [path.join(root, 'tools', 'install.mjs'), '--uninstall'],
      { cwd: root, env, encoding: 'utf8' },
    );
    assert.equal(removed.status, 0, removed.stderr);
    const cleaned = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepEqual(cleaned, {
      version: 1,
      hooks: {
        beforeSubmitPrompt: [{ command: 'node "foreign.js"', timeout: 2 }],
      },
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('cursor install: malformed existing config is left byte-for-byte unchanged', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-invalid-install-'));
  const cursorDir = path.join(home, '.cursor');
  const configPath = path.join(cursorDir, 'hooks.json');
  const backupPath = `${configPath}.offcut-backup`;
  const malformed = '{ "version": 1, "hooks": [\n';
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(configPath, malformed);
  fs.writeFileSync(backupPath, 'older backup\n');

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const result = spawnSync(process.execPath, [path.join(root, 'tools', 'install.mjs')], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /cursor\s+failed — invalid JSON/i);
    assert.equal(fs.readFileSync(configPath, 'utf8'), malformed);
    assert.equal(fs.readFileSync(backupPath, 'utf8'), 'older backup\n');
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('cursor install: structurally invalid existing config is not rewritten', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-shape-install-'));
  const cursorDir = path.join(home, '.cursor');
  const configPath = path.join(cursorDir, 'hooks.json');
  const invalid = '{\n  "version": 1,\n  "hooks": []\n}\n';
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(configPath, invalid);

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const result = spawnSync(process.execPath, [path.join(root, 'tools', 'install.mjs')], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /cursor\s+failed — invalid JSON or hooks config/i);
    assert.equal(fs.readFileSync(configPath, 'utf8'), invalid);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('cursor install: unsupported versions and null hook entries are rejected', () => {
  const cases = [
    { version: 2, hooks: {} },
    { version: 1, hooks: { preToolUse: [null] } },
    { version: 1, hooks: { preToolUse: [{ matcher: 'Write', hooks: [null] }] } },
  ];

  for (const [index, config] of cases.entries()) {
    const home = fs.mkdtempSync(path.join(os.tmpdir(), `offcut-cursor-invalid-${index}-`));
    const cursorDir = path.join(home, '.cursor');
    const configPath = path.join(cursorDir, 'hooks.json');
    const original = `${JSON.stringify(config, null, 2)}\n`;
    fs.mkdirSync(cursorDir, { recursive: true });
    fs.writeFileSync(configPath, original);

    const env = { ...process.env, HOME: home, USERPROFILE: home };
    try {
      const result = spawnSync(process.execPath, [path.join(root, 'tools', 'install.mjs')], {
        cwd: root,
        env,
        encoding: 'utf8',
      });
      assert.notEqual(result.status, 0, `case ${index}\n${result.stdout}${result.stderr}`);
      assert.equal(fs.readFileSync(configPath, 'utf8'), original, `case ${index}`);
    } finally {
      fs.rmSync(home, { recursive: true, force: true });
    }
  }
});

test('cursor uninstall: preserves a pre-existing version-only config', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-version-install-'));
  const cursorDir = path.join(home, '.cursor');
  const configPath = path.join(cursorDir, 'hooks.json');
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify({ version: 1 }, null, 2));

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const installed = spawnSync(process.execPath, [path.join(root, 'tools', 'install.mjs')], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);

    const removed = spawnSync(
      process.execPath,
      [path.join(root, 'tools', 'install.mjs'), '--uninstall'],
      { cwd: root, env, encoding: 'utf8' },
    );
    assert.equal(removed.status, 0, removed.stdout + removed.stderr);
    assert.equal(fs.existsSync(configPath), true);
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), { version: 1 });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('grok install and uninstall preserve foreign content in the dedicated file', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-grok-foreign-install-'));
  const grokDir = path.join(home, '.grok');
  const configPath = path.join(grokDir, 'hooks', 'offcut-hooks.json');
  const foreign = {
    matcher: 'Write',
    hooks: [{ type: 'command', command: 'node "foreign.js"', timeout: 3 }],
  };
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(
    configPath,
    JSON.stringify({ metadata: { owner: 'user' }, hooks: { PreToolUse: [foreign] } }, null, 2),
  );

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const installed = spawnSync(process.execPath, [path.join(root, 'tools', 'install.mjs')], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    assert.equal(installed.status, 0, installed.stdout + installed.stderr);
    const merged = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepEqual(merged.metadata, { owner: 'user' });
    assert.equal(merged.hooks.PreToolUse[0].hooks[0].command, 'node "foreign.js"');
    assert.ok(merged.hooks.PreToolUse.some((entry) => isOurs(entry, root)));

    const removed = spawnSync(
      process.execPath,
      [path.join(root, 'tools', 'install.mjs'), '--uninstall'],
      { cwd: root, env, encoding: 'utf8' },
    );
    assert.equal(removed.status, 0, removed.stdout + removed.stderr);
    assert.deepEqual(JSON.parse(fs.readFileSync(configPath, 'utf8')), {
      metadata: { owner: 'user' },
      hooks: { PreToolUse: [foreign] },
    });
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('installer reports one filesystem failure and continues with later hosts', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-install-continue-'));
  const claudePath = path.join(home, '.claude');
  const codexDir = path.join(home, '.codex');
  const codexConfig = path.join(codexDir, 'hooks.json');
  fs.writeFileSync(claudePath, 'not a directory\n');
  fs.mkdirSync(codexDir, { recursive: true });

  const env = { ...process.env, HOME: home, USERPROFILE: home };
  try {
    const result = spawnSync(process.execPath, [path.join(root, 'tools', 'install.mjs')], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /claude\s+failed — filesystem error/i);
    assert.match(result.stdout, /codex\s+installed/i);
    const config = JSON.parse(fs.readFileSync(codexConfig, 'utf8'));
    assert.ok(config.hooks.SessionStart.some((entry) => isOurs(entry, root)));
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('cursor doctor: validates absolute scripts in flat native handlers', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-doctor-'));
  const state = path.join(home, 'state');
  const cursorDir = path.join(home, '.cursor');
  const missing = path.join(home, 'missing', 'hooks', 'activate.js');
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(cursorDir, { recursive: true });
  fs.writeFileSync(path.join(state, 'active'), 'full\n');
  fs.writeFileSync(path.join(state, 'served'), `${root}\n`);
  fs.writeFileSync(
    path.join(cursorDir, 'hooks.json'),
    JSON.stringify({
      version: 1,
      hooks: {
        sessionStart: [
          {
            command: `node "${missing.replace(/\\/g, '/')}"`,
            timeout: 5,
          },
        ],
      },
    }),
  );

  try {
    const result = spawnSync(process.execPath, [path.join(root, 'hooks', 'doctor.js')], {
      cwd: root,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        OFFCUT_STATE_DIR: state,
      },
      encoding: 'utf8',
    });
    assert.notEqual(result.status, 0, 'missing configured script must make doctor fail');
    assert.match(result.stdout, /FAIL\s+hook scripts/i);
    assert.ok(
      result.stdout.replace(/\\/g, '/').includes(missing.replace(/\\/g, '/')),
      'doctor must name the flat handler path',
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('cursor coexistence: duplicate config sources emit one reminder', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-dedupe-'));
  fs.writeFileSync(path.join(state, 'active'), 'full\n');
  try {
    const duplicate = await Promise.all([
      runHook('prompt.js', CURSOR.prompt, state),
      runHook('prompt.js', CURSOR.prompt, state),
    ]);
    for (const result of duplicate) {
      assert.equal(result.code, 0, result.stderr);
    }
    const emitted = duplicate.filter((result) => result.stdout.trim());
    assert.equal(emitted.length, 1, 'native and third-party sources must not double-inject');
    assert.deepEqual(JSON.parse(emitted[0].stdout), {
      additional_context:
        'OFFCUT ACTIVE — before you build: does it need to exist? does it already exist here? can the platform or stdlib do it? what is the cheapest thing that works? which boundary owns it?',
    });

    const next = await runHook(
      'prompt.js',
      { ...CURSOR.prompt, generation_id: 'cursor-generation-2' },
      state,
    );
    assert.ok(next.stdout.trim(), 'a new generation must still receive its reminder');
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test('cursor coexistence: a repeated generation does not advance lite cadence', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-lite-dedupe-'));
  fs.writeFileSync(path.join(state, 'active'), 'lite\n');
  try {
    const first = await runHook('prompt.js', CURSOR.prompt, state);
    const duplicate = await runHook('prompt.js', CURSOR.prompt, state);
    const second = await runHook(
      'prompt.js',
      { ...CURSOR.prompt, generation_id: 'cursor-generation-2' },
      state,
    );
    const third = await runHook(
      'prompt.js',
      { ...CURSOR.prompt, generation_id: 'cursor-generation-3' },
      state,
    );
    assert.equal(first.stdout, '');
    assert.equal(duplicate.stdout, '');
    assert.equal(second.stdout, '');
    assert.ok(third.stdout.trim(), 'the third distinct turn should receive the lite reminder');
    assert.equal(
      fs.readFileSync(path.join(state, 'turn-cursor-conversation'), 'utf8').trim(),
      '3',
    );
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test('cursor coexistence: duplicate sessionStart sources emit the ruleset once', async () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-session-dedupe-'));
  try {
    fs.writeFileSync(path.join(state, 'style-cursor-conversation'), 'normal\n', 'utf8');
    const duplicate = await Promise.all([
      runHook('activate.js', CURSOR.session, state),
      runHook('activate.js', CURSOR.session, state),
    ]);
    for (const result of duplicate) {
      assert.equal(result.code, 0, result.stderr);
    }
    assert.equal(
      duplicate.filter((result) => result.stdout.trim()).length,
      1,
      'only one installed copy may inject SessionStart context',
    );
    const emitted = duplicate.find((result) => result.stdout.trim());
    const context = JSON.parse(emitted.stdout).additional_context;
    assert.equal(
      context.split(/\r?\n/).filter((line) => line === 'OFFCUT STYLE: normal').length,
      1,
    );

    const resumed = await runHook(
      'activate.js',
      {
        ...CURSOR.session,
        generation_id: 'cursor-resumed-generation',
        source: 'resume',
      },
      state,
    );
    assert.ok(
      resumed.stdout.trim(),
      'a later generation in the same session must re-inject the ruleset',
    );
  } finally {
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test('cursor coexistence: old claims never reopen an ABA race', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-claim-'));
  const prev = process.env.OFFCUT_STATE_DIR;
  process.env.OFFCUT_STATE_DIR = state;
  try {
    assert.equal(claimHookDelivery('same-delivery'), true);
    const claim = fs.readdirSync(state).find((name) => name.startsWith('claim-'));
    assert.ok(claim);
    const old = new Date(Date.now() - 60_000);
    fs.utimesSync(path.join(state, claim), old, old);
    assert.equal(
      claimHookDelivery('same-delivery'),
      false,
      'correlation ids, not racy stale-file takeover, define a new delivery',
    );
    assert.equal(claimHookDelivery('next-generation'), true);
  } finally {
    if (prev === undefined) delete process.env.OFFCUT_STATE_DIR;
    else process.env.OFFCUT_STATE_DIR = prev;
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test('cursor diagnostics: served state records the host and reads legacy roots', () => {
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-served-'));
  const prev = process.env.OFFCUT_STATE_DIR;
  process.env.OFFCUT_STATE_DIR = state;
  try {
    assert.equal(writeServedRoot(root, 'cursor'), true);
    assert.deepEqual(
      { ...inspectServed(), mtime: undefined },
      { state: 'ok', root, host: 'cursor', mtime: undefined },
    );

    fs.writeFileSync(path.join(state, 'served'), `${root}\n`);
    assert.deepEqual(
      { ...inspectServed(), mtime: undefined },
      { state: 'ok', root, mtime: undefined },
      'plain v0.1 served files must remain readable',
    );
  } finally {
    if (prev === undefined) delete process.env.OFFCUT_STATE_DIR;
    else process.env.OFFCUT_STATE_DIR = prev;
    fs.rmSync(state, { recursive: true, force: true });
  }
});

test('cursor diagnostics: doctor recognizes a host-managed plugin with no user config', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-plugin-doctor-'));
  const state = path.join(home, 'state');
  const plugin = path.join(home, '.cursor', 'plugins', 'local', 'offcut');
  fs.mkdirSync(state, { recursive: true });
  fs.mkdirSync(plugin, { recursive: true });
  fs.cpSync(path.join(root, '.cursor-plugin'), path.join(plugin, '.cursor-plugin'), {
    recursive: true,
  });
  fs.cpSync(path.join(root, 'adapters', 'cursor'), path.join(plugin, 'adapters', 'cursor'), {
    recursive: true,
  });
  fs.cpSync(path.join(root, 'hooks'), path.join(plugin, 'hooks'), { recursive: true });
  fs.writeFileSync(path.join(state, 'active'), 'off\n');

  try {
    const result = spawnSync(process.execPath, [path.join(root, 'hooks', 'doctor.js')], {
      cwd: root,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        OFFCUT_STATE_DIR: state,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /OK\s+host:cursor:\s+Cursor — tier 1/i);
    assert.doesNotMatch(result.stdout, /no Offcut hooks found/i);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('cursor diagnostics: stale served state is not an installed-plugin claim', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-stale-doctor-'));
  const state = path.join(home, 'state');
  fs.mkdirSync(state, { recursive: true });
  fs.writeFileSync(path.join(state, 'active'), 'full\n');
  fs.writeFileSync(
    path.join(state, 'served'),
    `${JSON.stringify({ root, host: 'cursor' })}\n`,
  );

  try {
    const result = spawnSync(process.execPath, [path.join(root, 'hooks', 'doctor.js')], {
      cwd: root,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        OFFCUT_STATE_DIR: state,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /FAIL\s+host:\s+no Offcut hooks found/i);
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('cursor diagnostics: checks a local plugin even beside user hooks and resolves its paths', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-cursor-dual-doctor-'));
  const state = path.join(home, 'state');
  const cursorDir = path.join(home, '.cursor');
  const plugin = path.join(cursorDir, 'plugins', 'local', 'offcut');
  fs.mkdirSync(path.join(plugin, '.cursor-plugin'), { recursive: true });
  fs.mkdirSync(path.join(plugin, 'adapters', 'cursor'), { recursive: true });
  fs.mkdirSync(state, { recursive: true });

  fs.writeFileSync(
    path.join(cursorDir, 'hooks.json'),
    JSON.stringify({
      version: 1,
      hooks: {
        sessionStart: [
          {
            command: `node "${path.join(root, 'hooks', 'activate.js')}" offcut-hooks`,
          },
        ],
      },
    }),
  );
  fs.writeFileSync(
    path.join(plugin, '.cursor-plugin', 'plugin.json'),
    JSON.stringify({
      name: 'offcut',
      hooks: './adapters/cursor/hooks.json',
    }),
  );
  fs.writeFileSync(
    path.join(plugin, 'adapters', 'cursor', 'hooks.json'),
    JSON.stringify({
      version: 1,
      hooks: {
        sessionStart: [{ command: 'node "hooks/activate.js"' }],
      },
    }),
  );
  fs.writeFileSync(path.join(state, 'active'), 'full\n');
  fs.writeFileSync(
    path.join(state, 'served'),
    `${JSON.stringify({ root, host: 'cursor' })}\n`,
  );

  try {
    const result = spawnSync(process.execPath, [path.join(root, 'hooks', 'doctor.js')], {
      cwd: root,
      env: {
        ...process.env,
        HOME: home,
        USERPROFILE: home,
        OFFCUT_STATE_DIR: state,
      },
      encoding: 'utf8',
    });
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stdout, /FAIL\s+hook scripts/i);
    assert.ok(
      result.stdout
        .replace(/\\/g, '/')
        .includes(path.join(plugin, 'hooks', 'activate.js').replace(/\\/g, '/')),
    );
  } finally {
    fs.rmSync(home, { recursive: true, force: true });
  }
});
