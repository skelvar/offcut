import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { detect, normalize, emit, gate } from '../hooks/host.js';
import { handleActivate } from '../hooks/activate.js';
import { handlePrompt } from '../hooks/prompt.js';
import { handleSubagent } from '../hooks/subagent.js';
import { writeMode, writeDefaultMode, clearMode } from '../hooks/state.js';
import os from 'node:os';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withStateDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-contract-'));
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

const FIXTURES = {
  claude: {
    session: {
      hook_event_name: 'SessionStart',
      session_id: 'c-s',
      source: 'startup',
      cwd: '/tmp',
      transcript_path: '/home/u/.claude/projects/x/y.jsonl',
    },
    prompt: {
      hook_event_name: 'UserPromptSubmit',
      session_id: 'c-s',
      prompt: 'build a config loader',
      cwd: '/tmp',
      transcript_path: '/home/u/.claude/projects/x/y.jsonl',
    },
    subagent: {
      hook_event_name: 'SubagentStart',
      session_id: 'c-s',
      agent_id: 'a1',
      agent_type: 'general-purpose',
      cwd: '/tmp',
      transcript_path: '/home/u/.claude/projects/x/y.jsonl',
    },
  },
  codex: {
    session: {
      hook_event_name: 'SessionStart',
      session_id: 'x-s',
      source: 'startup',
      cwd: '/tmp',
      transcript_path: '/home/u/.codex/sessions/y.jsonl',
      model: 'gpt-5.6-sol',
      turn_id: 't1',
    },
    prompt: {
      hook_event_name: 'UserPromptSubmit',
      session_id: 'x-s',
      prompt: 'build a config loader',
      cwd: '/tmp',
      transcript_path: '/home/u/.codex/sessions/y.jsonl',
      turn_id: 't1',
      model: 'gpt-5.6-sol',
    },
    subagent: {
      hook_event_name: 'SubagentStart',
      session_id: 'x-s',
      agent_id: 'a2',
      agent_type: 'default',
      cwd: '/tmp',
      transcript_path: '/home/u/.codex/sessions/y.jsonl',
      turn_id: 't1',
    },
  },
  grok: {
    session: {
      hookEventName: 'session_start',
      sessionId: 'g-s',
      source: 'startup',
      cwd: '/tmp',
      workspaceRoot: '/tmp',
      timestamp: '2026-08-24T00:00:00Z',
    },
    prompt: {
      hookEventName: 'user_prompt_submit',
      sessionId: 'g-s',
      prompt: 'build a config loader',
      cwd: '/tmp',
      workspaceRoot: '/tmp',
      transcriptPath: '/tmp/t.jsonl',
      timestamp: '2026-08-24T00:00:00Z',
    },
    subagent: {
      hookEventName: 'subagent_start',
      sessionId: 'g-s',
      subagentId: 'sa1',
      subagentType: 'general-purpose',
      cwd: '/tmp',
      workspaceRoot: '/tmp',
      description: 'do work',
      timestamp: '2026-08-24T00:00:00Z',
    },
  },
};

test('contract: detect maps each fixture host', () => {
  assert.equal(detect(FIXTURES.claude.session), 'claude');
  assert.equal(detect(FIXTURES.codex.session), 'codex');
  assert.equal(detect(FIXTURES.grok.session), 'grok');
});

test('contract: normalize never leaves the other dialect event field', () => {
  const c = normalize(FIXTURES.claude.session);
  assert.equal(c.host, 'claude');
  assert.ok(!('hookEventName' in c));
  assert.equal(c.event, 'session_start');

  const g = normalize(FIXTURES.grok.session);
  assert.equal(g.host, 'grok');
  assert.ok(!('hook_event_name' in g));
  assert.equal(g.event, 'session_start');
});

for (const host of ['claude', 'codex', 'grok']) {
  test(`contract: ${host} activate/prompt/subagent output shapes`, async () => {
    await withStateDir(async () => {
      writeDefaultMode('full');
      clearMode();

      const act = await handleActivate(normalize(FIXTURES[host].session));
      assert.ok(act?.hookSpecificOutput?.additionalContext);
      assert.equal(act.hookSpecificOutput.hookEventName, 'SessionStart');

      writeMode('full');
      const pr = await handlePrompt(normalize(FIXTURES[host].prompt));
      assert.ok(pr?.hookSpecificOutput?.additionalContext.includes('OFFCUT ACTIVE'));
      assert.equal(pr.hookSpecificOutput.hookEventName, 'UserPromptSubmit');

      const sub = await handleSubagent(normalize(FIXTURES[host].subagent));
      assert.ok(sub?.hookSpecificOutput?.additionalContext.includes('OFFCUT MODE'));
      assert.equal(sub.hookSpecificOutput.hookEventName, 'SubagentStart');

      // Negative dialect checks on serialized output:
      // Grok must never emit the snake_case input event field name.
      // Claude/Codex must never emit Grok's root-level input event field.
      const blobs = [act, pr, sub].map((o) => JSON.stringify(o));
      for (const blob of blobs) {
        if (host === 'grok') {
          assert.ok(!blob.includes('"hook_event_name"'), 'Grok output must not contain hook_event_name');
        } else {
          // Claude/Codex output uses nested hookEventName (platform schema).
          // Assert they do not leak Grok *input* root keys as siblings of hookSpecificOutput.
          const parsed = JSON.parse(blob);
          assert.equal(parsed.hookEventName, undefined);
          assert.equal(parsed.sessionId, undefined);
          assert.equal(parsed.toolName, undefined);
        }
      }
    });
  });
}

test('contract: emit() for grok omits hook_event_name; claude omit root hookEventName', () => {
  const g = JSON.stringify(emit('grok', 'user_prompt_submit', 'x'));
  assert.ok(!g.includes('hook_event_name'));

  const c = emit('claude', 'user_prompt_submit', 'x');
  assert.equal(c.hookEventName, undefined);
  assert.ok(c.hookSpecificOutput.hookEventName);
});

test('contract: gate never returns deny', () => {
  for (const host of ['claude', 'codex', 'grok']) {
    const out = gate(host, {
      kind: 'escalate',
      reason: 'new dependency',
      context: 'why?',
    });
    const s = JSON.stringify(out);
    assert.ok(!s.includes('"deny"'));
    assert.ok(!s.includes('"permissionDecision":"deny"'));
  }
});

test('contract: adapters/claude/hooks.json wires SessionStart matcher and scripts', () => {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(root, 'adapters', 'claude', 'hooks.json'), 'utf8'),
  );
  const ss = cfg.hooks.SessionStart[0];
  assert.match(ss.matcher, /compact/);
  assert.match(ss.matcher, /clear/);
  assert.match(ss.matcher, /fork/);
  for (const event of [
    'SessionStart',
    'UserPromptSubmit',
    'SubagentStart',
    'PreToolUse',
    'PostToolUse',
  ]) {
    const hook = cfg.hooks[event][0].hooks[0];
    assert.equal(hook.type, 'command');
    // Single-string command — Grok silently ignores an `args` array (docs/development/HOSTS.md).
    assert.equal(hook.args, undefined);
    assert.match(hook.command, /^node "/);
    const rel = hook.command.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/)?.[1];
    assert.ok(rel, `command should embed script path: ${hook.command}`);
    assert.ok(fs.existsSync(path.join(root, rel)));
  }
  assert.match(cfg.hooks.PreToolUse[0].matcher, /Write\|Edit\|apply_patch/);
  assert.match(cfg.hooks.PostToolUse[0].matcher, /Write\|Edit\|apply_patch/);
});

test('contract: versions match across manifests and skill metadata', () => {
  const plugin = JSON.parse(fs.readFileSync(path.join(root, 'plugin.json'), 'utf8'));
  const claudePlugin = JSON.parse(
    fs.readFileSync(path.join(root, '.claude-plugin', 'plugin.json'), 'utf8'),
  );
  const cursorPlugin = JSON.parse(
    fs.readFileSync(path.join(root, '.cursor-plugin', 'plugin.json'), 'utf8'),
  );
  const market = JSON.parse(
    fs.readFileSync(path.join(root, '.claude-plugin', 'marketplace.json'), 'utf8'),
  );
  const skill = fs.readFileSync(path.join(root, 'skills', 'offcut', 'SKILL.md'), 'utf8');
  const ver = skill.match(/version:\s*"([^"]+)"/);
  assert.ok(ver);
  assert.equal(plugin.version, ver[1]);
  assert.equal(claudePlugin.version, ver[1]);
  assert.equal(cursorPlugin.version, ver[1]);
  assert.equal(market.plugins[0].version, ver[1]);
});

test('contract: AGENTS.md is not stale relative to SKILL.md', () => {
  const skill = fs.readFileSync(path.join(root, 'skills', 'offcut', 'SKILL.md'), 'utf8');
  const agents = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  let body = skill;
  if (skill.startsWith('---')) {
    const end = skill.indexOf('\n---', 3);
    body = skill.slice(end + 4).replace(/^\r?\n/, '');
  }
  assert.ok(agents.includes(body.trim()), 'AGENTS.md missing SKILL.md body — run scripts/build-agents-md.js');
  assert.match(agents, /Generated from/);
  assert.match(agents, /## Response style/);
});

test('contract: no hook script outside host.js/adapters contains a host identifier', () => {
  const banned = /\b(claude|codex|grok|cursor)\b/i;
  const hookDir = path.join(root, 'hooks');
  const offenders = [];
  for (const name of fs.readdirSync(hookDir)) {
    if (name === 'host.js') continue;
    const full = path.join(hookDir, name);
    if (!fs.statSync(full).isFile()) continue;
    const text = fs.readFileSync(full, 'utf8');
    if (banned.test(text)) offenders.push(name);
  }
  assert.deepEqual(offenders, [], `host names leaked into: ${offenders.join(', ')}`);
});
