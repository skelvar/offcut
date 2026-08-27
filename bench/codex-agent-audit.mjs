#!/usr/bin/env node

import fs from 'node:fs';

const ATTRIBUTION_FIELDS = Object.freeze([
  'hook_event_name',
  'session_id',
  'turn_id',
  'agent_id',
  'agent_type',
  'tool_name',
  'tool_use_id',
  'success',
  'stop_reason',
  'stop_hook_active',
]);

/**
 * Keep only primitive lifecycle attribution. Tool input, transcript paths, and
 * model output are intentionally unreachable from the returned record.
 */
export function sanitizeAuditPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('malformed hook JSON');
  }
  const record = {};
  for (const field of ATTRIBUTION_FIELDS) {
    const value = payload[field];
    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      record[field] = value;
    }
  }
  return record;
}

function main() {
  try {
    const auditPath = process.env.OFFCUT_AGENT_AUDIT_PATH;
    if (!auditPath) throw new Error('missing audit path');
    const payload = JSON.parse(fs.readFileSync(0, 'utf8'));
    const record = sanitizeAuditPayload(payload);
    fs.appendFileSync(auditPath, `${JSON.stringify(record)}\n`, 'utf8');
  } catch {
    process.stderr.write('codex-agent-audit: invalid audit configuration or payload\n');
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.filename === process.argv[1]) main();
