#!/usr/bin/env node
// Turns the probe log into the verified host-capability table.
//
//   node tools/report-probe.mjs
//
// Answers, per harness, from evidence rather than vendor docs:
//   - which events actually fired
//   - what the payload schema really is
//   - which env vars identify the host
//   - whether event names arrive PascalCase or camelCase

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const LOG = process.env.RIGHTSEAM_PROBE_LOG
  || path.join(os.homedir(), '.rightseam-probe.jsonl');

if (!fs.existsSync(LOG)) {
  console.error(`No probe log at ${LOG}`);
  console.error('Install first (node tools/install-probe.mjs), then use each harness.');
  process.exit(1);
}

const rows = fs.readFileSync(LOG, 'utf8')
  .split('\n').filter(Boolean)
  .map((l) => { try { return JSON.parse(l); } catch { return null; } })
  .filter(Boolean);

if (!rows.length) {
  console.error('Probe log is empty — no hook has fired yet.');
  process.exit(1);
}

// Attribute each record to a harness.
//
// Payload first, env second. Measured 2026-08-24: Codex sets NO identifying env
// var, and CLAUDE_PROJECT_DIR leaks into other harnesses' environments — so env
// is both absent when needed and present when wrong. The payload is intrinsic.
function hostOf(r) {
  const p = r.payload || {};
  const e = new Set(r.env || []);
  const transcript = String(p.transcript_path || p.transcriptPath || '');

  // camelCase event field is Grok's signature, regardless of env.
  if (p.hookEventName !== undefined || p.workspaceRoot !== undefined) return 'grok';
  if (transcript.includes('.codex')) return 'codex';
  if (transcript.includes('.claude')) return 'claude';
  if (p.turn_id !== undefined) return 'codex';
  if (p.prompt_id !== undefined || p.session_title !== undefined) return 'claude';

  if (e.has('CURSOR_TRACE_ID') || e.has('CURSOR_AGENT')) return 'cursor';
  if (e.has('GROK_HOME') || e.has('GROK_SESSION_ID')) return 'grok';
  if (e.has('CODEX_HOME') || e.has('PLUGIN_DATA')) return 'codex';
  if (e.has('CLAUDE_PLUGIN_ROOT') || e.has('CLAUDECODE')) return 'claude';
  if (e.has('COPILOT_PLUGIN_DATA')) return 'copilot';
  return 'unknown';
}

const caseOf = (s) => (s.includes('_') ? 'snake_case'
  : /^[a-z]/.test(s) ? 'camelCase' : 'PascalCase');

const byHost = new Map();
for (const r of rows) {
  const h = hostOf(r);
  if (!byHost.has(h)) byHost.set(h, []);
  byHost.get(h).push(r);
}

console.log(`RightSeam host probe — ${rows.length} events across ${byHost.size} harness(es)\n`);

for (const [host, recs] of [...byHost].sort()) {
  console.log(`\n${'='.repeat(64)}\n${host.toUpperCase()}  (${recs.length} events)\n${'='.repeat(64)}`);

  const events = new Map();
  for (const r of recs) {
    const name = r.event || r.label || 'unknown';
    if (!events.has(name)) events.set(name, []);
    events.get(name).push(r);
  }

  console.log('\n  events that actually fired:');
  for (const [name, rs] of [...events].sort()) {
    const casing = caseOf(name);
    const tools = [...new Set(rs.map((r) => r.tool).filter(Boolean))];
    console.log(`    ${name.padEnd(24)} x${String(rs.length).padEnd(3)} ${casing}${tools.length ? '  tools: ' + tools.join(', ') : ''}`);
  }

  const envs = [...new Set(recs.flatMap((r) => r.env || []))].sort();
  console.log(`\n  identifying env vars: ${envs.length ? envs.join(', ') : 'NONE — host cannot be detected from env!'}`);

  const keys = [...new Set(recs.flatMap((r) => r.keys || []))].sort();
  console.log(`  payload top-level keys: ${keys.join(', ') || 'none'}`);

  const sid = [...new Set(recs.map((r) => r.sessionId))];
  const cwd = [...new Set(recs.map((r) => r.cwdKey).filter(Boolean))];
  console.log(`  session id: ${sid.join('/')}   cwd field: ${cwd.join('/') || 'absent'}`);

  const bad = recs.filter((r) => r.parseError);
  if (bad.length) console.log(`  ⚠ ${bad.length} payload(s) failed to parse: ${bad[0].parseError}`);
  const empty = recs.filter((r) => r.rawLength === 0);
  if (empty.length) console.log(`  ⚠ ${empty.length} event(s) delivered EMPTY stdin — hook got no payload`);
}

// The comparison that decides how many adapters host.js actually needs.
console.log(`\n\n${'='.repeat(64)}\nADAPTER IMPLICATIONS\n${'='.repeat(64)}`);
const dialects = new Map();
for (const [host, recs] of byHost) {
  // The dialect that matters is how the PAYLOAD is keyed — that is what an
  // adapter branches on. Event-name casing is a symptom, not the signal.
  const camelPayload = recs.some((r) => (r.keys || []).includes('hookEventName'));
  const d = camelPayload ? 'camelCase payload' : 'snake_case payload';
  if (!dialects.has(d)) dialects.set(d, []);
  dialects.get(d).push(host);
}
for (const [d, hosts] of dialects) console.log(`  ${d.padEnd(20)} ${hosts.join(', ')}`);
console.log(`\n  → ${dialects.size} payload dialect(s): host.js needs ${dialects.size} branch(es), not ${byHost.size}.`);

// Gotchas that only surface on the wire, never in vendor docs.
const trunc = rows.filter((r) => (r.keys || []).some((k) => /[Tt]runcated/.test(k)));
if (trunc.length) {
  console.log(`\n  ! ${[...new Set(trunc.map(hostOf))].join(', ')} sends truncation flags — content signals must check them before firing.`);
}
const noEnv = [...byHost].filter(([, rs]) => rs.every((r) => !(r.env || []).length)).map(([h]) => h);
if (noEnv.length) {
  console.log(`  ! ${noEnv.join(', ')} exposes NO identifying env var — detect by payload, not environment.`);
}
const toolNames = [...new Set(rows.map((r) => r.tool).filter(Boolean))];
if (toolNames.length > 1) {
  console.log(`  ! one write arrives under ${toolNames.length} tool names: ${toolNames.join(', ')} — normalize in host.js.`);
}
const missing = ['SubagentStart', 'subagent_start'].every(
  (e) => !rows.some((r) => String(r.event) === e));
if (missing) console.log('  ! SubagentStart never fired — subagent inheritance is UNVERIFIED.');

console.log(`\nRaw log: ${LOG}`);
