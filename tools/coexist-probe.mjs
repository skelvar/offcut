#!/usr/bin/env node
// Coexistence probe — marks that it ran and optionally returns additionalContext.
//
//   node tools/coexist-probe.mjs LABEL [--context TOKEN] [--deny] [--sleep MS]
//
// Passive by default (exit 0). Never throws. Used only for Phase 9 measurement;
// install beside Offcut, then remove.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const args = process.argv.slice(2);
const label = args.find((a) => !a.startsWith('--')) || 'neighbour';
const contextIdx = args.indexOf('--context');
const context = contextIdx >= 0 ? args[contextIdx + 1] : null;
const deny = args.includes('--deny');
const sleepIdx = args.indexOf('--sleep');
const sleepMs = sleepIdx >= 0 ? Number(args[sleepIdx + 1]) || 0 : 0;

const MARK = process.env.OFFCUT_COEXIST_MARK
  || path.join(os.homedir(), '.offcut-coexist-mark.jsonl');

function record(extra) {
  try {
    fs.appendFileSync(
      MARK,
      JSON.stringify({
        at: new Date().toISOString(),
        label,
        pid: process.pid,
        ...extra,
      }) + '\n',
    );
  } catch {
    // best-effort
  }
}

let input = '';
let done = false;

function finish() {
  if (done) return;
  done = true;

  let event = null;
  try {
    const parsed = JSON.parse(String(input).replace(/^\uFEFF/, ''));
    event = parsed?.hook_event_name ?? parsed?.hookEventName ?? null;
  } catch {
    // ignore
  }

  const run = () => {
    record({ event, sleptMs: sleepMs, denied: deny, context: context || null });

    const out = { hookSpecificOutput: {} };
    if (event) out.hookSpecificOutput.hookEventName = event;
    if (deny) {
      out.hookSpecificOutput.permissionDecision = 'deny';
      out.hookSpecificOutput.permissionDecisionReason = `coexist-probe:${label}`;
    }
    if (context) out.hookSpecificOutput.additionalContext = context;

    if (deny || context) {
      process.stdout.write(JSON.stringify(out));
    }
    process.exit(0);
  };

  if (sleepMs > 0) setTimeout(run, sleepMs);
  else run();
}

process.stdin.setEncoding('utf8');
process.stdin.on('data', (c) => {
  input += c;
});
process.stdin.on('end', finish);
process.stdin.on('error', finish);
setTimeout(finish, 1500);
