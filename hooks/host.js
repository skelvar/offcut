#!/usr/bin/env node
// Adapter seam — owns ALL host divergence. No other hook script may name a host.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { claimHookDelivery } from './state.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @typedef {'claude' | 'codex' | 'cursor' | 'grok'} Host */

const EVENT_CANONICAL = {
  SessionStart: 'session_start',
  SessionEnd: 'session_end',
  UserPromptSubmit: 'user_prompt_submit',
  SubagentStart: 'subagent_start',
  PreToolUse: 'pre_tool_use',
  PostToolUse: 'post_tool_use',
  sessionStart: 'session_start',
  sessionEnd: 'session_end',
  beforeSubmitPrompt: 'user_prompt_submit',
  subagentStart: 'subagent_start',
  preToolUse: 'pre_tool_use',
  postToolUse: 'post_tool_use',
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
  if (payload && payload.cursor_version !== undefined) return 'cursor';
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
  if (host === 'cursor') {
    const eventRaw = payload.hook_event_name;
    const toolName = payload.tool_name ?? null;
    const sessionId = payload.session_id ?? payload.conversation_id ?? null;
    let deliveryId = null;
    if (eventRaw === 'beforeSubmitPrompt') deliveryId = payload.generation_id;
    else if (eventRaw === 'preToolUse' || eventRaw === 'postToolUse') {
      deliveryId = payload.tool_use_id;
    } else if (eventRaw === 'subagentStart') {
      deliveryId = payload.subagent_id ?? payload.tool_call_id;
    } else if (eventRaw === 'sessionStart' || eventRaw === 'sessionEnd') {
      // Common Cursor input includes a generation id. Unlike the session id it
      // changes when the same conversation resumes, so immutable delivery
      // claims suppress duplicate sources without stale-lock takeover races.
      deliveryId = payload.generation_id ?? sessionId;
    }
    return {
      host,
      event: EVENT_CANONICAL[eventRaw] || eventRaw || null,
      eventRaw,
      sessionId,
      generationId: payload.generation_id ?? null,
      toolUseId: payload.tool_use_id ?? payload.tool_call_id ?? null,
      deliveryKey:
        deliveryId == null
          ? null
          : `cursor-${eventRaw}-${sessionId || 'session'}-${deliveryId}`,
      cwd: payload.cwd ?? null,
      workspaceRoot: payload.workspace_roots?.[0] ?? null,
      prompt: payload.prompt ?? null,
      source: payload.source ?? null,
      toolName,
      writeTool: classifyWriteTool(toolName),
      toolInput: payload.tool_input ?? null,
      toolResult: payload.tool_output ?? null,
      toolInputTruncated: false,
      toolResultTruncated: false,
      transcriptPath: payload.transcript_path ?? null,
      subagentId: payload.subagent_id ?? null,
      subagentType: payload.subagent_type ?? null,
      permissionMode: payload.permission_mode ?? null,
    };
  }

  if (host === 'grok') {
    const eventRaw = payload.hookEventName;
    const toolName = payload.toolName ?? null;
    return {
      host,
      event: EVENT_CANONICAL[eventRaw] || eventRaw || null,
      eventRaw,
      sessionId: payload.sessionId ?? null,
      generationId: payload.generationId ?? null,
      toolUseId: payload.toolUseId ?? null,
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
    generationId: payload.generation_id ?? payload.turn_id ?? null,
    toolUseId: payload.tool_use_id ?? null,
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
    process.env.CURSOR_PLUGIN_ROOT ||
    process.env.CLAUDE_PLUGIN_ROOT ||
    process.env.PLUGIN_ROOT ||
    path.resolve(__dirname, '..')
  );
}

/**
 * Measured host facts for doctor — delivery tier and subagent inheritance.
 * Update docs/development/HOSTS.md when these change. Kept here so other hook scripts stay
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
    subagent: 'verified',
    subagentNote:
      'Codex subagent reported FOUND_OFFCUT with hooks installed (2026-08-25). '
      + 'Delivery confirmed; SubagentStart-vs-inherited-parent-context not isolated',
  }),
  cursor: Object.freeze({
    label: 'Cursor',
    tier: 1,
    tierNote:
      'hooks deliver additional_context; strict dependency approval degrades to context',
    subagent: 'verified',
    subagentNote:
      'preToolUse Subagent input rewrite delivered the OFFCUT MODE banner (2026-08-27)',
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
      host: 'cursor',
      file: path.join(home, '.cursor', 'hooks.json'),
      requiredDir: path.join(home, '.cursor'),
    },
    {
      host: 'grok',
      file: path.join(home, '.grok', 'hooks', 'offcut-hooks.json'),
      requiredDir: path.join(home, '.grok'),
    },
  ];
}

/**
 * Host-managed installs that do not appear in user hook settings.
 * @param {string} [home]
 * @returns {{ host: Host, file: string, config: object, managed: true, root: string }[]}
 */
export function managedInstallTargets(home = os.homedir()) {
  const local = path.join(home, '.cursor', 'plugins', 'local');
  const found = [];
  let names;
  try {
    names = fs.readdirSync(local);
  } catch {
    return found;
  }

  for (const name of names) {
    const root = path.join(local, name);
    try {
      if (!fs.statSync(root).isDirectory()) continue;
      const file = path.join(root, '.cursor-plugin', 'plugin.json');
      const manifest = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, ''));
      if (manifest?.name !== 'offcut' || typeof manifest.hooks !== 'string') continue;
      const configFile = path.resolve(root, manifest.hooks);
      const rel = path.relative(root, configFile);
      if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
      const config = JSON.parse(fs.readFileSync(configFile, 'utf8').replace(/^\uFEFF/, ''));
      if (!config?.hooks || typeof config.hooks !== 'object') continue;
      found.push({ host: 'cursor', file, config, managed: true, root });
    } catch {
      // One malformed local plugin must not hide other valid installs.
    }
  }
  return found;
}

/**
 * Resolve a script reference using the owning host's managed-plugin root.
 * User hook installs have no root here because Offcut writes absolute paths.
 * @param {{ host?: Host, root?: string }} install
 * @param {string} script
 */
export function resolveInstalledScript(install, script) {
  let resolved = String(script || '');
  if (!install?.root) return resolved;
  if (install.host === 'cursor') {
    resolved = resolved
      .replaceAll('${CURSOR_PLUGIN_ROOT}', install.root)
      .replaceAll('${CLAUDE_PLUGIN_ROOT}', install.root);
  }
  if (!resolved.includes('${') && !path.isAbsolute(resolved)) {
    resolved = path.resolve(install.root, resolved);
  }
  return resolved;
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
  if (host === 'cursor') {
    return { additional_context: additionalContext };
  }
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
 * @param {{ kind: 'context' | 'allow' | 'escalate' | 'rewrite', context?: string, reason?: string, event?: string, input?: object }} decision
 */
export function gate(host, decision) {
  if (!decision || decision.kind === 'allow') return null;
  if (decision.kind === 'rewrite') {
    if (
      host !== 'cursor' ||
      !decision.input ||
      typeof decision.input !== 'object' ||
      Array.isArray(decision.input)
    ) {
      return null;
    }
    return {
      updated_input: decision.input,
    };
  }
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
    if (host === 'cursor' || host === 'grok') {
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
    if (norm?.deliveryKey && !claimHookDelivery(norm.deliveryKey)) return;
    const out = await handler({ raw, payload, norm });
    writeStdout(out);
  } catch {
    // Silent. Never block the session.
  } finally {
    clearTimeout(killer);
    safeExit();
  }
}
