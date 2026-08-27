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
} from './lib.mjs';
import { scoreRun } from './score.mjs';
import { hookCommand } from '../tools/install.mjs';

const LEGACY_ARMS = new Set(['off', 'full']);
const JUSTIFY_ARMS = new Set(['off', 'cheap', 'justify']);

// Reasoning effort for paid runs. Named so the manifest can record it.
const RUN_EFFORT = 'low';
export const DEFAULT_API_RETRIES = 2;
export const CODEX_BACKEND_ID = 'codex-custom-v1';
export const CODEX_HOST = 'codex-cli';
export const CODEX_HOST_VERSION = '0.149.1';
export const CODEX_MODEL_ID = 'gpt-5.6-sol';
export const CODEX_CUSTOM_ROLE = 'ticket-worker';
export const CODEX_ROLE_INSTRUCTIONS =
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

export function buildCodexArgs({ workDir, envelope }) {
  return [
    '--sandbox',
    'workspace-write',
    '--ask-for-approval',
    'never',
    '--dangerously-bypass-hook-trust',
    '-C',
    workDir,
    'exec',
    '--json',
    '--ephemeral',
    envelope,
  ];
}

function tomlString(value) {
  return JSON.stringify(String(value));
}

export function buildCodexEnvelope(ticket) {
  return [
    `Delegate the maintenance ticket below verbatim to the ${CODEX_CUSTOM_ROLE} custom role using spawn_agent.`,
    'Wait for that role to finish.',
    'Do not edit files yourself, do not spawn any other role, and do not modify the worker output afterward.',
    '',
    '<ticket>',
    String(ticket),
    '</ticket>',
  ].join('\n');
}

function codexConfigText() {
  return [
    `model = ${tomlString(CODEX_MODEL_ID)}`,
    'model_reasoning_effort = "low"',
    '',
    '[features]',
    'multi_agent = true',
    'hooks = true',
    '',
  ].join('\n');
}

function codexRoleText() {
  return [
    `name = ${tomlString(CODEX_CUSTOM_ROLE)}`,
    'description = "Executes one delegated maintenance ticket"',
    `developer_instructions = ${tomlString(CODEX_ROLE_INSTRUCTIONS)}`,
    `model = ${tomlString(CODEX_MODEL_ID)}`,
    'model_reasoning_effort = "low"',
    'sandbox_mode = "workspace-write"',
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
}) {
  if (arm !== 'off' && arm !== 'full') throw new Error(`bad Codex efficacy arm: ${arm}`);
  if (!fs.existsSync(authPath)) throw new Error('Codex auth file missing');
  fs.mkdirSync(parentDir, { recursive: true });
  const homeDir = fs.mkdtempSync(path.join(parentDir, 'offcut-codex-home-'));
  try {
    const agentsDir = path.join(homeDir, 'agents');
    fs.mkdirSync(agentsDir);
    fs.copyFileSync(authPath, path.join(homeDir, 'auth.json'));
    const config = codexConfigText();
    const role = codexRoleText();
    const hooks = buildCodexHooksSettings(arm);
    fs.writeFileSync(path.join(homeDir, 'config.toml'), config, 'utf8');
    fs.writeFileSync(
      path.join(agentsDir, `${CODEX_CUSTOM_ROLE}.toml`),
      role,
      'utf8',
    );
    fs.writeFileSync(path.join(homeDir, 'hooks.json'), `${JSON.stringify(hooks, null, 2)}\n`, 'utf8');
    return {
      homeDir,
      config_sha256: sha256(config),
      role_sha256: sha256(role),
      hooks_sha256: sha256(`${JSON.stringify(hooks, null, 2)}\n`),
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
    normalized === 'multiagentv1spawnagent'
  ) {
    return 'spawn_agent';
  }
  if (
    normalized === 'wait' ||
    normalized === 'waitagent' ||
    normalized === 'multiagentv1waitagent'
  ) {
    return 'wait';
  }
  if (
    normalized === 'closeagent' ||
    normalized === 'multiagentv1closeagent'
  ) {
    return 'close_agent';
  }
  if (
    normalized === 'sendinput' ||
    normalized === 'multiagentv1sendinput'
  ) {
    return 'send_input';
  }
  return null;
}

export function verifyCodexAgentAudit(entries, events) {
  const starts = entries.filter(
    (entry) =>
      entry?.hook_event_name === 'SubagentStart' &&
      entry?.agent_type === CODEX_CUSTOM_ROLE &&
      typeof entry?.agent_id === 'string' &&
      entry.agent_id,
  );
  if (starts.length !== 1) return { ok: false, workerAgentId: null };
  const workerAgentId = starts[0].agent_id;
  const stops = entries.filter(
    (entry) =>
      entry?.hook_event_name === 'SubagentStop' &&
      entry?.agent_id === workerAgentId &&
      entry?.agent_type === CODEX_CUSTOM_ROLE,
  );
  if (stops.length !== 1) return { ok: false, workerAgentId };
  const toolEvents = entries.filter(
    (entry) =>
      (entry?.hook_event_name === 'PreToolUse' ||
        entry?.hook_event_name === 'PostToolUse'),
  );
  const collabItems = events
    .filter(
      (event) =>
        event?.type === 'item.completed' &&
        event?.item?.type === 'collab_tool_call',
    )
    .map((event) => event.item);
  const toolCalls = new Map();
  for (const entry of toolEvents) {
    if (typeof entry.tool_use_id !== 'string' || !entry.tool_use_id) {
      return { ok: false, workerAgentId };
    }
    const identity = {
      agentId: entry.agent_id,
      agentType: entry.agent_type,
      tool: String(entry.tool_name || ''),
      canonicalTool: canonicalCodexOrchestrationTool(entry.tool_name),
      phases: new Map([[entry.hook_event_name, 1]]),
    };
    const prior = toolCalls.get(entry.tool_use_id);
    if (
      prior &&
      (prior.agentId !== identity.agentId ||
        prior.agentType !== identity.agentType ||
        prior.tool.toLowerCase() !== identity.tool.toLowerCase())
    ) {
      return { ok: false, workerAgentId };
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
  const allowedParentTools = new Set(['spawn_agent', 'wait', 'close_agent']);
  const auditedCounts = new Map();
  for (const identity of toolCalls.values()) {
    if (
      identity.agentId === workerAgentId &&
      identity.agentType === CODEX_CUSTOM_ROLE
    ) {
      continue;
    }
    if (
      !allowedParentTools.has(identity.canonicalTool) ||
      identity.phases.get('PreToolUse') !== 1 ||
      identity.phases.get('PostToolUse') !== 1
    ) {
      return { ok: false, workerAgentId };
    }
    auditedCounts.set(
      identity.canonicalTool,
      (auditedCounts.get(identity.canonicalTool) || 0) + 1,
    );
  }
  const collabCounts = new Map();
  for (const item of collabItems) {
    const canonicalTool = canonicalCodexOrchestrationTool(item.tool);
    const targetsWorker =
      item.receiver_thread_ids?.includes(workerAgentId) ||
      Object.hasOwn(item.agents_states || {}, workerAgentId);
    if (
      !allowedParentTools.has(canonicalTool) ||
      item.status !== 'completed' ||
      !targetsWorker
    ) {
      return { ok: false, workerAgentId };
    }
    collabCounts.set(
      canonicalTool,
      (collabCounts.get(canonicalTool) || 0) + 1,
    );
  }
  // offcut: Codex 0.149.1 CollabToolCallItem has no item id to join with
  // hook tool_use_id; require exact paired-operation counts until it exposes one.
  for (const tool of allowedParentTools) {
    if ((auditedCounts.get(tool) || 0) !== (collabCounts.get(tool) || 0)) {
      return { ok: false, workerAgentId };
    }
  }
  const spawnVerified = collabItems.some(
    (item) =>
      item.tool === 'spawn_agent' &&
      item.status === 'completed' &&
      Array.isArray(item.receiver_thread_ids) &&
      item.receiver_thread_ids.includes(workerAgentId),
  );
  const failedStates = new Set([
    'interrupted',
    'errored',
    'shutdown',
    'not_found',
  ]);
  const workerFailed = collabItems.some(
    (item) =>
      item.status === 'failed' ||
      failedStates.has(item.agents_states?.[workerAgentId]?.status),
  );
  const terminalVerified = collabItems.some(
    (item) =>
      item.status === 'completed' &&
      item.agents_states?.[workerAgentId]?.status === 'completed',
  );
  return {
    ok: spawnVerified && terminalVerified && !workerFailed,
    workerAgentId,
    spawnVerified,
    terminalVerified,
    workerFailed,
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
    (event) => event?.message || event?.error?.message || '',
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
  const apiError =
    /(?:rate limit|too many requests|quota|authentication|unauthorized|forbidden|api key|subscription|\b429\b|\b5\d\d\b)/i.test(
      text,
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
  const attribution = verifyCodexAgentAudit(auditEntries, events);
  const genericSpawnVerified = attribution.spawnVerified === true;
  const customAgentVerified = attribution.ok;
  const eventError = events.some(
    (event) =>
      /(?:^|[._])(?:error|failed)$/i.test(String(event?.type || '')) ||
      event?.item?.type === 'error' ||
      event?.status === 'failed' ||
      event?.item?.status === 'failed' ||
      attribution.workerFailed === true,
  );
  const usage = aggregateCodexUsage(events);
  const modelId = observedCodexModel(events);
  const subscriptionVerified = authKind === 'chatgpt';
  const ok =
    status === 0 &&
    !eventError &&
    customAgentVerified &&
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
    timedOut: Boolean(spawnErr?.code === 'ETIMEDOUT'),
    customAgentVerified,
    genericSpawnVerified,
    workerAgentId: attribution.workerAgentId,
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
        : !customAgentVerified
          ? `Codex did not prove completed ${CODEX_CUSTOM_ROLE} ownership`
          : eventError || status !== 0
            ? diagnostic || `codex exit ${status}`
            : null,
  };
}

const PROVIDER_OVERRIDE_ENV =
  /(?:API_KEY|BASE_URL|API_BASE|PROVIDER|ENDPOINT)$/i;

export function buildIsolatedCodexEnv({
  homeDir,
  stateDir,
  auditPath,
  envSource = process.env,
}) {
  const env = { ...envSource };
  for (const key of Object.keys(env)) {
    if (PROVIDER_OVERRIDE_ENV.test(key)) delete env[key];
  }
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
}) {
  const isolated = prepareCodexHome({ arm, authPath, parentDir: homeParentDir });
  const envelope = buildCodexEnvelope(prompt);
  const args = buildCodexArgs({ workDir, envelope });
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
    envelope_sha256: sha256(envelope),
    config_sha256: isolated.config_sha256,
    role_sha256: isolated.role_sha256,
    hooks_sha256: isolated.hooks_sha256,
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
        genericSpawnVerified: false,
        workerAgentId: null,
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
  const runDir = path.join(RUNS_DIR, runId);
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
    ...(opts.stage ? { stage: opts.stage } : {}),
    ...(opts.attempt ? { attempt: opts.attempt } : {}),
    ...(opts.backend ? { backend: opts.backend } : {}),
  };

  try {
    // Isolation asserts
    writeMode(stateDir, modeForState);
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
      record.custom_agent_role = CODEX_CUSTOM_ROLE;
      agent = runCodex({
        workDir,
        prompt: task.prompt,
        arm,
        stateDir,
        authPath: opts.authPath,
        homeParentDir: opts.homeParentDir,
        auditPath: path.join(runDir, 'agent-audit.jsonl'),
        spawnCodex: opts.spawnCodex,
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
      record.envelope_sha256 = agent.envelope_sha256;
      record.config_sha256 = agent.config_sha256;
      record.role_sha256 = agent.role_sha256;
      record.hooks_sha256 = agent.hooks_sha256;
      record.process_started = agent.processStarted;
      record.inference_started = agent.inferenceStarted;
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
