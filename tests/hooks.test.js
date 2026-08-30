import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  detect,
  normalize,
  emit,
  parseJson,
  readStdin,
} from '../hooks/host.js';
import {
  readMode,
  writeMode,
  writeDefaultMode,
  clearMode,
  activateSession,
  bumpTurn,
  resetTurn,
  paths,
  DEFAULT_MODE,
} from '../hooks/state.js';
import * as stateModule from '../hooks/state.js';
import {
  loadRuleset,
  stripFrontmatter,
  sessionContext,
  nativeSessionContext,
  FALLBACK_RULESET,
  REMINDER,
  SESSION_FOOTER,
} from '../hooks/rules.js';
import {
  parseOffcutCommand,
  shouldRemind,
  handlePrompt,
  reminderText,
} from '../hooks/prompt.js';
import * as promptModule from '../hooks/prompt.js';
import { handleActivate } from '../hooks/activate.js';
import { handleSubagent } from '../hooks/subagent.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withStateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-test-'));
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
      // Leave stdin open to simulate never-closing pipe; the hook timeout must exit.
    } else {
      child.stdin.write(stdin);
      child.stdin.end();
    }
  });
}

// --- host ---

test('detect: grok from hookEventName', () => {
  assert.equal(detect({ hookEventName: 'session_start' }), 'grok');
});

test('detect: codex from transcript_path', () => {
  assert.equal(
    detect({
      hook_event_name: 'SessionStart',
      transcript_path: '/home/u/.codex/sessions/abc.jsonl',
    }),
    'codex',
  );
});

test('detect: claude default', () => {
  assert.equal(detect({ hook_event_name: 'SessionStart' }), 'claude');
});

test('detect: ignores leaking CLAUDE_PROJECT_DIR on grok payload', () => {
  // Env must not matter; payload wins.
  assert.equal(detect({ hookEventName: 'user_prompt_submit', sessionId: 'x' }), 'grok');
});

test('normalize: grok camelCase fields + truncation flags', () => {
  const n = normalize({
    hookEventName: 'pre_tool_use',
    sessionId: 's1',
    toolName: 'write',
    toolInput: { path: 'a.js' },
    toolResult: { ok: true },
    toolInputTruncated: true,
    toolResultTruncated: false,
    subagentId: 'sa',
    subagentType: 'general-purpose',
  });
  assert.equal(n.host, 'grok');
  assert.equal(n.event, 'pre_tool_use');
  assert.equal(n.sessionId, 's1');
  assert.equal(n.toolName, 'write');
  assert.equal(n.toolInputTruncated, true);
  assert.equal(n.subagentId, 'sa');
  assert.equal(n.subagentType, 'general-purpose');
});

test('normalize: claude snake_case + agent_id fields', () => {
  const n = normalize({
    hook_event_name: 'SubagentStart',
    session_id: 's2',
    agent_id: 'a1',
    agent_type: 'general-purpose',
    tool_name: 'Write',
    tool_input: {},
    tool_response: {},
  });
  assert.equal(n.host, 'claude');
  assert.equal(n.event, 'subagent_start');
  assert.equal(n.subagentId, 'a1');
  assert.equal(n.toolName, 'Write');
  assert.equal(n.toolInputTruncated, false);
});

test('normalize: codex default agent type value preserved', () => {
  const n = normalize({
    hook_event_name: 'SubagentStart',
    transcript_path: 'C:\\Users\\x\\.codex\\sessions\\t.jsonl',
    agent_id: 'x',
    agent_type: 'default',
  });
  assert.equal(n.host, 'codex');
  assert.equal(n.subagentType, 'default');
});

test('emit: JSON context shape uses PascalCase hookEventName', () => {
  const out = emit('claude', 'session_start', 'hello');
  assert.deepEqual(out, {
    hookSpecificOutput: {
      hookEventName: 'SessionStart',
      additionalContext: 'hello',
    },
  });
});

test('parseJson strips BOM and handles empty/malformed', () => {
  assert.deepEqual(parseJson('\uFEFF{"a":1}'), { a: 1 });
  assert.equal(parseJson(''), null);
  assert.equal(parseJson('{'), null);
});

// --- state ---

test('state: default mode is full when absent', async () => {
  await withStateDir(() => {
    assert.equal(readMode(), DEFAULT_MODE);
  });
});

test('state: write/read/switch modes including off', async () => {
  await withStateDir(() => {
    assert.equal(writeMode('strict'), true);
    assert.equal(readMode(), 'strict');
    assert.equal(writeMode('off'), true);
    assert.equal(readMode(), 'off');
  });
});

test('state: default persists across clearMode', async () => {
  await withStateDir(() => {
    writeDefaultMode('lite');
    writeMode('strict');
    clearMode();
    assert.equal(readMode(), 'lite');
  });
});

test('state: activateSession seeds from default', async () => {
  await withStateDir(() => {
    writeDefaultMode('strict');
    assert.equal(activateSession(), 'strict');
    assert.equal(readMode(), 'strict');
  });
});

test('state: session overrides do not cross concurrent conversations', async () => {
  await withStateDir(() => {
    writeDefaultMode('full');
    clearMode();

    assert.equal(activateSession('alpha', 'startup'), 'full');
    assert.equal(activateSession('beta', 'startup'), 'full');
    assert.equal(writeMode('off', 'alpha'), true);

    assert.equal(readMode('alpha'), 'off');
    assert.equal(readMode('beta'), 'full');
    assert.equal(
      activateSession('gamma', 'startup'),
      'full',
      'a new session inherited alpha\'s temporary override instead of the default',
    );
  });
});

test('state: default changes affect the current and future sessions, not existing peers', async () => {
  await withStateDir(() => {
    writeDefaultMode('full');
    clearMode();
    activateSession('alpha', 'startup');
    activateSession('beta', 'startup');

    writeDefaultMode('strict');
    writeMode('strict', 'alpha');

    assert.equal(readMode('alpha'), 'strict');
    assert.equal(readMode('beta'), 'full');
    assert.equal(activateSession('gamma', 'startup'), 'strict');
  });
});

test('state: bumpTurn increments', async () => {
  await withStateDir(() => {
    resetTurn('s1');
    assert.equal(bumpTurn('s1'), 1);
    assert.equal(bumpTurn('s1'), 2);
    assert.equal(bumpTurn('s1'), 3);
  });
});

test('state: turn counters are per-session, not shared', async () => {
  await withStateDir(() => {
    resetTurn('alpha');
    resetTurn('beta');
    assert.equal(bumpTurn('alpha'), 1);
    assert.equal(bumpTurn('alpha'), 2);
    // beta is a separate concurrent session; alpha's turns must not count here
    assert.equal(bumpTurn('beta'), 1, 'beta inherited alpha count — counter is global');
    // and a new session starting must not reset a session already running
    resetTurn('beta');
    assert.equal(bumpTurn('alpha'), 3, "beta's SessionStart reset alpha's counter");
  });
});

test('state: missing state dir is non-fatal', async () => {
  await withStateDir(async (dir) => {
    fs.rmSync(dir, { recursive: true, force: true });
    assert.equal(readMode(), DEFAULT_MODE);
    // write may recreate
    writeMode('full');
  });
});

// --- rules ---

test('rules: loads SKILL.md body', () => {
  const { text, source } = loadRuleset(root);
  assert.equal(source, 'file');
  assert.match(text, /cheapest thing that actually works/i);
  assert.doesNotMatch(text, /^---/);
});

test('rules: fallback when unreadable', () => {
  const { text, source } = loadRuleset(path.join(root, 'does-not-exist'));
  assert.equal(source, 'fallback');
  assert.equal(text, FALLBACK_RULESET);
});

test('rules: stripFrontmatter', () => {
  assert.equal(stripFrontmatter('---\nname: x\n---\n\nBody'), 'Body');
});

test('rules: reminder under 60 tokens (rough)', () => {
  assert.ok(REMINDER.split(/\s+/).length < 60);
  assert.equal(reminderText(), REMINDER);
});

test('rules: Q2 is not a pre-write repo-search ritual', () => {
  const { text } = loadRuleset(root);
  assert.doesNotMatch(text, /Search this repository before writing/i);
  assert.doesNotMatch(FALLBACK_RULESET, /Search this repository before writing/i);
  assert.match(text, /Reuse files already open this turn/i);
  assert.doesNotMatch(REMINDER, /No tool preamble/);
});

test('state: concise is the default and style overrides are session scoped', async () => {
  await withStateDir((dir) => {
    assert.equal(typeof stateModule.readStyle, 'function');
    assert.equal(typeof stateModule.writeStyle, 'function');
    assert.equal(typeof stateModule.normalizeStyle, 'function');
    assert.equal(stateModule.DEFAULT_STYLE, 'concise');
    assert.equal(stateModule.readStyle('alpha'), 'concise');
    assert.equal(stateModule.writeStyle('normal', 'alpha'), true);
    assert.equal(stateModule.readStyle('alpha'), 'normal');
    assert.equal(stateModule.readStyle('beta'), 'concise');
    assert.equal(stateModule.writeStyle('loud', 'alpha'), false);
    assert.equal(stateModule.readStyle('alpha'), 'normal');

    stateModule.writeStyle('normal');
    fs.writeFileSync(path.join(dir, 'style-alpha'), 'corrupt\n', 'utf8');
    assert.equal(stateModule.readStyle('alpha'), 'concise');
  });
});

test('rules: canonical and fallback concise styles preserve required content', () => {
  const shipped = loadRuleset(root).text;
  for (const text of [shipped, FALLBACK_RULESET]) {
    assert.match(text, /OFFCUT STYLE: normal/);
    assert.match(text, /result, evidence, material caveat/i);
    assert.match(text, /exact errors/i);
    assert.match(text, /security or privacy\s+warnings/i);
    assert.match(text, /never reduces engineering work/i);
  }
  assert.doesNotMatch(REMINDER, /OFFCUT STYLE|tool preamble|exact errors/i);
  assert.doesNotMatch(SESSION_FOOTER, /No tool preamble/i);
});

test('rules: default concise keeps a stable prefix and normal is a late override', () => {
  const concise = sessionContext('full', root, 'concise');
  const normal = sessionContext('full', root, 'normal');
  const markerLines = (text) =>
    text.split(/\r?\n/).filter((line) => /^OFFCUT STYLE: (?:concise|normal)$/.test(line));

  assert.deepEqual(markerLines(concise), []);
  assert.deepEqual(markerLines(normal), ['OFFCUT STYLE: normal']);
  assert.ok(normal.startsWith(`${concise}\n\n`));
  assert.doesNotMatch(normal, /^OFFCUT STYLE: concise$/m);
});

test('rules: native context carries only mode and style state', () => {
  assert.equal(
    nativeSessionContext('full', 'concise'),
    'OFFCUT MODE: full\nOFFCUT STYLE: concise',
  );
  assert.equal(
    nativeSessionContext('strict', 'normal'),
    'OFFCUT MODE: strict\nOFFCUT STYLE: normal',
  );
  assert.match(nativeSessionContext('off', 'concise'), /ignore the installed Offcut kernel/i);
  assert.doesNotMatch(nativeSessionContext('full', 'concise'), /cheapest thing/i);
});

// --- prompt commands ---

test('parseOffcutCommand: mode switches', () => {
  assert.deepEqual(parseOffcutCommand('/offcut lite').mode, 'lite');
  assert.deepEqual(parseOffcutCommand('/offcut full').type, 'set');
  assert.deepEqual(parseOffcutCommand('/offcut strict').mode, 'strict');
  assert.deepEqual(parseOffcutCommand('/offcut off').mode, 'off');
});

test('parseOffcutCommand: default and deactivation phrases', () => {
  assert.equal(parseOffcutCommand('/offcut default lite').type, 'default');
  assert.equal(parseOffcutCommand('stop offcut').mode, 'off');
  assert.equal(parseOffcutCommand('normal mode').mode, 'off');
});

test('parseOffcutCommand: other /offcut skips reminder', () => {
  assert.equal(parseOffcutCommand('/offcut review').type, 'command');
  assert.equal(parseOffcutCommand('add caching'), null);
});

test('parseOffcutCommand: concise style grammar is exact', () => {
  assert.equal(typeof promptModule.parseOffcutCommand, 'function');
  assert.deepEqual(promptModule.parseOffcutCommand('/offcut concise on'), {
    type: 'style',
    style: 'concise',
    message: 'OFFCUT STYLE: concise. Concise responses are on for this session.',
  });
  assert.deepEqual(promptModule.parseOffcutCommand('/offcut concise off'), {
    type: 'style',
    style: 'normal',
    message:
      'OFFCUT STYLE: normal. Concise responses are off for this session; Offcut construction rules remain active.',
  });
  assert.equal(promptModule.parseOffcutCommand('/offcut concise')?.type, 'command');
  assert.equal(promptModule.parseOffcutCommand('/offcut concise maybe')?.type, 'command');
});

test('shouldRemind: off never, full always, lite every 3rd', () => {
  assert.equal(shouldRemind('off', null, () => 1), false);
  assert.equal(shouldRemind('full', null, () => 1), true);
  assert.equal(shouldRemind('strict', null, () => 1), true);
  assert.equal(shouldRemind('full', { type: 'set' }, () => 1), false);
  let t = 0;
  const bump = () => ++t;
  assert.equal(shouldRemind('lite', null, bump), false); // 1
  assert.equal(shouldRemind('lite', null, bump), false); // 2
  assert.equal(shouldRemind('lite', null, bump), true); // 3
});

test('handlePrompt: injects reminder when active', async () => {
  await withStateDir(async () => {
    writeMode('full');
    const out = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'add caching to this endpoint',
        session_id: 's',
      }),
    );
    assert.match(out.hookSpecificOutput.additionalContext, /OFFCUT ACTIVE/);
  });
});

test('handlePrompt: silent when off', async () => {
  await withStateDir(async () => {
    writeMode('off');
    const out = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'add caching to this endpoint',
        session_id: 's',
      }),
    );
    assert.equal(out, null);
  });
});

test('handlePrompt: mode command switches and confirms', async () => {
  await withStateDir(async () => {
    writeMode('full');
    const out = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        prompt: '/offcut lite',
        session_id: 's',
      }),
    );
    assert.equal(readMode(), 'lite');
    assert.match(out.hookSpecificOutput.additionalContext, /lite/);
  });
});

test('handlePrompt: concise off changes style, not Offcut mode', async () => {
  await withStateDir(async () => {
    assert.equal(typeof stateModule.readStyle, 'function');
    writeMode('full', 'alpha');
    const out = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'alpha',
        prompt: '/offcut concise off',
      }),
    );
    assert.equal(readMode('alpha'), 'full');
    assert.equal(stateModule.readStyle('alpha'), 'normal');
    assert.match(out.hookSpecificOutput.additionalContext, /OFFCUT STYLE: normal/);
    assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /OFFCUT ACTIVE/);
    assert.equal(stateModule.readStyle('beta'), 'concise');
  });
});

test('style lifecycle keeps session overrides isolated and invalid commands inert', async () => {
  await withStateDir(async () => {
    writeDefaultMode('full');
    writeMode('full', 'alpha');
    stateModule.writeStyle('normal', 'alpha');

    for (const source of ['resume', 'clear', 'compact']) {
      const out = await handleActivate(
        normalize({ hook_event_name: 'SessionStart', source, session_id: 'alpha' }),
      );
      assert.match(out.hookSpecificOutput.additionalContext, /^OFFCUT STYLE: normal$/m);
      assert.equal(stateModule.readStyle('alpha'), 'normal');
    }

    const invalid = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'alpha',
        prompt: '/offcut concise maybe',
      }),
    );
    assert.equal(invalid, null);
    assert.equal(readMode('alpha'), 'full');
    assert.equal(stateModule.readStyle('alpha'), 'normal');

    writeMode('off', 'silent');
    stateModule.writeStyle('normal', 'silent');
    assert.equal(
      await handleActivate(
        normalize({ hook_event_name: 'SessionStart', source: 'resume', session_id: 'silent' }),
      ),
      null,
    );
  });
});

test('handlePrompt: stopping one session does not silence another or a new session', async () => {
  await withStateDir(async () => {
    writeDefaultMode('full');
    clearMode();
    await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'alpha' }),
    );
    await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'beta' }),
    );

    await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'stop offcut',
        session_id: 'alpha',
      }),
    );
    const beta = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'build a parser',
        session_id: 'beta',
      }),
    );
    const gamma = await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'gamma' }),
    );

    assert.equal(readMode('alpha'), 'off');
    assert.equal(readMode('beta'), 'full');
    assert.match(beta.hookSpecificOutput.additionalContext, /OFFCUT ACTIVE/);
    assert.match(gamma.hookSpecificOutput.additionalContext, /OFFCUT MODE: full/);
  });
});

test('handlePrompt: default command changes this and future sessions, not an existing peer', async () => {
  await withStateDir(async () => {
    writeDefaultMode('full');
    clearMode();
    await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'alpha' }),
    );
    await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'beta' }),
    );

    const changed = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        prompt: '/offcut default strict',
        session_id: 'alpha',
      }),
    );
    const gamma = await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'gamma' }),
    );

    assert.match(changed.hookSpecificOutput.additionalContext, /default.*strict/i);
    assert.equal(readMode('alpha'), 'strict');
    assert.equal(readMode('beta'), 'full');
    assert.equal(readMode('gamma'), 'strict');
    assert.match(gamma.hookSpecificOutput.additionalContext, /OFFCUT MODE: strict/);
  });
});

test('handleActivate: a new fork never inherits an unrelated active session mode', async () => {
  await withStateDir(async () => {
    writeDefaultMode('full');
    clearMode();
    await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'alpha' }),
    );
    await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        prompt: '/offcut off',
        session_id: 'alpha',
      }),
    );
    await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 'beta' }),
    );
    await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        prompt: '/offcut strict',
        session_id: 'beta',
      }),
    );

    await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'fork', session_id: 'child' }),
    );

    assert.equal(readMode('alpha'), 'off');
    assert.equal(readMode('beta'), 'strict');
    assert.equal(readMode('child'), 'full');
  });
});

// --- activate / subagent ---

test('handleActivate: emits ruleset in full', async () => {
  await withStateDir(async () => {
    writeDefaultMode('full');
    clearMode();
    const out = await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'startup', session_id: 's' }),
    );
    assert.match(out.hookSpecificOutput.additionalContext, /OFFCUT MODE: full/);
    assert.match(out.hookSpecificOutput.additionalContext, /cheapest thing that actually works/i);
    assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  });
});

test('handleActivate: emits nothing when off', async () => {
  await withStateDir(async () => {
    writeDefaultMode('off');
    clearMode();
    const out = await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'clear', session_id: 's' }),
    );
    assert.equal(out, null);
  });
});

test('handleSubagent: inherits mode on all host shapes', async () => {
  await withStateDir(async () => {
    writeMode('full');
    const claude = await handleSubagent(
      normalize({
        hook_event_name: 'SubagentStart',
        agent_id: 'a',
        agent_type: 'general-purpose',
      }),
    );
    assert.match(claude.hookSpecificOutput.additionalContext, /OFFCUT MODE/);

    const grok = await handleSubagent(
      normalize({
        hookEventName: 'subagent_start',
        subagentId: 'b',
        subagentType: 'general-purpose',
      }),
    );
    assert.match(grok.hookSpecificOutput.additionalContext, /OFFCUT MODE/);

    const codex = await handleSubagent(
      normalize({
        hook_event_name: 'SubagentStart',
        transcript_path: '/tmp/.codex/sessions/x.jsonl',
        agent_id: 'c',
        agent_type: 'default',
      }),
    );
    assert.match(codex.hookSpecificOutput.additionalContext, /OFFCUT MODE/);
  });
});

// --- failure contract via real processes ---

test('failure: malformed JSON exits 0, empty stdout', async () => {
  await withStateDir(async (dir) => {
    const r = await runHookScript('activate.js', 'not-json{', {
      OFFCUT_STATE_DIR: dir,
      CLAUDE_PLUGIN_ROOT: root,
    });
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
  });
});

test('failure: empty stdin exits 0', async () => {
  await withStateDir(async (dir) => {
    const r = await runHookScript('prompt.js', '', {
      OFFCUT_STATE_DIR: dir,
      CLAUDE_PLUGIN_ROOT: root,
    });
    assert.equal(r.code, 0);
  });
});

test('failure: BOM-prefixed payload works', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const payload =
      '\uFEFF' +
      JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: 'build a config loader',
        session_id: 'bom',
      });
    const r = await runHookScript('prompt.js', payload, {
      OFFCUT_STATE_DIR: dir,
      CLAUDE_PLUGIN_ROOT: root,
    });
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /OFFCUT ACTIVE/);
  });
});

test('failure: missing state file still activates from default', async () => {
  await withStateDir(async (dir) => {
    // empty dir — no active/default
    const payload = JSON.stringify({
      hook_event_name: 'SessionStart',
      source: 'startup',
      session_id: 'x',
    });
    const r = await runHookScript('activate.js', payload, {
      OFFCUT_STATE_DIR: dir,
      CLAUDE_PLUGIN_ROOT: root,
    });
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /OFFCUT MODE: full/);
  });
});

test('failure: unreadable ruleset falls back', async () => {
  await withStateDir(async (dir) => {
    writeMode('full');
    const fakeRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-norules-'));
    try {
      const payload = JSON.stringify({
        hook_event_name: 'SessionStart',
        source: 'startup',
        session_id: 'x',
      });
      const r = await runHookScript('activate.js', payload, {
        OFFCUT_STATE_DIR: dir,
        CLAUDE_PLUGIN_ROOT: fakeRoot,
      });
      assert.equal(r.code, 0);
      const out = JSON.parse(r.stdout);
      assert.match(out.hookSpecificOutput.additionalContext, /cheapest thing that actually works/i);
    } finally {
      fs.rmSync(fakeRoot, { recursive: true, force: true });
    }
  });
});

test('failure: stdin never closes — hook exits 0 without hanging', async () => {
  await withStateDir(async (dir) => {
    const r = await runHookScript('prompt.js', null, {
      OFFCUT_STATE_DIR: dir,
      CLAUDE_PLUGIN_ROOT: root,
    }, 5000);
    assert.equal(r.code, 0);
  });
});

// --- evals corpus ---

test('evals: fire cases inject under always-inject default; quiet cases are known-pending', async () => {
  await withStateDir(async () => {
    writeMode('full');
    const lines = fs
      .readFileSync(path.join(root, 'evals', 'prompts.jsonl'), 'utf8')
      .trim()
      .split(/\n/)
      .map((l) => JSON.parse(l.replace(/^\uFEFF/, '')));

    const fire = lines.filter((x) => x.expect === 'fire');
    const quiet = lines.filter((x) => x.expect === 'quiet');
    assert.ok(fire.length >= 20);
    assert.ok(quiet.length >= 20);

    let fireHits = 0;
    for (const row of fire) {
      const out = await handlePrompt(
        normalize({
          hook_event_name: 'UserPromptSubmit',
          prompt: row.prompt,
          session_id: 'e',
        }),
      );
      if (out?.hookSpecificOutput?.additionalContext?.includes('OFFCUT ACTIVE')) {
        fireHits += 1;
      }
    }
    assert.ok(fireHits / fire.length >= 0.85, `fire rate ${fireHits}/${fire.length}`);

    // Known-pending: always-inject default means quiet cases also fire.
    let quietFires = 0;
    for (const row of quiet) {
      const out = await handlePrompt(
        normalize({
          hook_event_name: 'UserPromptSubmit',
          prompt: row.prompt,
          session_id: 'e',
        }),
      );
      if (out?.hookSpecificOutput?.additionalContext?.includes('OFFCUT ACTIVE')) {
        quietFires += 1;
      }
    }
    assert.ok(
      quietFires === quiet.length,
      `known-pending: expected all quiet cases to fire under always-inject, got ${quietFires}/${quiet.length}`,
    );
  });
});

test('statusline.sh reflects mode', async (t) => {
  // Windows often aliases `bash` to a WSL stub with no distro — skip there.
  if (process.platform === 'win32') {
    t.skip('statusline.sh exercised on POSIX CI');
    return;
  }
  await withStateDir(async (dir) => {
    writeMode('strict');
    const script = path.join(root, 'hooks', 'statusline.sh');
    const r = await new Promise((resolve, reject) => {
      const child = spawn('bash', [script], {
        env: { ...process.env, OFFCUT_STATE_DIR: dir },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => {
        stdout += d;
      });
      child.stderr.on('data', (d) => {
        stderr += d;
      });
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      child.on('error', reject);
    });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout.trim(), /offcut:strict/);
  });
});

test('native guidance: activation and subagents emit state without duplicating the kernel', async () => {
  await withStateDir(async () => {
    writeDefaultMode('full');
    clearMode();
    const norm = normalize({
      hook_event_name: 'SessionStart',
      source: 'startup',
      session_id: 'native',
    });
    const out = await handleActivate(norm, { native: true });
    assert.equal(
      out.hookSpecificOutput.additionalContext,
      'OFFCUT MODE: full\nOFFCUT STYLE: concise',
    );

    const child = await handleSubagent(
      normalize({
        hook_event_name: 'SubagentStart',
        session_id: 'native',
        agent_id: 'child',
      }),
      { native: true },
    );
    assert.equal(
      child.hookSpecificOutput.additionalContext,
      'OFFCUT MODE: full\nOFFCUT STYLE: concise',
    );
  });
});

test('native guidance: off explicitly neutralizes persistence and reminders stay silent', async () => {
  await withStateDir(async () => {
    writeDefaultMode('off');
    clearMode();
    const activated = await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'clear', session_id: 'native-off' }),
      { native: true },
    );
    assert.match(activated.hookSpecificOutput.additionalContext, /^OFFCUT MODE: off/m);
    assert.match(activated.hookSpecificOutput.additionalContext, /ignore the installed Offcut kernel/i);

    writeMode('full', 'native-on');
    const reminder = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'native-on',
        prompt: 'build a parser',
      }),
      { native: true },
    );
    assert.equal(reminder, null);

    const stopped = await handlePrompt(
      normalize({
        hook_event_name: 'UserPromptSubmit',
        session_id: 'native-on',
        prompt: '/offcut off',
      }),
      { native: true },
    );
    assert.match(stopped.hookSpecificOutput.additionalContext, /^OFFCUT MODE: off/m);
    assert.match(stopped.hookSpecificOutput.additionalContext, /ignore the installed Offcut kernel/i);
  });
});

test('handleActivate and subagents deliver only the normal style override', async () => {
  await withStateDir(async () => {
    writeDefaultMode('full');
    clearMode();
    stateModule.writeStyle('normal', 'alpha');

    const normal = await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'resume', session_id: 'alpha' }),
    );
    const normalText = normal.hookSpecificOutput.additionalContext;
    assert.match(normalText, /^OFFCUT STYLE: normal$/m);
    assert.doesNotMatch(normalText, /^OFFCUT STYLE: concise$/m);

    const child = await handleSubagent(
      normalize({
        hook_event_name: 'SubagentStart',
        session_id: 'alpha',
        agent_id: 'child',
        agent_type: 'general-purpose',
      }),
    );
    assert.match(child.hookSpecificOutput.additionalContext, /^OFFCUT STYLE: normal$/m);

    const fresh = await handleActivate(
      normalize({ hook_event_name: 'SessionStart', source: 'fork', session_id: 'beta' }),
    );
    assert.doesNotMatch(fresh.hookSpecificOutput.additionalContext, /^OFFCUT STYLE:/m);
  });
});

test('statusline.sh uses the session id from status JSON', async (t) => {
  if (process.platform === 'win32') {
    t.skip('statusline.sh exercised on POSIX CI');
    return;
  }
  await withStateDir(async (dir) => {
    writeMode('full', 'beta');
    writeMode('off', 'alpha');
    const script = path.join(root, 'hooks', 'statusline.sh');
    const run = (sessionId) =>
      new Promise((resolve, reject) => {
        const child = spawn('bash', [script], {
          env: { ...process.env, OFFCUT_STATE_DIR: dir },
          stdio: ['pipe', 'pipe', 'pipe'],
        });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (d) => {
          stdout += d;
        });
        child.stderr.on('data', (d) => {
          stderr += d;
        });
        child.on('close', (code) => resolve({ code, stdout, stderr }));
        child.on('error', reject);
        child.stdin.end(JSON.stringify({ session_id: sessionId }));
      });

    const beta = await run('beta');
    const alpha = await run('alpha');
    const unknown = await run('not-started');
    assert.equal(beta.code, 0, beta.stderr);
    assert.equal(alpha.code, 0, alpha.stderr);
    assert.equal(unknown.code, 0, unknown.stderr);
    assert.equal(beta.stdout.trim(), 'offcut:full');
    assert.equal(alpha.stdout.trim(), 'offcut:off');
    assert.equal(unknown.stdout.trim(), 'offcut:-');
  });
});

test('statusline.ps1 reflects mode', async (t) => {
  if (process.platform !== 'win32') {
    t.skip('statusline.ps1 exercised on Windows');
    return;
  }
  await withStateDir(async (dir) => {
    writeMode('strict');
    const r = await new Promise((resolve, reject) => {
      const child = spawn(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', path.join(root, 'hooks', 'statusline.ps1')],
        { env: { ...process.env, OFFCUT_STATE_DIR: dir }, stdio: ['ignore', 'pipe', 'pipe'] },
      );
      let stdout = '';
      child.stdout.on('data', (d) => {
        stdout += d;
      });
      child.on('close', (code) => resolve({ code, stdout }));
      child.on('error', reject);
    });
    assert.equal(r.code, 0);
    assert.match(r.stdout.trim(), /offcut:strict/);
  });
});
