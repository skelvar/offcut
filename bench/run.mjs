#!/usr/bin/env node
// Run one bench task under one arm. Captures diff + transcript into an opaque dir.
//
//   node bench/run.mjs --task config-fallback --arm off --rep 1 --stub lean
//   node bench/run.mjs --task config-fallback --arm full --rep 1
//
// Paid mode invokes the selected host. Dry-run --stub avoids model cost.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  BENCH_ROOT,
  MODEL_ID,
  RUNS_DIR,
  appendManifest,
  assertEmptyDir,
  buildHooksSettings,
  captureDiff,
  copyTree,
  initGitRepo,
  justifyArmConfig,
  loadTask,
  opaqueId,
  sha256,
  tmpName,
  writeArmOverrides,
  writeMode,
  writeStyle,
} from './lib.mjs';
import { scoreRun } from './score.mjs';
import { hookCommand, MANAGED_START, MANAGED_END } from '../tools/install.mjs';

const LEGACY_ARMS = new Set(['off', 'full']);
const JUSTIFY_ARMS = new Set(['off', 'cheap', 'justify']);

// Reasoning effort for paid runs. Named so the manifest can record it.
const RUN_EFFORT = 'low';
export const DEFAULT_API_RETRIES = 2;
export const CODEX_BACKEND_ID = 'codex-profile-v1';
export const CODEX_HOST = 'codex-cli';
export const CODEX_HOST_VERSION = '0.149.1';
export const CODEX_MODEL_ID = 'gpt-5.6-sol';
export const CODEX_CUSTOM_AGENT_NAME = 'ticket-worker';
export const CODEX_CUSTOM_AGENT_KIND = 'named_top_level_profile';
export const CODEX_APPROVAL_MODE = 'automatic_review';
export const CODEX_EFFECTIVE_SANDBOX = 'workspace-write (approve-for-me)';
export const CODEX_PROFILE_INSTRUCTIONS =
  'Implement the delegated maintenance ticket in the current repository. Inspect the files, make the changes required by the ticket, and run relevant checks. Do not commit or edit .codex. Return a concise summary.';

function parseArgs(argv) {
  const out = {
    task: null,
    arm: null,
    rep: 1,
    stub: null,
    model: MODEL_ID,
    keepWork: false,
    maxBudgetUsd: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i];
    else if (a === '--arm') out.arm = argv[++i];
    else if (a === '--rep') out.rep = Number(argv[++i]);
    else if (a === '--stub') out.stub = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--max-budget-usd') out.maxBudgetUsd = Number(argv[++i]);
    else if (a === '--keep-work') out.keepWork = true;
    else if (a === '--help') out.help = true;
  }
  return out;
}

function runAccept(acceptPath, workDir) {
  const r = spawnSync(process.execPath, [acceptPath, workDir], {
    encoding: 'utf8',
    cwd: workDir,
    env: { ...process.env },
  });
  return {
    ok: r.status === 0,
    exitCode: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.status === 0 ? null : (r.stderr || r.stdout || `exit ${r.status}`).trim(),
  };
}

function runStub(taskId, style, workDir) {
  const stub = path.join(BENCH_ROOT, 'stub-agent.mjs');
  const r = spawnSync(
    process.execPath,
    [stub, '--task', taskId, '--style', style, '--cwd', workDir],
    { encoding: 'utf8', cwd: workDir },
  );
  return {
    ok: r.status === 0,
    exitCode: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    transcript: (r.stdout || '') + (r.stderr || ''),
  };
}

function numberFrom(...values) {
  return values.find((value) => typeof value === 'number' && Number.isFinite(value)) ?? null;
}

export function extractClaudeTelemetry(parsed) {
  const usage = parsed?.usage || {};
  return {
    total_cost_usd: numberFrom(parsed?.total_cost_usd, parsed?.totalCostUsd),
    duration_ms: numberFrom(parsed?.duration_ms, parsed?.durationMs),
    input_tokens: numberFrom(usage.input_tokens, usage.inputTokens),
    output_tokens: numberFrom(usage.output_tokens, usage.outputTokens),
    cache_read_input_tokens: numberFrom(
      usage.cache_read_input_tokens,
      usage.cacheReadInputTokens,
    ),
    cache_creation_input_tokens: numberFrom(
      usage.cache_creation_input_tokens,
      usage.cacheCreationInputTokens,
    ),
  };
}

export function classifyAgentFailure(agent) {
  if (agent?.ok) return null;
  if (['api', 'host', 'model'].includes(agent?.failureKind)) {
    return agent.failureKind;
  }
  if (agent?.apiError) return 'api';
  if (agent?.spawnError || agent?.timedOut) return 'host';
  return 'model';
}

export function resolveApiRetries(opts) {
  return opts.apiRetries ?? DEFAULT_API_RETRIES;
}

export function parseClaudeResult(stdout, status, spawnErr) {
  let parsed = null;
  let modelId = null;
  try {
    parsed = JSON.parse(stdout || '{}');
    const usage = parsed.modelUsage || {};
    const keys = Object.keys(usage);
    if (keys.length) modelId = keys[0];
    else if (parsed.model) modelId = parsed.model;
  } catch {
    // keep raw
  }
  const resultText = parsed && typeof parsed.result === 'string' ? parsed.result : '';
  const apiStatus = parsed && parsed.api_error_status;
  const apiError =
    (parsed && parsed.terminal_reason === 'api_error') ||
    (typeof apiStatus === 'number' && apiStatus >= 400) ||
    /session limit|hit your.*limit|rate limit|overloaded/i.test(resultText);
  const ok = status === 0 && !(parsed && parsed.is_error);
  const telemetry = extractClaudeTelemetry(parsed);
  const preCallSpawnCodes = new Set(['ENOENT', 'EACCES']);
  const knownPreCallFailure =
    status == null &&
    preCallSpawnCodes.has(spawnErr?.code) &&
    !(stdout || '').trim();
  const costEvidence = Number.isFinite(telemetry.total_cost_usd)
    ? { kind: 'telemetry', source: 'claude_json' }
    : knownPreCallFailure
      ? { kind: 'known_zero', source: `spawn_error:${spawnErr.code}` }
      : {
          kind: 'call_started',
          source: spawnErr?.code === 'ETIMEDOUT' ? 'spawn_timeout' : 'missing_telemetry',
        };
  return {
    ok,
    exitCode: status,
    stdout: stdout || '',
    stderr: '',
    transcript: stdout || '',
    modelId,
    parsed,
    apiError: Boolean(apiError),
    spawnError: Boolean(spawnErr),
    timedOut: Boolean(spawnErr?.code === 'ETIMEDOUT'),
    telemetry,
    cost_evidence: costEvidence,
    error:
      spawnErr?.message ||
      (apiError
        ? resultText || `api_error status=${parsed?.api_error_status || status}`
        : !ok
          ? resultText || `claude exit ${status}`
          : null),
  };
}

export function buildClaudeArgs({ prompt, model, settingsPath, maxBudgetUsd = null }) {
  const args = [
    '-p',
    prompt,
    '--model',
    model,
    '--effort',
    RUN_EFFORT,
    '--permission-mode',
    'bypassPermissions',
    '--output-format',
    'json',
    '--settings',
    settingsPath,
  ];
  if (typeof maxBudgetUsd === 'number' && Number.isFinite(maxBudgetUsd)) {
    args.push('--max-budget-usd', String(maxBudgetUsd));
  }
  return args;
}

export function buildCodexArgs({ workDir, prompt }) {
  return [
    '--approve-for-me',
    '--dangerously-bypass-hook-trust',
    '--profile',
    CODEX_CUSTOM_AGENT_NAME,
    '-C',
    workDir,
    'exec',
    '--json',
    '--ephemeral',
    prompt,
  ];
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

function codexConfigText() {
  return [
    'default_permissions = ":workspace"',
    '[skills]',
    'include_instructions = false',
    '',
    '[features]',
    'multi_agent = false',
    'hooks = true',
    '',
  ].join('\n');
}

function codexProfileText(instructions = CODEX_PROFILE_INSTRUCTIONS) {
  return [
    'default_permissions = ":workspace"',
    `model = ${tomlString(CODEX_MODEL_ID)}`,
    'model_reasoning_effort = "low"',
    `developer_instructions = ${tomlString(instructions)}`,
    '',
  ].join('\n');
}

function auditHookGroup() {
  return {
    hooks: [
      {
        type: 'command',
        command: hookCommand(path.join(BENCH_ROOT, 'codex-agent-audit.mjs').replace(/\\/g, '/')),
        timeout: 5,
        statusMessage: 'agent-audit',
      },
    ],
  };
}

export function buildCodexHooksSettings(arm) {
  const settings = arm === 'full' ? buildHooksSettings() : { hooks: {} };
  const auditEvents = {
    SubagentStart: auditHookGroup(),
    SubagentStop: auditHookGroup(),
    PreToolUse: auditHookGroup(),
    PostToolUse: auditHookGroup(),
  };
  for (const [event, group] of Object.entries(auditEvents)) {
    settings.hooks[event] = [...(settings.hooks[event] || []), group];
  }
  return settings;
}

export function prepareCodexHome({
  arm,
  authPath = path.join(os.homedir(), '.codex', 'auth.json'),
  parentDir = os.tmpdir(),
  profileInstructions = CODEX_PROFILE_INSTRUCTIONS,
  nativeInstructions = null,
}) {
  if (arm !== 'off' && arm !== 'full') throw new Error(`bad Codex efficacy arm: ${arm}`);
  if (!fs.existsSync(authPath)) throw new Error('Codex auth file missing');
  fs.mkdirSync(parentDir, { recursive: true });
  const homeDir = fs.mkdtempSync(path.join(parentDir, 'offcut-codex-home-'));
  try {
    fs.copyFileSync(authPath, path.join(homeDir, 'auth.json'));
    const config = codexConfigText();
    const profileConfig = codexProfileText(profileInstructions);
    const hooks = buildCodexHooksSettings(arm);
    fs.writeFileSync(path.join(homeDir, 'config.toml'), config, 'utf8');
    fs.writeFileSync(
      path.join(homeDir, `${CODEX_CUSTOM_AGENT_NAME}.config.toml`),
      profileConfig,
      'utf8',
    );
    fs.writeFileSync(path.join(homeDir, 'hooks.json'), `${JSON.stringify(hooks, null, 2)}\n`, 'utf8');
    let nativeInstructionsSha256 = null;
    if (typeof nativeInstructions === 'string' && nativeInstructions.trim()) {
      const nativeText = `${MANAGED_START}\n${nativeInstructions.trim()}\n${MANAGED_END}\n`;
      fs.writeFileSync(path.join(homeDir, 'AGENTS.md'), nativeText, 'utf8');
      nativeInstructionsSha256 = sha256(nativeInstructions.trim());
    }
    return {
      homeDir,
      config_sha256: sha256(config),
      profile_config_sha256: sha256(profileConfig),
      role_sha256: null,
      hooks_sha256: sha256(`${JSON.stringify(hooks, null, 2)}\n`),
      native_instructions_sha256: nativeInstructionsSha256,
    };
  } catch (error) {
    cleanupCodexHome(homeDir);
    throw error;
  }
}

export function cleanupCodexHome(homeDir, fsImpl = fs) {
  if (!homeDir) return;
  const options = {
    recursive: true,
    force: true,
    maxRetries: 4,
    retryDelay: 100,
  };
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      fsImpl.rmSync(homeDir, options);
    } catch {
      if (attempt === 2) {
        throw new Error('temporary CODEX_HOME cleanup failed');
      }
      continue;
    }
    if (!fsImpl.existsSync(homeDir)) return;
  }
  throw new Error('temporary CODEX_HOME cleanup failed');
}

function aggregateCodexUsage(events) {
  const turns = events.filter((event) => event?.type === 'turn.completed');
  const keys = [
    'input_tokens',
    'cached_input_tokens',
    'cache_write_input_tokens',
    'output_tokens',
    'reasoning_output_tokens',
  ];
  const valid =
    turns.length > 0 &&
    turns.every(
      (event) =>
        event?.usage &&
        keys.every(
          (key) =>
            Number.isFinite(event.usage[key]) &&
            event.usage[key] >= 0,
        ),
    );
  if (!valid) return null;
  return Object.fromEntries(
    keys.map((key) => [
      key,
      turns.reduce((sum, event) => sum + event.usage[key], 0),
    ]),
  );
}

function observedCodexModel(events) {
  for (const event of events) {
    for (const value of [
      event?.model,
      event?.model_id,
      event?.item?.model,
      event?.response?.model,
    ]) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }
  }
  return null;
}

function canonicalCodexOrchestrationTool(toolName) {
  const normalized =
    typeof toolName === 'string'
      ? toolName.toLowerCase().replace(/[^a-z0-9]/g, '')
      : '';
  if (
    normalized === 'spawnagent' ||
    normalized === 'multiagentv1spawnagent' ||
    normalized === 'collaborationspawnagent'
  ) {
    return 'spawn_agent';
  }
  if (
    normalized === 'wait' ||
    normalized === 'waitagent' ||
    normalized === 'multiagentv1waitagent' ||
    normalized === 'collaborationwaitagent'
  ) {
    return 'wait';
  }
  if (
    normalized === 'closeagent' ||
    normalized === 'multiagentv1closeagent' ||
    normalized === 'collaborationcloseagent'
  ) {
    return 'close_agent';
  }
  if (
    normalized === 'sendinput' ||
    normalized === 'multiagentv1sendinput' ||
    normalized === 'collaborationsendinput'
  ) {
    return 'send_input';
  }
  return null;
}

const CODEX_HOOK_TRUST_WARNING =
  '`--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without review for this invocation.';

export function isExpectedCodexCliWarning(message) {
  const text = String(message || '').trim();
  return (
    text === CODEX_HOOK_TRUST_WARNING ||
    /^clamping SessionEnd hook timeout to \d+s in /i.test(text) ||
    /^WARNING: proceeding, even though we could not create PATH aliases:/i.test(text)
  );
}

export function classifyCodexEventFailures(events) {
  const isExpectedCliWarningEvent = (event) =>
    event?.type === 'item.completed' &&
    event?.item?.type === 'error' &&
    isExpectedCodexCliWarning(event?.item?.message);
  const collaborationEvent = events.some(
    (event) =>
      event?.item?.type === 'collab_tool_call' ||
      canonicalCodexOrchestrationTool(event?.item?.tool) !== null ||
      /(?:collab|spawn_agent|subagent)/i.test(String(event?.type || '')),
  );
  const recoverableEvents = events.filter((event) => {
    const itemType = String(event?.item?.type || '');
    return (
      event?.type === 'item.completed' &&
      event?.item?.status === 'failed' &&
      (itemType === 'command_execution' ||
        itemType === 'file_change' ||
        /tool(?:_call)?$/i.test(itemType)) &&
      itemType !== 'collab_tool_call'
    );
  });
  const recoverableEventSet = new Set(recoverableEvents);
  const unrecoverable = events.some((event) => {
    if (isExpectedCliWarningEvent(event) || recoverableEventSet.has(event)) return false;
    return (
      /(?:^|[._])(?:error|failed)$/i.test(String(event?.type || '')) ||
      event?.item?.type === 'error' ||
      event?.status === 'failed' ||
      event?.item?.status === 'failed' ||
      collaborationEvent
    );
  });
  return {
    warningCount: events.filter(isExpectedCliWarningEvent).length,
    unrecoverable,
    recoverableToolFailures: recoverableEvents.map((event) => ({
      item_id: typeof event.item.id === 'string' ? event.item.id : null,
      item_type: event.item.type,
      status: event.item.status,
      ...(Number.isFinite(event.item.exit_code)
        ? { exit_code: event.item.exit_code }
        : {}),
    })),
  };
}

function normalizedEvidencePath(value, caseInsensitive) {
  const normalized =
    String(value || '')
      .replace(/\\+/g, '/')
      .replace(/\/+/g, '/');
  return caseInsensitive ? normalized.toLowerCase() : normalized;
}

export function codexUserHomeFromAuthPath(authPath) {
  const normalized = normalizedEvidencePath(authPath, false).replace(/\/$/, '');
  const windows = /^[a-z]:\//i.test(normalized);
  if (!windows && !normalized.startsWith('/')) return null;
  const fileSeparator = normalized.lastIndexOf('/');
  if (fileSeparator <= 0) return null;
  const authParent = normalized.slice(0, fileSeparator);
  const parentSeparator = authParent.lastIndexOf('/');
  if (parentSeparator < 0) return null;
  const parentName = authParent.slice(parentSeparator + 1);
  if ((windows ? parentName.toLowerCase() : parentName) !== '.codex') {
    return null;
  }
  return authParent.slice(0, parentSeparator) || '/';
}

export function codexUserAssetsIsolated(text, options) {
  const { userHome, workDir, isolatedHomeDir } = options || {};
  const windows = /^[a-z]:[\\/]/i.test(String(userHome || ''));
  const normalizedHome = normalizedEvidencePath(userHome, windows).replace(
    /\/$/,
    '',
  );
  if (!normalizedHome) return true;
  const normalized = normalizedEvidencePath(text, windows);
  const allowedRoots = [workDir, isolatedHomeDir]
    .map((root) =>
      normalizedEvidencePath(root, windows).replace(/\/$/, ''),
    )
    .filter(Boolean);
  for (const suffix of ['/.agents/skills', '/.codex/skills']) {
    const target = `${normalizedHome}${suffix}`;
    let index = normalized.indexOf(target);
    while (index >= 0) {
      const before = normalized[index - 1];
      const after = normalized[index + target.length];
      const boundedBefore = index === 0 || /[\s"'`(<>=]/.test(before);
      const boundedAfter = after === undefined || /[\/\s"'`),.;:<>}]/.test(after);
      const allowed = allowedRoots.some(
        (root) =>
          normalized.startsWith(root, index) &&
          /^(?:$|\/)/.test(normalized.slice(index + root.length)),
      );
      if (boundedBefore && boundedAfter && !allowed) return false;
      index = normalized.indexOf(target, index + target.length);
    }
  }
  return true;
}

export function verifyCodexAgentAudit(entries) {
  if (
    entries.some(
      (entry) =>
        entry?.hook_event_name === 'SubagentStart' ||
        entry?.hook_event_name === 'SubagentStop',
    )
  ) {
    return { ok: false };
  }
  const toolEvents = entries.filter(
    (entry) =>
      (entry?.hook_event_name === 'PreToolUse' ||
        entry?.hook_event_name === 'PostToolUse'),
  );
  const toolCalls = new Map();
  for (const entry of toolEvents) {
    const normalizedTool = String(entry.tool_name || '')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '');
    if (
      typeof entry.tool_use_id !== 'string' ||
      !entry.tool_use_id ||
      !normalizedTool ||
      entry.agent_id !== undefined ||
      entry.agent_type !== undefined ||
      canonicalCodexOrchestrationTool(entry.tool_name) ||
      /^(?:collaboration|multiagent)/.test(normalizedTool) ||
      (entry.hook_event_name === 'PostToolUse' && entry.success === false)
    ) {
      return { ok: false };
    }
    const identity = {
      tool: String(entry.tool_name || ''),
      phases: new Map([[entry.hook_event_name, 1]]),
    };
    const prior = toolCalls.get(entry.tool_use_id);
    if (
      prior &&
      prior.tool.toLowerCase() !== identity.tool.toLowerCase()
    ) {
      return { ok: false };
    }
    if (prior) {
      prior.phases.set(
        entry.hook_event_name,
        (prior.phases.get(entry.hook_event_name) || 0) + 1,
      );
    } else {
      toolCalls.set(entry.tool_use_id, identity);
    }
  }
  let rejectedToolCount = 0;
  let rootCompletedToolCount = 0;
  let rootCompletedWriteToolCount = 0;
  const writeTools = new Set(['applypatch', 'write', 'edit', 'searchreplace']);
  for (const identity of toolCalls.values()) {
    const pre = identity.phases.get('PreToolUse') || 0;
    const post = identity.phases.get('PostToolUse') || 0;
    if (pre !== 1 || post > 1) return { ok: false };
    if (post === 0) {
      rejectedToolCount += 1;
      continue;
    }
    rootCompletedToolCount += 1;
    const normalizedTool = identity.tool.toLowerCase().replace(/[^a-z0-9]/g, '');
    if (writeTools.has(normalizedTool)) rootCompletedWriteToolCount += 1;
  }
  // offcut: cap rejected root attempts; raise only if valid maintenance runs exceed it.
  if (rejectedToolCount > 8) return { ok: false };
  return {
    ok: true,
    rootCompletedToolCount,
    rootCompletedWriteToolCount,
    rejectedToolCount,
  };
}

export function parseCodexJsonl(
  stdout,
  status,
  spawnErr,
  {
    durationMs,
    authKind = null,
    auditEntries = [],
    stderr = '',
    userHome = null,
    workDir = null,
    isolatedHomeDir = null,
  } = {},
) {
  const events = [];
  for (const line of String(stdout || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      // Preserve malformed lines in the raw transcript; they cannot prove success.
    }
  }
  const eventMessages = events.map(
    (event) =>
      event?.message ||
      event?.error?.message ||
      event?.item?.message ||
      '',
  );
  const text = [
    stdout || '',
    stderr || '',
    spawnErr?.message || '',
    ...eventMessages,
  ].join('\n');
  const diagnostic = [stderr || '', spawnErr?.message || '', ...eventMessages]
    .filter(Boolean)
    .join('\n')
    .replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_048);
  const apiErrorCorpus = [
    ...String(stderr || '')
      .split(/\r?\n/)
      .filter((line) => line.trim() && !isExpectedCodexCliWarning(line)),
    spawnErr?.message || '',
    ...eventMessages.filter((message) => !isExpectedCodexCliWarning(message)),
  ]
    .filter(Boolean)
    .join('\n');
  const apiError =
    /(?:rate limit|too many requests|quota|authentication|unauthorized|forbidden|api key|subscription|\b429\b|\b5\d\d\b)/i.test(
      apiErrorCorpus,
    );
  const preCallSpawnCodes = new Set(['ENOENT', 'EACCES']);
  const knownPreCallFailure =
    status == null &&
    preCallSpawnCodes.has(spawnErr?.code) &&
    !String(stdout || '').trim();
  const callStarted = status != null;
  const lifecycleStarted = events.some(
    (event) =>
      event?.type === 'thread.started' ||
      event?.type === 'turn.started',
  );
  const inferenceStarted =
    lifecycleStarted ||
    events.some((event) => event?.type === 'turn.completed');
  const immediateHostFailure =
    callStarted && status !== 0 && !lifecycleStarted;
  const attribution = verifyCodexAgentAudit(auditEntries);
  const customAgentVerified = attribution.ok;
  const eventFailures = classifyCodexEventFailures(events);
  const warningCount = eventFailures.warningCount;
  const unrecoverableEventError = eventFailures.unrecoverable;
  const parentTurnVerified = events.some(
    (event) => event?.type === 'turn.started',
  );
  const usage = aggregateCodexUsage(events);
  const modelId = observedCodexModel(events);
  const subscriptionVerified = authKind === 'chatgpt';
  const userAssetsIsolated = codexUserAssetsIsolated(text, {
    userHome,
    workDir,
    isolatedHomeDir,
  });
  const recoveryEligible =
    status === 0 &&
    !unrecoverableEventError &&
    userAssetsIsolated &&
    customAgentVerified &&
    parentTurnVerified &&
    usage !== null &&
    subscriptionVerified;
  const recoverableToolFailures = recoveryEligible
    ? eventFailures.recoverableToolFailures
    : [];
  const eventError =
    unrecoverableEventError ||
    (eventFailures.recoverableToolFailures.length > 0 && !recoveryEligible);
  const ok =
    status === 0 &&
    !eventError &&
    userAssetsIsolated &&
    customAgentVerified &&
    parentTurnVerified &&
    usage !== null &&
    subscriptionVerified;
  return {
    ok,
    exitCode: status,
    stdout: stdout || '',
    stderr: stderr || '',
    transcript: stdout || '',
    parsed: events,
    modelId,
    modelObservation: modelId ? 'reported_by_codex' : 'requested_not_reported',
    authKind: subscriptionVerified ? 'chatgpt' : null,
    apiError,
    spawnError: Boolean(spawnErr),
    processStarted: callStarted,
    inferenceStarted,
    warningCount,
    userAssetsIsolated,
    timedOut: Boolean(spawnErr?.code === 'ETIMEDOUT'),
    customAgentVerified,
    rootCompletedToolCount: attribution.rootCompletedToolCount || 0,
    rootCompletedWriteToolCount: attribution.rootCompletedWriteToolCount || 0,
    modelTurnCount: events.filter((event) => event?.type === 'turn.completed').length,
    recoverableToolFailures,
    recoverableToolFailureCount: recoverableToolFailures.length,
    failureKind:
      ok
        ? null
        : apiError
          ? 'api'
          : spawnErr || immediateHostFailure
            ? 'host'
            : 'model',
    telemetry: {
      total_cost_usd: callStarted && subscriptionVerified ? 0 : null,
      duration_ms: durationMs,
      input_tokens: usage?.input_tokens ?? null,
      output_tokens: usage?.output_tokens ?? null,
      cache_read_input_tokens: usage?.cached_input_tokens ?? null,
      cache_creation_input_tokens: usage?.cache_write_input_tokens ?? null,
      reasoning_output_tokens: usage?.reasoning_output_tokens ?? null,
    },
    cost_evidence: callStarted && inferenceStarted && subscriptionVerified
      ? { kind: 'subscription', source: 'codex_chatgpt' }
      : callStarted && !inferenceStarted && subscriptionVerified
        ? { kind: 'known_zero', source: 'pre_inference_cli_failure' }
      : knownPreCallFailure
        ? { kind: 'known_zero', source: `spawn_error:${spawnErr.code}` }
        : { kind: 'call_not_started', source: 'unknown_spawn_failure' },
    error:
      spawnErr
        ? diagnostic || 'Codex process failed to start'
        : apiError
        ? diagnostic || `Codex API failure (exit ${status})`
        : immediateHostFailure
          ? diagnostic || `codex exit ${status} before thread start`
        : !subscriptionVerified && callStarted
          ? 'Codex ChatGPT authentication was not verified'
          : usage === null && callStarted
            ? 'Codex turn usage missing or malformed'
            : !userAssetsIsolated
              ? 'Codex referenced external user agent or skill assets'
              : !customAgentVerified
                ? 'Codex did not prove top-level profile ownership'
                : eventError || status !== 0
                  ? diagnostic || `codex exit ${status}`
                  : null,
  };
}

const PROVIDER_OVERRIDE_ENV =
  /(?:API_KEY|BASE_URL|API_BASE|PROVIDER|ENDPOINT)$/i;
const AGENT_ASSET_OVERRIDE_ENV =
  /(?:^|_)(?:AGENT|AGENTS|SKILL|SKILLS)(?:_HOME|_DIR|_PATH)$/i;

export function buildIsolatedCodexEnv({
  homeDir,
  stateDir,
  auditPath,
  envSource = process.env,
}) {
  const env = { ...envSource };
  for (const key of Object.keys(env)) {
    if (
      PROVIDER_OVERRIDE_ENV.test(key) ||
      AGENT_ASSET_OVERRIDE_ENV.test(key)
    ) {
      delete env[key];
    }
  }
  const isolatedUserHome = path.join(homeDir, 'user-home');
  fs.mkdirSync(isolatedUserHome, { recursive: true });
  env.HOME = isolatedUserHome;
  env.USERPROFILE = isolatedUserHome;
  env.CODEX_HOME = homeDir;
  env.OFFCUT_STATE_DIR = stateDir;
  env.OFFCUT_AGENT_AUDIT_PATH = auditPath;
  return env;
}

export function verifyCodexChatGptLogin(spawnCodex, options) {
  const result = spawnCodex('codex', ['login', 'status'], {
    ...options,
    timeout: 30_000,
  });
  const statusLines = `${result.stdout || ''}\n${result.stderr || ''}`
    .split(/\r?\n/)
    .map((line) => line.trim());
  return {
    ok:
      result.status === 0 &&
      statusLines.includes('Logged in using ChatGPT'),
    spawnError: result.error || null,
  };
}

function readCodexAudit(auditPath) {
  if (!fs.existsSync(auditPath)) return [];
  try {
    return fs
      .readFileSync(auditPath, 'utf8')
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

export function runCodex({
  workDir,
  prompt,
  arm,
  stateDir,
  authPath,
  homeParentDir,
  auditPath,
  spawnCodex = spawnSync,
  now = () => performance.now(),
  envSource = process.env,
  profileInstructions = CODEX_PROFILE_INSTRUCTIONS,
  nativeInstructions = null,
}) {
  const isolated = prepareCodexHome({
    arm,
    authPath,
    parentDir: homeParentDir,
    profileInstructions,
    nativeInstructions,
  });
  const args = buildCodexArgs({ workDir, prompt });
  const resolvedAuditPath =
    auditPath || path.join(isolated.homeDir, 'agent-audit.jsonl');
  const env = buildIsolatedCodexEnv({
    homeDir: isolated.homeDir,
    stateDir,
    auditPath: resolvedAuditPath,
    envSource,
  });
  const commonOptions = {
    cwd: workDir,
    encoding: 'utf8',
    env,
    maxBuffer: 32 * 1024 * 1024,
  };
  const attachHashes = (result) => Object.assign(result, {
    prompt_sha256: sha256(prompt),
    config_sha256: isolated.config_sha256,
    profile_config_sha256: isolated.profile_config_sha256,
    role_sha256: isolated.role_sha256,
    hooks_sha256: isolated.hooks_sha256,
    native_instructions_sha256: isolated.native_instructions_sha256,
  });
  try {
    const login = verifyCodexChatGptLogin(spawnCodex, commonOptions);
    if (!login.ok) {
      return attachHashes({
        ok: false,
        exitCode: login.spawnError ? null : 1,
        stdout: '',
        stderr: '',
        transcript: '',
        parsed: [],
        modelId: null,
        modelObservation: 'requested_not_reported',
        authKind: null,
        apiError: !login.spawnError,
        spawnError: Boolean(login.spawnError),
        processStarted: false,
        inferenceStarted: false,
        timedOut: false,
        customAgentVerified: false,
        userAssetsIsolated: true,
        rootCompletedToolCount: 0,
        rootCompletedWriteToolCount: 0,
        failureKind: login.spawnError ? 'host' : 'api',
        telemetry: {
          total_cost_usd: null,
          duration_ms: null,
          input_tokens: null,
          output_tokens: null,
          cache_read_input_tokens: null,
          cache_creation_input_tokens: null,
          reasoning_output_tokens: null,
        },
        cost_evidence: {
          kind: 'known_zero',
          source: 'login_status_pre_call',
        },
        error: 'Codex ChatGPT authentication required',
      });
    }
    const started = now();
    const result = spawnCodex('codex', args, {
      ...commonOptions,
      timeout: 10 * 60 * 1000,
    });
    const parsed = parseCodexJsonl(result.stdout, result.status, result.error, {
      durationMs: Math.max(0, Math.round(now() - started)),
      authKind: 'chatgpt',
      auditEntries: readCodexAudit(resolvedAuditPath),
      stderr: result.stderr || '',
      userHome: codexUserHomeFromAuthPath(authPath),
      workDir,
      isolatedHomeDir: isolated.homeDir,
    });
    return attachHashes(parsed);
  } finally {
    cleanupCodexHome(isolated.homeDir);
  }
}

export function runClaude({
  workDir,
  prompt,
  stateDir,
  settingsPath,
  model,
  maxBudgetUsd = null,
  apiRetries,
  spawnClaude,
  sleepFn,
  envExtra = {},
}) {
  const env = {
    ...process.env,
    OFFCUT_STATE_DIR: stateDir,
    ...envExtra,
  };
  // Low effort + no extended thinking: bench tasks are tiny; speed > polish.
  const args = buildClaudeArgs({ prompt, model, settingsPath, maxBudgetUsd });
  const invokeClaude = spawnClaude ?? spawnSync;
  const wait = sleepFn ?? ((ms) => {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
  });

  let parsed = null;
  for (let attempt = 1; attempt <= apiRetries + 1; attempt++) {
    const result = invokeClaude('claude', args, {
      encoding: 'utf8',
      cwd: workDir,
      env,
      maxBuffer: 32 * 1024 * 1024,
      timeout: 3 * 60 * 1000,
    });
    parsed = parseClaudeResult(result.stdout, result.status, result.error);
    parsed.stderr = result.stderr || '';
    parsed.attempts = attempt;
    if (parsed.ok || !parsed.apiError || attempt > apiRetries) break;
    const waitMs = 5_000 * attempt;
    console.error(`claude api_error (attempt ${attempt}): ${parsed.error}; sleeping ${waitMs}ms`);
    wait(waitMs);
  }
  return parsed;
}


export function runOne(opts) {
  const {
    task: taskId,
    arm,
    rep,
    stub,
    model,
    keepWork,
    manifestPath,
    maxBudgetUsd,
    tasksDir,
  } = opts;
  const host = opts.host ?? 'claude-code';
  const style = opts.style ?? 'concise';
  const apiRetries = resolveApiRetries(opts);
  if (!taskId || !arm) throw new Error('--task and --arm required');
  if (!LEGACY_ARMS.has(arm) && !JUSTIFY_ARMS.has(arm)) {
    throw new Error(`bad arm: ${arm}`);
  }

  // Phase 10 arms are experiment labels. Map to Offcut mode + optional ruleset.
  // Legacy Phase 5/7.5 arms (off|full) write the arm string as the mode.
  const armCfg = JUSTIFY_ARMS.has(arm) && arm !== 'off' ? justifyArmConfig(arm) : null;
  const modeForState = armCfg ? armCfg.mode : arm === 'off' ? 'off' : arm;

  const task = loadTask(taskId, tasksDir);
  const runId = opaqueId();
  const runRoot = opts.runRoot ?? RUNS_DIR;
  const runDir = path.join(runRoot, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const stateDir = tmpName('offcut-bench-state-');
  const workParent = tmpName('offcut-bench-work-');
  const workDir = path.join(workParent, 'repo');

  const record = {
    run_id: runId,
    task_id: taskId,
    arm,
    rep,
    stub: stub || null,
    model_requested: model,
    model_id: null,
    host,
    host_version: null,
    date: new Date().toISOString().slice(0, 10),
    // Execution order and effort must be auditable from the manifest alone.
    // The first paid grid changed --effort mid-run to beat a rate limit; with
    // neither field recorded, checking whether a per-task difference tracked
    // the effort switch rather than the arm required reconstructing order from
    // filesystem mtimes. Record both so the next reader does not have to.
    started_at: new Date().toISOString(),
    effort: RUN_EFFORT,
    prompt_sha256: task.promptSha256,
    prompt_path: path.relative(BENCH_ROOT, path.join(task.dir, 'prompt.txt')).replace(/\\/g, '/'),
    offcut_mode: modeForState,
    offcut_style: style,
    ...(opts.styleArm ? { style_arm: opts.styleArm } : {}),
    ruleset_path: armCfg?.rulesetPath
      ? path.relative(BENCH_ROOT, armCfg.rulesetPath).replace(/\\/g, '/')
      : null,
    error: null,
    failure_kind: null,
    retried: false,
    total_cost_usd: null,
    duration_ms: null,
    input_tokens: null,
    output_tokens: null,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    reasoning_output_tokens: null,
    model_turns: null,
    completed_tool_calls: null,
    ...(opts.stage ? { stage: opts.stage } : {}),
    ...(opts.attempt ? { attempt: opts.attempt } : {}),
    ...(opts.backend ? { backend: opts.backend } : {}),
  };

  try {
    // Isolation asserts
    writeMode(stateDir, modeForState);
    writeStyle(stateDir, style);
    if (armCfg) {
      writeArmOverrides(stateDir, {
        rulesetPath: armCfg.rulesetPath,
        reminder: armCfg.reminder,
      });
    }
    const stateFiles = fs.readdirSync(stateDir).sort();
    if (!stateFiles.includes('active') || !stateFiles.includes('default')) {
      throw new Error('state dir missing active/default after writeMode');
    }
    // Assert no fired-* leakage
    if (stateFiles.some((f) => f.startsWith('fired-') || f.startsWith('turn-'))) {
      throw new Error('state dir not clean');
    }

    copyTree(task.repoDir, workDir);
    initGitRepo(workDir);

    // Verify prompt bytes match task file
    const promptBytes = fs.readFileSync(path.join(task.dir, 'prompt.txt'));
    if (promptBytes.toString('utf8') !== task.prompt) {
      throw new Error('prompt byte mismatch');
    }
    fs.writeFileSync(path.join(runDir, 'prompt.txt'), promptBytes);
    fs.writeFileSync(
      path.join(runDir, 'prompt.sha256'),
      task.promptSha256 + '\n',
    );

    let settingsPath = null;
    if (host !== CODEX_HOST) {
      const settings = buildHooksSettings();
      settingsPath = path.join(runDir, 'settings.json');
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    }

    let agent;
    if (stub) {
      agent = runStub(taskId, stub, workDir);
      record.model_id = `stub:${stub}`;
      record.host_version = 'stub';
    } else if (host === CODEX_HOST) {
      record.host_version = opts.hostVersion ?? CODEX_HOST_VERSION;
      record.custom_agent_kind = CODEX_CUSTOM_AGENT_KIND;
      record.custom_agent_name = CODEX_CUSTOM_AGENT_NAME;
      record.approval_mode = CODEX_APPROVAL_MODE;
      record.effective_sandbox = CODEX_EFFECTIVE_SANDBOX;
      agent = runCodex({
        workDir,
        prompt: task.prompt,
        arm,
        stateDir,
        authPath: opts.authPath,
        homeParentDir: opts.homeParentDir,
        auditPath: path.join(runDir, 'agent-audit.jsonl'),
        spawnCodex: opts.spawnCodex,
        profileInstructions: opts.profileInstructions,
        nativeInstructions: opts.nativeInstructions,
      });
      record.model_id = agent.modelId;
      record.model_observation = agent.modelObservation;
      record.auth_kind = agent.authKind;
      record.billing_kind =
        agent.cost_evidence?.kind === 'subscription'
          ? 'chatgpt_subscription'
          : null;
      record.custom_agent_verified = agent.customAgentVerified;
      record.verified = agent.customAgentVerified;
      record.config_sha256 = agent.config_sha256;
      record.profile_config_sha256 = agent.profile_config_sha256;
      record.hooks_sha256 = agent.hooks_sha256;
      record.native_instructions_sha256 = agent.native_instructions_sha256;
      record.process_started = agent.processStarted;
      record.inference_started = agent.inferenceStarted;
      record.exit_code = agent.exitCode ?? null;
      record.warning_count = agent.warningCount;
      record.user_assets_isolated = agent.userAssetsIsolated;
      record.recoverable_tool_failures =
        agent.recoverableToolFailures ?? [];
      record.recoverable_tool_failure_count =
        agent.recoverableToolFailureCount ?? 0;
    } else {
      const ver = spawnSync('claude', ['--version'], { encoding: 'utf8' });
      record.host_version = (ver.stdout || ver.stderr || '').trim();
      const envExtra = {};
      if (armCfg?.rulesetPath) envExtra.OFFCUT_RULESET_PATH = armCfg.rulesetPath;
      if (armCfg?.reminder) envExtra.OFFCUT_REMINDER = armCfg.reminder;
      agent = runClaude({
        workDir,
        prompt: task.prompt,
        stateDir,
        settingsPath,
        model,
        maxBudgetUsd,
        apiRetries,
        envExtra,
      });
      record.model_id = agent.modelId || model;
    }

    fs.writeFileSync(
      path.join(runDir, host === CODEX_HOST ? 'transcript.jsonl' : 'transcript.txt'),
      agent.transcript || '',
    );
    if (agent.stdout) fs.writeFileSync(path.join(runDir, 'stdout.json'), agent.stdout);
    if (agent.stderr) fs.writeFileSync(path.join(runDir, 'stderr.txt'), agent.stderr);

    // Snapshot state dir after run (for bleed / challenge evidence)
    const stateAfter = {};
    for (const f of fs.readdirSync(stateDir)) {
      try {
        stateAfter[f] = fs.readFileSync(path.join(stateDir, f), 'utf8');
      } catch {
        stateAfter[f] = null;
      }
    }
    fs.writeFileSync(path.join(runDir, 'state-after.json'), JSON.stringify(stateAfter, null, 2));

    if (!agent.ok && !stub) {
      record.error = agent.error || 'agent failed';
      record.failure_kind = classifyAgentFailure(agent);
    }
    Object.assign(record, agent.telemetry || {});
    record.model_turns = agent.modelTurnCount ?? null;
    record.completed_tool_calls = agent.rootCompletedToolCount ?? null;
    record.cost_evidence = agent.cost_evidence || null;
    if (agent.attempts && agent.attempts > 1) {
      record.retried = true;
      record.attempts = agent.attempts;
    }

    const diff = captureDiff(workDir);
    fs.writeFileSync(path.join(runDir, 'diff.patch'), diff);

    // Keep a copy of the worktree for scoring corpus (exports across files)
    const workCopy = path.join(runDir, 'work');
    copyTree(workDir, workCopy);
    // drop .git from score corpus copy weight — still fine either way
    fs.rmSync(path.join(workCopy, '.git'), { recursive: true, force: true });

    const accept = runAccept(task.acceptPath, workDir);
    fs.writeFileSync(path.join(runDir, 'accept.json'), JSON.stringify(accept, null, 2) + '\n');

    const metrics = { ...scoreRun(runDir), ...(agent.telemetry || {}) };
    fs.writeFileSync(path.join(runDir, 'metrics.json'), JSON.stringify(metrics, null, 2) + '\n');

    // Sealed manifest entry (arm known here; score already wrote metrics without arm)
    appendManifest(record, manifestPath);

    fs.writeFileSync(
      path.join(runDir, 'run.json'),
      JSON.stringify({ ...record, metrics_summary: { task_passed: metrics.task_passed } }, null, 2) +
        '\n',
    );

    return { runId, runDir, record, metrics, accept };
  } finally {
    // Windows often locks files under %TEMP% briefly after node exits; never
    // let cleanup turn a finished scored run into a schedule-level failure.
    try {
      fs.rmSync(stateDir, { recursive: true, force: true });
    } catch {
      // best-effort
    }
    if (!keepWork) {
      try {
        fs.rmSync(workParent, { recursive: true, force: true });
      } catch {
        // best-effort
      }
    }
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.task || !opts.arm) {
    console.log(`Usage:
  node bench/run.mjs --task <id> --arm off|full|cheap|justify --rep N [--stub lean|elaborate] [--model ID] [--max-budget-usd N]

Opaque results land in bench/runs/<id>/. Manifest appends arm mapping to bench/manifest.jsonl.`);
    process.exit(opts.help ? 0 : 2);
  }
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const result = runOne(opts);
  console.log(
    JSON.stringify(
      {
        run_id: result.runId,
        task_id: opts.task,
        arm: opts.arm,
        task_passed: result.metrics.task_passed,
        signals_fired: result.metrics.signals_fired,
        flagged_pattern_survived: result.metrics.flagged_pattern_survived,
        signals_in_diff: result.metrics.signals_in_diff,
        files_created: result.metrics.files_created,
        lines_added: result.metrics.lines_added,
        model_id: result.record.model_id,
      },
      null,
      2,
    ),
  );
}

import { fileURLToPath } from 'node:url';
const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) main();
