#!/usr/bin/env node
// Adapter seam — owns ALL host divergence. No other hook script may name a host.

import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {'claude' | 'codex' | 'grok'} Host */

const EVENT_CANONICAL = {
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
  UserPromptSubmit: 'user_prompt_submit',
  SubagentStart: 'subagent_start',
  PreToolUse: 'pre_tool_use',
  PostToolUse: 'post_tool_use',
  session_start: 'session_start',
  session_end: 'session_end',
  user_prompt_submit: 'user_prompt_submit',
  subagent_start: 'subagent_start',
  pre_tool_use: 'pre_tool_use',
  post_tool_use: 'post_tool_use',
};

// Output hookEventName is PascalCase on every measured host (Grok docs match Claude).
const EVENT_OUTPUT = {
  session_start: 'SessionStart',
  session_end: 'SessionEnd',
  user_prompt_submit: 'UserPromptSubmit',
  subagent_start: 'SubagentStart',
  pre_tool_use: 'PreToolUse',
  post_tool_use: 'PostToolUse',
};

/**
 * Detect host from the payload itself. Never from the environment —
 * identifying env vars are absent on one host and leak onto another.
 * @param {object} payload
 * @returns {Host}
 */
export function detect(payload) {
  if (payload && payload.hookEventName !== undefined) return 'grok';
  if (String(payload?.transcript_path || '').includes('.codex')) return 'codex';
  return 'claude';
}

/**
 * Normalize the four write-tool spellings onto one concept.
 * Never compare toolName to a literal in a signal — branch on this.
 *
 * shape:
 *   'full'     — whole-file content (Write / write)
 *   'fragment' — patch / old→new edit (Edit / apply_patch / search_replace)
 *
 * @param {string | null | undefined} toolName
 * @returns {{ isWrite: boolean, shape: 'full' | 'fragment' | null }}
 */
export function classifyWriteTool(toolName) {
  const n = String(toolName ?? '');
  // Whole-file writes
  if (n === 'Write' || n === 'write') {
    return { isWrite: true, shape: 'full' };
  }
  // Fragments. MultiEdit is Claude's batch edit; search_replace is the Grok
  // alias for Edit|Write|MultiEdit (matcher Write|Edit still matches it).
  if (
    n === 'Edit' ||
    n === 'MultiEdit' ||
    n === 'apply_patch' ||
    n === 'search_replace'
  ) {
    return { isWrite: true, shape: 'fragment' };
  }
  return { isWrite: false, shape: null };
}

/**
 * Normalize a raw host payload into a single internal shape.
 * @param {object} payload
 */
export function normalize(payload) {
  const host = detect(payload || {});
  if (host === 'grok') {
    const eventRaw = payload.hookEventName;
    const toolName = payload.toolName ?? null;
    return {
      host,
      event: EVENT_CANONICAL[eventRaw] || eventRaw || null,
      eventRaw,
      sessionId: payload.sessionId ?? null,
      cwd: payload.cwd ?? null,
      workspaceRoot: payload.workspaceRoot ?? null,
      prompt: payload.prompt ?? null,
      source: payload.source ?? null,
      toolName,
      writeTool: classifyWriteTool(toolName),
      toolInput: payload.toolInput ?? null,
      toolResult: payload.toolResult ?? null,
      toolInputTruncated: Boolean(payload.toolInputTruncated),
      toolResultTruncated: Boolean(payload.toolResultTruncated),
      transcriptPath: payload.transcriptPath ?? null,
      subagentId: payload.subagentId ?? null,
      subagentType: payload.subagentType ?? null,
      permissionMode: payload.permissionMode ?? null,
    };
  }

  const eventRaw = payload.hook_event_name;
  const toolName = payload.tool_name ?? null;
  return {
    host,
    event: EVENT_CANONICAL[eventRaw] || eventRaw || null,
    eventRaw,
    sessionId: payload.session_id ?? null,
    cwd: payload.cwd ?? null,
    workspaceRoot: null,
    prompt: payload.prompt ?? null,
    source: payload.source ?? null,
    toolName,
    writeTool: classifyWriteTool(toolName),
    toolInput: payload.tool_input ?? null,
    toolResult: payload.tool_response ?? null,
    toolInputTruncated: false,
    toolResultTruncated: false,
    transcriptPath: payload.transcript_path ?? null,
    subagentId: payload.agent_id ?? null,
    subagentType: payload.agent_type ?? null,
    permissionMode: payload.permission_mode ?? null,
  };
}

/**
 * Plugin install root. Prefer platform-provided vars; fall back to repo layout.
 */
export function pluginRoot() {
  return (
    process.env.CLAUDE_PLUGIN_ROOT ||
    process.env.PLUGIN_ROOT ||
    path.resolve(__dirname, '..')
  );
}

/**
 * Measured host facts for doctor — delivery tier and subagent inheritance.
 * Update HOSTS.md when these change. Kept here so other hook scripts stay
 * host-name-free (contract test).
 */
export const HOST_FACTS = Object.freeze({
  claude: Object.freeze({
    label: 'Claude Code',
    tier: 1,
    tierNote: 'hooks deliver additionalContext to the model',
    subagent: 'verified',
    subagentNote:
      'OFFCUT MODE banner observed on SubagentStart (2026-08-24)',
  }),
  codex: Object.freeze({
    label: 'Codex',
    tier: 1,
    tierNote: 'hooks deliver additionalContext to the model',
    subagent: 'unverified',
    subagentNote:
      'SubagentStart hook path shared; headless measure did not observe the mode banner (2026-08-25)',
  }),
  grok: Object.freeze({
    label: 'Grok Build',
    tier: 3,
    tierNote: 'hooks run but stdout/additionalContext is discarded for most events',
    subagent: 'unsupported',
    subagentNote:
      'hook stdout discarded — subagent inheritance cannot deliver via hooks',
  }),
});

/**
 * Where install.mjs writes Offcut hooks, for doctor to inspect.
 * @param {string} [home]
 */
export function installTargets(home = os.homedir()) {
  return [
    {
      host: 'claude',
      file: path.join(home, '.claude', 'settings.json'),
      requiredDir: path.join(home, '.claude'),
    },
    {
      host: 'codex',
      file: path.join(home, '.codex', 'hooks.json'),
      requiredDir: path.join(home, '.codex'),
    },
    {
      host: 'grok',
      file: path.join(home, '.grok', 'hooks', 'offcut-hooks.json'),
      requiredDir: path.join(home, '.grok'),
    },
  ];
}

/**
 * Serialize context injection for the detected host.
 * Always JSON on stdout — never plain console.log (Codex prints lifecycle to stdout).
 * @param {Host} host
 * @param {string} canonicalEvent  e.g. 'session_start'
 * @param {string} additionalContext
 */
export function emit(host, canonicalEvent, additionalContext) {
  if (!additionalContext) return null;
  const hookEventName = EVENT_OUTPUT[canonicalEvent] || canonicalEvent;
  return {
    hookSpecificOutput: {
      hookEventName,
      additionalContext,
    },
  };
}

/**
 * Map an internal gate decision to host vocabulary.
 * Phase 1 only needs context; escalate/allow live here for Phase 2.
 * @param {Host} host
 * @param {{ kind: 'context' | 'allow' | 'escalate', context?: string, reason?: string, event?: string }} decision
 */
export function gate(host, decision) {
  if (!decision || decision.kind === 'allow') return null;
  if (decision.kind === 'context') {
    return emit(host, decision.event || 'pre_tool_use', decision.context || '');
  }
  if (decision.kind === 'escalate') {
    // Measured 2026-08-24 (Grok Build session):
    //   permissionDecision "ask"     → write completed, no permission gate
    //   permissionDecision "escalate"→ write completed, no permission gate
    // Grok PreToolUse only documents decision allow|deny. Anything else is
    // ignored. Degrade escalate to additionalContext so strict mode still
    // challenges rather than silently doing nothing.
    //
    // Claude Code docs (same day): permissionDecision is allow|deny|ask|defer.
    // "ask" prompts the user. "escalate" is not a documented value. Phase 2
    // task assumed docs said escalate; they say ask. Keep ask for Claude/Codex.
    if (host === 'grok') {
      return emit(
        host,
        decision.event || 'pre_tool_use',
        decision.context || decision.reason || '',
      );
    }
    return {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'ask',
        permissionDecisionReason: decision.reason || '',
        additionalContext: decision.context || '',
      },
    };
  }
  return null;
}

/**
 * Strip a UTF-8 BOM then parse JSON. Returns null on failure.
 * @param {string} raw
 */
export function parseJson(raw) {
  try {
    const text = String(raw ?? '').replace(/^\uFEFF/, '');
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Read stdin with an end/error/timeout fallback. Never assumes stdin closes.
 * @param {number} [timeoutMs]
 * @returns {Promise<string>}
 */
export function readStdin(timeoutMs = 1500) {
  return new Promise((resolve) => {
    let input = '';
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      resolve(input);
    };
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => {
      input += c;
    });
    process.stdin.on('end', finish);
    process.stdin.on('error', finish);
    const t = setTimeout(finish, timeoutMs);
    if (typeof t.unref === 'function') t.unref();
  });
}

/**
 * Write JSON to stdout (or nothing) and exit 0. Never console.log.
 * @param {object | null | undefined} obj
 */
export function writeStdout(obj) {
  if (obj && typeof obj === 'object') {
    process.stdout.write(JSON.stringify(obj));
  }
}

/**
 * Run a hook handler under the failure contract.
 * @param {(ctx: { raw: string, payload: object | null, norm: ReturnType<typeof normalize> | null }) => object | null | Promise<object | null>} handler
 * @param {{ timeoutMs?: number, stdinTimeoutMs?: number }} [opts]
 */
export async function runHook(handler, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 5000;
  const stdinTimeoutMs = opts.stdinTimeoutMs ?? 1500;
  let exited = false;
  const safeExit = () => {
    if (exited) return;
    exited = true;
    process.exit(0);
  };
  const killer = setTimeout(safeExit, timeoutMs);
  if (typeof killer.unref === 'function') killer.unref();

  try {
    const raw = await readStdin(stdinTimeoutMs);
    const payload = parseJson(raw);
    const norm = payload ? normalize(payload) : null;
    const out = await handler({ raw, payload, norm });
    writeStdout(out);
  } catch {
    // Silent. Never block the session.
  } finally {
    clearTimeout(killer);
    safeExit();
  }
}
