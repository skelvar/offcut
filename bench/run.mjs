#!/usr/bin/env node
// Run one bench task under one arm. Captures diff + transcript into an opaque dir.
//
//   node bench/run.mjs --task config-fallback --arm off --rep 1 --stub lean
//   node bench/run.mjs --task config-fallback --arm full --rep 1
//
// Paid mode invokes Claude Code. Dry-run --stub avoids model cost.

import fs from 'node:fs';
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
  tmpName,
  writeArmOverrides,
  writeMode,
} from './lib.mjs';
import { scoreRun } from './score.mjs';

const LEGACY_ARMS = new Set(['off', 'full']);
const JUSTIFY_ARMS = new Set(['off', 'cheap', 'justify']);

// Reasoning effort for paid runs. Named so the manifest can record it.
const RUN_EFFORT = 'low';
export const DEFAULT_API_RETRIES = 2;

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
    host: 'claude-code',
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
    ...(opts.stage ? { stage: opts.stage } : {}),
    ...(opts.attempt ? { attempt: opts.attempt } : {}),
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

    const settings = buildHooksSettings();
    const settingsPath = path.join(runDir, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    let agent;
    if (stub) {
      agent = runStub(taskId, stub, workDir);
      record.model_id = `stub:${stub}`;
      record.host_version = 'stub';
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

    fs.writeFileSync(path.join(runDir, 'transcript.txt'), agent.transcript || '');
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
