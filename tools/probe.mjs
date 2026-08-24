#!/usr/bin/env node
// Offcut host probe — records what each harness actually sends to a hook.
//
// Purpose: the host capability table in the plan (§5.1) is derived from vendor
// docs. Docs drift and omit things. This probe captures the real payload from a
// real session so the table can be built from evidence instead.
//
// Contract: passive. Never blocks, never writes to stdout, always exits 0.
// A probe that breaks the user's session is worse than no data.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LOG = process.env.OFFCUT_PROBE_LOG
  || path.join(os.homedir(), '.offcut-probe.jsonl');

// Which harness are we inside? Recorded rather than assumed — the point of the
// probe is to find out which of these actually appear.
const HOST_ENV = [
  'CLAUDE_PLUGIN_ROOT', 'CLAUDE_PROJECT_DIR', 'CLAUDECODE',
  'PLUGIN_DATA', 'PLUGIN_ROOT', 'CODEX_HOME',
  'CURSOR_TRACE_ID', 'CURSOR_AGENT',
  'GROK_HOME', 'GROK_SESSION_ID',
  'COPILOT_PLUGIN_DATA',
  'QODER_SESSION_ID',
];

function record(raw) {
  let parsed = null;
  let parseError = null;
  try {
    parsed = JSON.parse(String(raw).replace(/^﻿/, ''));
  } catch (e) {
    parseError = e.message;
  }

  const env = {};
  for (const k of HOST_ENV) if (process.env[k]) env[k] = process.env[k];

  const entry = {
    // No Date.now() concern here — this is a standalone script, not a workflow.
    at: new Date().toISOString(),
    label: process.argv[2] || 'unlabeled',
    // Top-level keys are the real prize: they reveal the payload schema.
    keys: parsed && typeof parsed === 'object' ? Object.keys(parsed).sort() : null,
    event: parsed?.hook_event_name ?? parsed?.hookEventName ?? parsed?.event ?? null,
    tool: parsed?.tool_name ?? parsed?.toolName ?? null,
    sessionId: parsed?.session_id ? 'present' : (parsed?.sessionId ? 'present(camel)' : 'absent'),
    cwdKey: parsed?.cwd ? 'cwd' : (parsed?.workspace_roots ? 'workspace_roots' : null),
    env: Object.keys(env).sort(),
    argv: process.argv.slice(2),
    rawLength: String(raw).length,
    parseError,
    // Full payload last so a truncated line still yields the schema above.
    payload: parsed,
  };

  try {
    fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
  } catch (e) {
    // Best-effort. A probe that fails loudly is a probe that breaks a session.
  }
}

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;
  record(input);
  process.exit(0);
}

process.stdin.on('data', (c) => { input += c; });
process.stdin.on('end', finish);
process.stdin.on('error', finish);

// Some hosts wrap hooks in a shell that swallows the piped payload, so 'end'
// never fires and the process hangs — which freezes the session. Bound it.
// unref() keeps this from adding latency when 'end' arrives normally.
setTimeout(finish, 1500).unref();
