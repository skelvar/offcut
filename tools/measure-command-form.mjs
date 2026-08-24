#!/usr/bin/env node
// Temporary Phase-3 harness: records whether a hook ran and with what argv/env.
// Always exits 0. Writes one JSON line to ~/.offcut-cmd-form.jsonl
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const LOG = path.join(os.homedir(), '.offcut-cmd-form.jsonl');
const MARK = path.join(os.homedir(), '.offcut-cmd-form-mark');

let input = '';
let done = false;
function finish() {
  if (done) return;
  done = true;
  const entry = {
    at: new Date().toISOString(),
    label: process.argv[2] || 'unlabeled',
    argv: process.argv.slice(2),
    execArgv: process.execArgv,
    env: {
      CLAUDE_PLUGIN_ROOT: process.env.CLAUDE_PLUGIN_ROOT || null,
      PLUGIN_ROOT: process.env.PLUGIN_ROOT || null,
      CLAUDE_PROJECT_DIR: process.env.CLAUDE_PROJECT_DIR || null,
      CLAUDECODE: process.env.CLAUDECODE || null,
      GROK_SESSION_ID: process.env.GROK_SESSION_ID || null,
      CODEX_HOME: process.env.CODEX_HOME || null,
    },
    stdinLen: input.length,
  };
  try {
    fs.appendFileSync(LOG, JSON.stringify(entry) + '\n');
    fs.writeFileSync(MARK, entry.label + '\n');
  } catch {
    // ignore
  }
  process.exit(0);
}
process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  input += c;
});
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500).unref?.();
