#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import {
  BENCH_ROOT,
  MODEL_ID,
  RUNS_DIR,
  captureDiff,
  copyTree,
  initGitRepo,
  opaqueId,
  readManifest,
  sha256,
  writeMode,
} from './lib.mjs';
import {
  CODEX_APPROVAL_MODE,
  CODEX_BACKEND_ID,
  CODEX_CUSTOM_AGENT_KIND,
  CODEX_CUSTOM_AGENT_NAME,
  CODEX_EFFECTIVE_SANDBOX,
  CODEX_HOST,
  CODEX_HOST_VERSION,
  CODEX_MODEL_ID,
  CODEX_PROFILE_INSTRUCTIONS,
  buildCodexArgs,
  buildIsolatedCodexEnv,
  classifyCodexEventFailures,
  cleanupCodexHome,
  prepareCodexHome,
  runCodex,
  runOne,
  verifyCodexChatGptLogin,
} from './run.mjs';
import { hasFiredSignal } from '../hooks/state.js';
import { POST_SIGNALS, PRE_SIGNALS } from '../hooks/signals.js';

export const EFFICACY_SEED = 'offcut-efficacy-2026-08-27';
export const EFFICACY_BUDGET_USD = 35;
export const EFFICACY_TASKS_DIR = path.join(BENCH_ROOT, 'efficacy-tasks');
export const EFFICACY_MANIFEST_PATH = path.join(BENCH_ROOT, 'efficacy-manifest.jsonl');
export const EFFICACY_COST_PATH = path.join(BENCH_ROOT, 'efficacy-cost.jsonl');
export const EFFICACY_ANALYSIS_PATH = path.join(BENCH_ROOT, 'efficacy-analysis.json');
export const EFFICACY_RESULTS_PATH = path.join(
  path.dirname(BENCH_ROOT),
  'docs',
  'development',
  'EFFICACY-RESULTS.md',
);
export const CODEX_PREFLIGHT_ROOT = path.join(BENCH_ROOT, 'codex-preflight');
export const CODEX_PREFLIGHT_LEDGER_PATH = path.join(CODEX_PREFLIGHT_ROOT, 'ledger.jsonl');
const CODEX_PREFLIGHT_PROOF_FILE = 'ticket-worker-write-proof.txt';
const CODEX_PREFLIGHT_PROOF_CONTENT = 'ticket-worker-write-ok\n';
export const CLAUDE_CODE_VERSION = '2.1.243';

export {
  CODEX_APPROVAL_MODE,
  CODEX_BACKEND_ID,
  CODEX_CUSTOM_AGENT_KIND,
  CODEX_CUSTOM_AGENT_NAME,
  CODEX_EFFECTIVE_SANDBOX,
};

export function discoveryRep3Jobs(taskIds, runs) {
  return taskIds
    .filter((taskId) =>
      runs.some(
        (run) =>
          run.task_id === taskId &&
          (run.rep === 1 || run.rep === 2) &&
          run.accept_passed === true &&
          run.target_present === true,
      ),
    )
    .map((taskId) => ({ taskId, arm: 'off', rep: 3 }));
}

export function qualifyDiscovery(taskIds, runs) {
  const qualified = [];
  for (const taskId of taskIds) {
    const taskRuns = runs.filter(
      (run) => run.task_id === taskId && [1, 2, 3].includes(run.rep),
    );
    if (
      taskRuns.length !== 3 ||
      new Set(taskRuns.map((run) => run.rep)).size !== 3
    ) {
      continue;
    }
    const targetCount = taskRuns.filter((run) => run.target_present === true).length;
    const acceptCount = taskRuns.filter((run) => run.accept_passed === true).length;
    if (targetCount >= 2 && acceptCount >= 2) {
      qualified.push({
        task_id: taskId,
        target_count: targetCount,
        accept_count: acceptCount,
        total_count: 3,
      });
    }
  }
  return qualified;
}

function qualifierOrder(a, b, seed) {
  if (a.target_count !== b.target_count) return b.target_count - a.target_count;
  const aHash = sha256(`${seed}\0${a.task_id}`);
  const bHash = sha256(`${seed}\0${b.task_id}`);
  return aHash < bHash ? -1 : aHash > bHash ? 1 : 0;
}

export function selectNoOpportunityTasks(tasks, cap = 6, seed = EFFICACY_SEED) {
  return selectQualifiers(
    tasks.map((task) => ({
      task_id: task.id,
      category: task.category,
      target_count: 0,
    })),
    cap,
    seed,
  );
}

export function selectQualifiers(summaries, cap = 6, seed = EFFICACY_SEED) {
  const sorted = [...summaries].sort((a, b) => qualifierOrder(a, b, seed));
  const categoryWinners = [];
  const seen = new Set();
  for (const summary of sorted) {
    if (seen.has(summary.category)) continue;
    seen.add(summary.category);
    categoryWinners.push(summary);
  }
  categoryWinners.sort((a, b) => qualifierOrder(a, b, seed));
  const selected = categoryWinners.slice(0, cap);
  const selectedIds = new Set(selected.map((summary) => summary.task_id));
  for (const summary of sorted) {
    if (selected.length >= cap) break;
    if (!selectedIds.has(summary.task_id)) {
      selected.push(summary);
      selectedIds.add(summary.task_id);
    }
  }
  return selected.map((summary) => summary.task_id);
}

export function confirmatorySchedule(taskIds, reps = 8, seed = EFFICACY_SEED) {
  const jobs = [];
  for (const taskId of taskIds) {
    for (let rep = 1; rep <= reps; rep++) {
      const hash = sha256(`${seed}\0${taskId}\0${rep}`);
      const arms = Number.parseInt(hash.slice(0, 2), 16) % 2
        ? ['full', 'off']
        : ['off', 'full'];
      for (const arm of arms) jobs.push({ taskId, arm, rep });
    }
  }
  return jobs;
}

export function primarySuccess(run) {
  return (
    run.failure_kind == null &&
    run.accept_passed === true &&
    run.target_present === false
  );
}

export function noOpportunityPrimary(metrics, failureKind) {
  return (
    !isRetryableFailure(failureKind) &&
    metrics.task_passed === true &&
    metrics.target_present === false
  );
}

export function isRetryableFailure(failureKind) {
  return ['api', 'host', 'infrastructure'].includes(failureKind);
}

export function readCostLedger(ledgerPath) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs
    .readFileSync(ledgerPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function appendCostAttempt(ledgerPath, attempt) {
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(attempt)}\n`, 'utf8');
}

export function budgetAllowance(attempts, ceilingUsd = EFFICACY_BUDGET_USD) {
  const costs = attempts.map((attempt) => attempt.total_cost_usd);
  if (costs.some((cost) => !Number.isFinite(cost) || cost < 0)) return null;
  const spent = costs.reduce((sum, cost) => sum + cost, 0);
  const remaining = ceilingUsd - spent;
  if (!(remaining > 0)) return null;
  const noCallStarted =
    !attempts.length ||
    attempts.every((attempt) => attempt.cost_evidence?.kind === 'known_zero');
  if (noCallStarted) return Math.min(remaining, 1);
  const largest = Math.max(...costs);
  if (!(remaining > 1.2 * largest)) return null;
  return remaining;
}

function hasCostTelemetryAnomaly(attempts) {
  return attempts.some(
    (attempt) =>
      attempt.telemetry_anomaly === true ||
      !Number.isFinite(attempt.total_cost_usd) ||
      attempt.total_cost_usd < 0,
  );
}

function runNode(scriptPath, args, cwd) {
  const result = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd,
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || `${path.basename(scriptPath)} failed`).trim());
  }
  return result.stdout || '';
}

function applyOperation(workDir, operation) {
  const input = operation.tool_input || {};
  const relativePath = input.file_path;
  if (!relativePath) throw new Error('stub operation missing tool_input.file_path');
  const target = path.resolve(workDir, relativePath);
  const prefix = `${path.resolve(workDir)}${path.sep}`;
  if (target !== path.resolve(workDir) && !target.startsWith(prefix)) {
    throw new Error(`stub operation escapes worktree: ${relativePath}`);
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  if (operation.tool_name === 'Write') {
    fs.writeFileSync(target, String(input.content ?? ''), 'utf8');
    return;
  }
  if (operation.tool_name === 'Edit') {
    const current = fs.readFileSync(target, 'utf8');
    const oldString = String(input.old_string ?? '');
    if (!oldString || !current.includes(oldString)) {
      throw new Error(`stub Edit old_string not found: ${relativePath}`);
    }
    fs.writeFileSync(target, current.replace(oldString, String(input.new_string ?? '')), 'utf8');
    return;
  }
  throw new Error(`stub operation must use Write or Edit: ${operation.tool_name}`);
}

export function assertOperationIntegrity(repoDir, actualWorkDir, operations) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-efficacy-integrity-'));
  const replayDir = path.join(parent, 'repo');
  try {
    copyTree(repoDir, replayDir);
    initGitRepo(replayDir);
    for (const operation of operations) applyOperation(replayDir, operation);
    const actualDiff = captureDiff(actualWorkDir);
    const replayDiff = captureDiff(replayDir);
    if (actualDiff !== replayDiff) {
      throw new Error('declared operations do not reproduce stub changes');
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

export function replayHookOperations(repoDir, operations) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-efficacy-replay-'));
  const workDir = path.join(parent, 'repo');
  const stateDir = path.join(parent, 'state');
  writeMode(stateDir, 'full');
  copyTree(repoDir, workDir);
  const previousState = process.env.OFFCUT_STATE_DIR;
  process.env.OFFCUT_STATE_DIR = stateDir;
  const sessionId = 'efficacy-selftest';
  try {
    const exposure = [];
    for (let index = 0; index < operations.length; index++) {
      const operation = operations[index];
      const common = {
        session_id: sessionId,
        tool_use_id: `selftest-${index}`,
        tool_name: operation.tool_name,
        cwd: workDir,
        tool_input: operation.tool_input,
      };
      const runHook = (script, hookEventName) => {
        const result = spawnSync(process.execPath, [path.join(BENCH_ROOT, '..', 'hooks', script)], {
          cwd: workDir,
          env: { ...process.env, OFFCUT_STATE_DIR: stateDir },
          input: JSON.stringify({ ...common, hook_event_name: hookEventName }),
          encoding: 'utf8',
        });
        if (result.status !== 0) {
          throw new Error((result.stderr || `${script} failed`).trim());
        }
        return Boolean((result.stdout || '').trim());
      };
      if (runHook('pre-write.js', 'PreToolUse')) {
        for (const signal of PRE_SIGNALS) {
          if (hasFiredSignal(sessionId, signal.id)) {
            exposure.push({ signal: signal.id, phase: 'pre' });
          }
        }
      }
      applyOperation(workDir, operation);
      if (runHook('post-write.js', 'PostToolUse')) {
        for (const signal of POST_SIGNALS) {
          if (hasFiredSignal(sessionId, `post:${signal.id}`)) {
            exposure.push({ signal: signal.id, phase: 'post' });
          }
        }
      }
    }
    return exposure.filter(
      (hit, index, all) =>
        all.findIndex(
          (candidate) =>
            candidate.signal === hit.signal && candidate.phase === hit.phase,
        ) === index,
    );
  } finally {
    if (previousState === undefined) delete process.env.OFFCUT_STATE_DIR;
    else process.env.OFFCUT_STATE_DIR = previousState;
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

function runBlindMeasure(taskDir, diff, workDir, accept) {
  const inputDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-efficacy-measure-'));
  try {
    fs.writeFileSync(path.join(inputDir, 'diff.patch'), diff, 'utf8');
    fs.writeFileSync(path.join(inputDir, 'accept.json'), `${JSON.stringify(accept)}\n`, 'utf8');
    copyTree(workDir, path.join(inputDir, 'work'));
    const stdout = runNode(path.join(taskDir, 'measure.mjs'), [inputDir], inputDir);
    const measured = JSON.parse(stdout.trim());
    if (typeof measured.target_present !== 'boolean') {
      throw new Error('measure.mjs must return boolean target_present');
    }
    return measured;
  } finally {
    fs.rmSync(inputDir, { recursive: true, force: true });
  }
}

function selftestStyle(taskDir, style) {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), `offcut-efficacy-${style}-`));
  const workDir = path.join(parent, 'repo');
  try {
    copyTree(path.join(taskDir, 'repo'), workDir);
    initGitRepo(workDir);
    const stdout = runNode(path.join(taskDir, 'stubs', `${style}.mjs`), [workDir], workDir);
    const stubResult = JSON.parse(stdout.trim());
    if (!Array.isArray(stubResult.operations) || stubResult.operations.length === 0) {
      throw new Error(`${style} stub must return realistic Write/Edit operations`);
    }
    assertOperationIntegrity(
      path.join(taskDir, 'repo'),
      workDir,
      stubResult.operations,
    );
    const acceptResult = spawnSync(
      process.execPath,
      [path.join(taskDir, 'accept.mjs'), workDir],
      { cwd: workDir, encoding: 'utf8' },
    );
    const accept = {
      ok: acceptResult.status === 0,
      exitCode: acceptResult.status,
      stdout: acceptResult.stdout || '',
      stderr: acceptResult.stderr || '',
    };
    const diff = captureDiff(workDir);
    const measured = runBlindMeasure(taskDir, diff, workDir, accept);
    return {
      accept_passed: accept.ok,
      target_present: measured.target_present,
      measure_seen: measured.seen,
      hook_exposure: replayHookOperations(path.join(taskDir, 'repo'), stubResult.operations),
    };
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
}

export function selftestTask(taskDir) {
  const meta = JSON.parse(fs.readFileSync(path.join(taskDir, 'meta.json'), 'utf8'));
  const lean = selftestStyle(taskDir, 'lean');
  const target = selftestStyle(taskDir, 'target');
  if (!lean.accept_passed || lean.target_present) {
    throw new Error(`${meta.id}: lean stub must pass accept with target absent`);
  }
  if (
    lean.hook_exposure.some(
      (hit) => hit.signal === meta.target_signal && hit.phase === meta.target_phase,
    )
  ) {
    throw new Error(
      `${meta.id}: lean stub exposed ${meta.target_phase}:${meta.target_signal}`,
    );
  }
  if (!target.accept_passed || !target.target_present) {
    throw new Error(`${meta.id}: target stub must pass accept with target present`);
  }
  if (
    !target.hook_exposure.some(
      (hit) => hit.signal === meta.target_signal && hit.phase === meta.target_phase,
    )
  ) {
    throw new Error(
      `${meta.id}: target stub did not expose ${meta.target_phase}:${meta.target_signal}`,
    );
  }
  return { task_id: meta.id, lean, target };
}

const CATEGORY_COUNTS = Object.freeze({
  'new-dependency': 4,
  'speculative-abstraction': 5,
  'large-first-write': 1,
  'new-config-surface': 1,
  'unused-default-param': 1,
});

export function loadEfficacyTasks(tasksDir = EFFICACY_TASKS_DIR, requireFullCorpus = true) {
  if (!fs.existsSync(tasksDir)) {
    if (requireFullCorpus) throw new Error(`efficacy fixture directory missing: ${tasksDir}`);
    return [];
  }
  const tasks = fs
    .readdirSync(tasksDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const dir = path.join(tasksDir, entry.name);
      for (const relative of [
        'prompt.txt',
        'meta.json',
        'repo',
        'accept.mjs',
        'measure.mjs',
        path.join('stubs', 'lean.mjs'),
        path.join('stubs', 'target.mjs'),
      ]) {
        if (!fs.existsSync(path.join(dir, relative))) {
          throw new Error(`${entry.name}: missing ${relative}`);
        }
      }
      const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
      if (meta.id !== entry.name) throw new Error(`${entry.name}: meta.id must match directory`);
      const prompt = fs.readFileSync(path.join(dir, 'prompt.txt'), 'utf8');
      if (
        /\b(?:offcut|simple|simplicity|brief|brevity|loc|dependenc(?:y|ies)|architect(?:ure|ural)|abstract(?:ion|ions)?|implementation|approach)\b/i.test(
          prompt,
        )
      ) {
        throw new Error(`${entry.name}: prompt must not mention study framing`);
      }
      return { id: entry.name, dir, ...meta };
    })
    .sort((a, b) => a.id.localeCompare(b.id));
  if (requireFullCorpus) {
    if (tasks.length !== 12) throw new Error(`expected 12 efficacy fixtures, found ${tasks.length}`);
    for (const [category, expected] of Object.entries(CATEGORY_COUNTS)) {
      const actual = tasks.filter((task) => task.category === category).length;
      if (actual !== expected) {
        throw new Error(`expected ${expected} ${category} fixtures, found ${actual}`);
      }
    }
  }
  return tasks;
}

export function loadMeasuredOutcomes(
  manifestPath,
  backend,
) {
  const outcomes = [];
  for (const entry of readManifest(manifestPath)) {
    if (!entry.run_id || !entry.stage) continue;
    if (backend && entry.backend !== backend) continue;
    const metricsPath = path.join(RUNS_DIR, entry.run_id, 'metrics.json');
    if (!fs.existsSync(metricsPath)) continue;
    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    if (typeof metrics.target_present !== 'boolean') continue;
    outcomes.push({
      ...entry,
      accept_passed: metrics.task_passed === true,
      target_present: metrics.target_present,
      primary_success: metrics.primary_success === true,
    });
  }
  return outcomes;
}

function completedCellKeys(outcomes, stage, backend) {
  return new Set(
    outcomes
      .filter(
        (outcome) =>
          outcome.stage === stage &&
          (!backend || outcome.backend === backend) &&
          !isRetryableFailure(outcome.failure_kind),
      )
      .map(
        (outcome) =>
          `${backend || ''}\0${outcome.task_id}\0${outcome.arm}\0${outcome.rep}`,
      ),
  );
}

function completedDiscoveryRun(outcomes, taskId, rep) {
  return outcomes.some(
    (outcome) =>
      outcome.task_id === taskId &&
      outcome.arm === 'off' &&
      outcome.rep === rep &&
      !isRetryableFailure(outcome.failure_kind) &&
      typeof outcome.accept_passed === 'boolean' &&
      typeof outcome.target_present === 'boolean',
  );
}

function assertDiscoveryComplete(stage, taskIds, outcomes) {
  const initialMissing = [];
  for (const taskId of taskIds) {
    for (const rep of [1, 2]) {
      if (!completedDiscoveryRun(outcomes, taskId, rep)) {
        initialMissing.push(`${taskId}:rep${rep}`);
      }
    }
  }
  if (initialMissing.length) {
    throw new Error(`discovery reps 1 and 2 incomplete: ${initialMissing.join(', ')}`);
  }
  if (stage !== 'confirm' && stage !== 'haiku') return;
  const eligible = discoveryRep3Jobs(taskIds, outcomes).map((job) => job.taskId);
  const rep3Missing = eligible.filter(
    (taskId) => !completedDiscoveryRun(outcomes, taskId, 3),
  );
  if (rep3Missing.length) {
    throw new Error(`eligible discovery rep 3 incomplete: ${rep3Missing.join(', ')}`);
  }
}

function omitCompleted(jobs, outcomes, stage, backend) {
  const completed = completedCellKeys(outcomes, stage, backend);
  return jobs.filter(
    (job) =>
      !completed.has(
        `${backend || ''}\0${job.taskId}\0${job.arm}\0${job.rep}`,
      ),
  );
}

export function assertRawGateCommitted({
  spawnGit = spawnSync,
  repoRoot = path.dirname(BENCH_ROOT),
} = {}) {
  for (const relative of [
    'bench/efficacy-manifest.jsonl',
    'bench/efficacy-cost.jsonl',
  ]) {
    const tracked = spawnGit('git', ['ls-files', '--error-unmatch', relative], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
    if (tracked.status !== 0) throw new Error(`raw-result commit gate not met: ${relative}`);
  }
  const status = spawnGit(
    'git',
    [
      'status',
      '--porcelain',
      '--',
      'bench/efficacy-manifest.jsonl',
      'bench/efficacy-cost.jsonl',
      'bench/runs',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  if (status.status !== 0 || status.stdout.trim()) {
    throw new Error('raw-result commit gate not met: efficacy attempts must be committed');
  }
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function numericSummary(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) {
    throw new Error('publication telemetry is missing or malformed');
  }
  return {
    total: values.reduce((sum, value) => sum + value, 0),
    median: median(values),
    min: Math.min(...values),
    max: Math.max(...values),
  };
}

function parseTranscriptEvents(transcript) {
  const events = [];
  for (const line of String(transcript || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      events.push(JSON.parse(line));
    } catch {
      return [];
    }
  }
  return events;
}

function isTranscriptSensitivityCandidate(entry, metrics, transcript) {
  if (
    entry.failure_kind !== 'model' ||
    entry.custom_agent_verified !== true ||
    metrics.task_passed !== true ||
    metrics.target_present !== false
  ) {
    return false;
  }
  const events = parseTranscriptEvents(transcript);
  const failures = classifyCodexEventFailures(events);
  const completedUsage = events.find(
    (event) => event?.type === 'turn.completed',
  )?.usage;
  const validUsage =
    completedUsage &&
    [
      'input_tokens',
      'cached_input_tokens',
      'cache_write_input_tokens',
      'output_tokens',
      'reasoning_output_tokens',
    ].every(
      (field) =>
        Number.isFinite(completedUsage[field]) &&
        completedUsage[field] >= 0,
    );
  return (
    validUsage &&
    failures.recoverableToolFailures.length > 0 &&
    !failures.unrecoverable
  );
}

function confirmArmRows(rows) {
  return {
    cells: rows.length,
    accepted: rows.filter((row) => row.accepted).length,
    target_present: rows.filter((row) => row.target_present).length,
    primary_success: rows.filter((row) => row.primary_success).length,
    frozen_primary_success: rows.filter((row) => row.frozen_primary_success).length,
    lines_added: rows.reduce((sum, row) => sum + row.lines_added, 0),
    lines_removed: rows.reduce((sum, row) => sum + row.lines_removed, 0),
  };
}

function summarizeNoOpportunityConfirm(confirmOutcomes, metricsByRun, metaByTask) {
  if (confirmOutcomes.length === 0) return null;
  const expectedIds = selectNoOpportunityTasks(
    [...metaByTask.values()].map((meta) => ({
      id: meta.id,
      category: meta.category,
    })),
  );
  const expectedKeys = new Set();
  for (const taskId of expectedIds) {
    for (let rep = 1; rep <= 8; rep++) {
      expectedKeys.add(`${taskId}\0off\0${rep}`);
      expectedKeys.add(`${taskId}\0full\0${rep}`);
    }
  }
  const rows = [];
  const seen = new Set();
  for (const entry of confirmOutcomes) {
    const metrics = metricsByRun.get(entry.run_id);
    if (
      !metrics ||
      typeof metrics.target_present !== 'boolean' ||
      typeof metrics.task_passed !== 'boolean' ||
      typeof metrics.primary_success !== 'boolean'
    ) {
      continue;
    }
    const key = `${entry.task_id}\0${entry.arm}\0${entry.rep}`;
    if (!expectedKeys.has(key) || seen.has(key)) {
      throw new Error('no-opportunity confirm grid is incomplete or unexpected');
    }
    if (
      !Number.isFinite(metrics.lines_added) ||
      !Number.isFinite(metrics.lines_removed)
    ) {
      throw new Error(`confirm metrics malformed for run ${entry.run_id}`);
    }
    seen.add(key);
    rows.push({
      task_id: entry.task_id,
      arm: entry.arm,
      rep: entry.rep,
      accepted: metrics.task_passed === true,
      target_present: metrics.target_present === true,
      primary_success: noOpportunityPrimary(metrics, entry.failure_kind),
      frozen_primary_success: metrics.primary_success === true,
      lines_added: metrics.lines_added,
      lines_removed: metrics.lines_removed,
    });
  }
  if (seen.size === 0 || seen.size !== expectedKeys.size) return null;
  return {
    label: 'no_opportunity_confirm',
    task_ids: expectedIds,
    planned_cells: expectedKeys.size,
    completed_cells: rows.length,
    off: confirmArmRows(rows.filter((row) => row.arm === 'off')),
    full: confirmArmRows(rows.filter((row) => row.arm === 'full')),
  };
}

const REPORT_CATEGORY_ORDER = [
  'new-dependency',
  'speculative-abstraction',
  'large-first-write',
  'new-config-surface',
  'unused-default-param',
];

export function buildEfficacyAnalysis({
  manifestEntries,
  metricsByRun,
  taskMetas,
  transcriptByRun,
  preflightEvidence,
  rawCommitSha,
}) {
  const backendEntries = manifestEntries.filter(
    (entry) => entry.backend === CODEX_BACKEND_ID,
  );
  const scoped = backendEntries.filter(
    (entry) =>
      entry.stage === 'discovery12' &&
      entry.arm === 'off' &&
      (entry.rep === 1 || entry.rep === 2),
  );
  const cellKeys = new Set(
    scoped.map((entry) => `${entry.task_id}\0${entry.rep}`),
  );
  if (scoped.length !== 24 || cellKeys.size !== 24) {
    throw new Error(
      `report requires 24 initial cells for ${CODEX_BACKEND_ID}; found ${cellKeys.size}`,
    );
  }
  const metaByTask = new Map(taskMetas.map((meta) => [meta.id, meta]));
  const tasks = scoped
    .map((entry) => {
      const metrics = metricsByRun.get(entry.run_id);
      const meta = metaByTask.get(entry.task_id);
      if (!metrics || !meta) {
        throw new Error(`report evidence missing for run ${entry.run_id}`);
      }
      if (
        typeof metrics.target_present !== 'boolean' ||
        typeof metrics.task_passed !== 'boolean' ||
        typeof metrics.primary_success !== 'boolean' ||
        !Number.isFinite(metrics.lines_added) ||
        !Number.isFinite(metrics.lines_removed)
      ) {
        throw new Error(`report metrics malformed for run ${entry.run_id}`);
      }
      const recovered = isTranscriptSensitivityCandidate(
        entry,
        metrics,
        transcriptByRun.get(entry.run_id),
      );
      return {
        task_id: entry.task_id,
        category: meta.category,
        rep: entry.rep,
        run_id: entry.run_id,
        target_present: metrics.target_present === true,
        accepted: metrics.task_passed === true,
        frozen_primary_success: metrics.primary_success === true,
        raw_failure_kind: entry.failure_kind ?? null,
        post_hoc_transcript_candidate: recovered,
        lines_added: metrics.lines_added,
        lines_removed: metrics.lines_removed,
        duration_ms: entry.duration_ms,
        input_tokens: entry.input_tokens,
        output_tokens: entry.output_tokens,
        cache_read_input_tokens: entry.cache_read_input_tokens,
        reasoning_output_tokens: entry.reasoning_output_tokens,
      };
    })
    .sort(
      (a, b) =>
        a.task_id.localeCompare(b.task_id) ||
        a.rep - b.rep,
    );
  const taskIds = new Set(tasks.map((task) => task.task_id));
  if (
    taskIds.size !== 12 ||
    [...taskIds].some(
      (taskId) =>
        !tasks.some((task) => task.task_id === taskId && task.rep === 1) ||
        !tasks.some((task) => task.task_id === taskId && task.rep === 2),
    )
  ) {
    throw new Error('report requires 24 initial cells across 12 tasks and two reps');
  }
  const taskIdsArray = [...taskIds].sort();
  const discoveryRuns = tasks.map((task) => ({
    task_id: task.task_id,
    rep: task.rep,
    accept_passed: task.accepted,
    target_present: task.target_present,
  }));
  const acceptedTargetPositiveInitial = discoveryRuns.filter(
    (run) => run.accept_passed && run.target_present,
  ).length;
  const discovery3Jobs = discoveryRep3Jobs(taskIdsArray, discoveryRuns);
  const discovery3Outcomes = backendEntries.filter(
    (entry) => entry.stage === 'discovery3',
  );
  const confirmOutcomes = backendEntries.filter(
    (entry) => entry.stage === 'confirm',
  );
  const qualifiers = qualifyDiscovery(taskIdsArray, discoveryRuns);
  if (acceptedTargetPositiveInitial || discovery3Jobs.length) {
    throw new Error(
      'target-positive initial evidence contradicts the null stop',
    );
  }
  if (discovery3Outcomes.length) {
    throw new Error('discovery3 outcomes contradict the null stop');
  }
  if (qualifiers.length) {
    throw new Error('qualifiers contradict the null stop');
  }
  const noOpportunityConfirm = summarizeNoOpportunityConfirm(
    confirmOutcomes,
    metricsByRun,
    metaByTask,
  );
  const categories = {};
  for (const category of REPORT_CATEGORY_ORDER) {
    const rows = tasks.filter((task) => task.category === category);
    categories[category] = {
      total: rows.length,
      target_present: rows.filter((task) => task.target_present).length,
      accepted: rows.filter((task) => task.accepted).length,
      frozen_primary_success: rows.filter(
        (task) => task.frozen_primary_success,
      ).length,
    };
  }
  if (
    Object.values(categories).reduce((sum, category) => sum + category.total, 0) !==
    tasks.length
  ) {
    throw new Error('report encountered an unknown efficacy category');
  }
  const transcriptCandidates = tasks.filter(
    (task) => task.post_hoc_transcript_candidate,
  );
  const accepted = tasks.filter((task) => task.accepted).length;
  const targetPresent = tasks.filter((task) => task.target_present).length;
  const frozenPrimary = tasks.filter(
    (task) => task.frozen_primary_success,
  ).length;
  const confirmatoryRan = noOpportunityConfirm != null;
  const stopReason =
    discovery3Jobs.length === 0 && qualifiers.length === 0
      ? confirmatoryRan
        ? 'Discovery stop unchanged: no baseline target-positive runs. A user-directed no-opportunity confirmatory grid ran separately.'
        : 'Preregistered stop: no baseline target-positive runs, so no tasks qualified.'
      : null;
  const first = scoped[0];
  const legacyClaude = manifestEntries.filter(
    (entry) => entry.host === 'claude-code',
  );
  const preflights = preflightEvidence.map((entry) => ({
    preflight_id: entry.preflight_id,
    backend: entry.backend,
    success: entry.preflight_success === true,
    inference_started: entry.inference_started === true,
    write_proof_verified: entry.write_proof_verified === true,
    failure_kind: entry.failure_kind ?? null,
  }));
  return {
    schema_version: 1,
    raw_commit_sha: rawCommitSha,
    backend: CODEX_BACKEND_ID,
    environment: {
      host: first.host,
      host_version: first.host_version,
      model_requested: first.model_requested,
      model_id: first.model_id ?? null,
      model_observation: first.model_observation,
      reasoning_effort: first.effort,
      custom_agent_kind: first.custom_agent_kind,
      custom_agent_name: first.custom_agent_name,
      approval_mode: first.approval_mode,
      effective_sandbox: first.effective_sandbox,
      billing_kind: first.billing_kind,
    },
    discovery: {
      planned_initial_cells: 24,
      completed_initial_cells: tasks.length,
      target_present: targetPresent,
      accepted_target_positive_initial: acceptedTargetPositiveInitial,
      accepted,
      frozen_primary_success: frozenPrimary,
      discovery3_eligible_tasks: discovery3Jobs.length,
      discovery3_planned: discovery3Jobs.length,
      discovery3_outcomes: discovery3Outcomes.length,
      qualifiers: qualifiers.length,
      confirm_outcomes: qualifiers.length ? confirmOutcomes.length : 0,
    },
    categories,
    tasks,
    aggregate: {
      loc: {
        added: tasks.reduce((sum, task) => sum + task.lines_added, 0),
        removed: tasks.reduce((sum, task) => sum + task.lines_removed, 0),
      },
      duration_ms: numericSummary(tasks.map((task) => task.duration_ms)),
      tokens: {
        input: numericSummary(tasks.map((task) => task.input_tokens)),
        output: numericSummary(tasks.map((task) => task.output_tokens)),
        cache_read: numericSummary(
          tasks.map((task) => task.cache_read_input_tokens),
        ),
        noncached_input: numericSummary(
          tasks.map(
            (task) => task.input_tokens - task.cache_read_input_tokens,
          ),
        ),
        reasoning: numericSummary(
          tasks.map((task) => task.reasoning_output_tokens),
        ),
      },
      incremental_cost_usd: tasks.reduce(
        (sum, task) =>
          sum +
          (metricsByRun.get(task.run_id)?.total_cost_usd ?? 0),
        0,
      ),
    },
    post_hoc_sensitivity: {
      label: 'post_hoc_transcript_based_upper_bound',
      top_level_exit_code_sealed: false,
      transcript_candidate_runs: transcriptCandidates.length,
      upper_bound_primary_success:
        frozenPrimary + transcriptCandidates.length,
      primary_total: tasks.length,
      primary_rate_percent:
        Math.round(
          ((frozenPrimary + transcriptCandidates.length) / tasks.length) *
            10_000,
        ) /
        100,
      changes_stop_decision: discovery3Jobs.length > 0,
    },
    preflight_history: {
      attempts: preflights.length,
      successful: preflights.filter((entry) => entry.success).length,
      entries: preflights,
    },
    legacy_claude: {
      attempts: legacyClaude.length,
      subscription_403: legacyClaude.filter(
        (entry) =>
          entry.failure_kind === 'api' &&
          /disabled Claude subscription access/i.test(String(entry.error || '')),
      ).length,
      input_tokens: legacyClaude.reduce(
        (sum, entry) => sum + (entry.input_tokens || 0),
        0,
      ),
      output_tokens: legacyClaude.reduce(
        (sum, entry) => sum + (entry.output_tokens || 0),
        0,
      ),
      reported_cost_usd: legacyClaude.reduce(
        (sum, entry) => sum + (entry.total_cost_usd || 0),
        0,
      ),
    },
    positive_claim: false,
    efficacy_estimate: null,
    confirmatory_ran: confirmatoryRan,
    no_opportunity_confirm: noOpportunityConfirm,
    stop_reason: stopReason,
    conclusion:
      'No efficacy estimate. This is not evidence of no effect; enrichment failed for this model/profile or the baseline was already target-free. No off/full claim is supported.',
  };
}

function noOpportunityConfirmMarkdown(grid) {
  if (!grid) return [];
  const armLine = (name, row) =>
    `- \`${name}\`: accepted ${row.accepted}/${row.cells}, target ${row.target_present}/${row.cells}, primary ${row.primary_success}/${row.cells} (frozen ${row.frozen_primary_success}/${row.cells}), LOC +${row.lines_added}/-${row.lines_removed}`;
  return [
    '## No-opportunity confirmatory grid',
    '',
    `User-directed override after the discovery stop. Six tasks (${grid.task_ids.map((id) => `\`${id}\``).join(', ')}), ${grid.completed_cells}/${grid.planned_cells} cells. This is not an Offcut efficacy estimate.`,
    '',
    'Primary counts accepted target-free cells whose sealed failure_kind is not retryable. Frozen primary still requires `failure_kind==null` and is not comparable across arms for cells classified before the CLI-warning fix.',
    '',
    armLine('off', grid.off),
    armLine('full', grid.full),
    '',
  ];
}

function efficacyReportMarkdown(analysis) {
  const categoryLines = REPORT_CATEGORY_ORDER.map((category) => {
    const row = analysis.categories[category];
    return `- \`${category}\`: target ${row.target_present}/${row.total}, accepted ${row.accepted}/${row.total}, frozen primary ${row.frozen_primary_success}/${row.total}`;
  });
  const taskLines = [...new Set(analysis.tasks.map((task) => task.task_id))].map(
    (taskId) => {
      const rows = analysis.tasks.filter((task) => task.task_id === taskId);
      return `- \`${taskId}\`: target ${rows.filter((row) => row.target_present).length}/${rows.length}, accepted ${rows.filter((row) => row.accepted).length}/${rows.length}, frozen primary ${rows.filter((row) => row.frozen_primary_success).length}/${rows.length}`;
    },
  );
  return [
    '# Phase 11 efficacy result',
    '',
    `Raw evidence commit: \`${analysis.raw_commit_sha}\``,
    '',
    '## Result',
    '',
    `All ${analysis.discovery.completed_initial_cells}/24 initial Codex discovery cells completed. Target prevalence was 0/24, acceptance was ${analysis.discovery.accepted}/24, and the preregistered frozen primary outcome was ${analysis.discovery.frozen_primary_success}/24.`,
    '',
    analysis.stop_reason,
    '',
    '**Conclusion:** No efficacy estimate. This is not evidence of no effect; enrichment failed for this model/profile or the baseline was already target-free. No off/full claim is supported.',
    '',
    ...noOpportunityConfirmMarkdown(analysis.no_opportunity_confirm),
    '## Post-hoc sensitivity',
    '',
    `The sealed transcripts contain ${analysis.post_hoc_sensitivity.transcript_candidate_runs} runs with terminal \`turn.completed\`, valid usage, and only recoverable item-level tool failures. If those transcript conditions are treated as completion, primary success would be ${analysis.post_hoc_sensitivity.upper_bound_primary_success}/${analysis.post_hoc_sensitivity.primary_total} (${analysis.post_hoc_sensitivity.primary_rate_percent.toFixed(2)}%).`,
    '',
    'This is a transcript-based post-hoc upper bound, not a corrected outcome. The top-level exit code was not sealed for these runs, so the frozen 17/24 remains authoritative and the sensitivity cannot replace it. It does not change the stop decision because target prevalence remains 0/24.',
    '',
    '## Categories',
    '',
    ...categoryLines,
    '',
    '## Tasks',
    '',
    ...taskLines,
    '',
    '## Cost and telemetry',
    '',
    `- LOC: +${analysis.aggregate.loc.added}/-${analysis.aggregate.loc.removed}`,
    `- Duration: ${analysis.aggregate.duration_ms.total} ms total; median ${analysis.aggregate.duration_ms.median} ms; range ${analysis.aggregate.duration_ms.min}-${analysis.aggregate.duration_ms.max} ms`,
    `- Input tokens: ${analysis.aggregate.tokens.input.total}; median ${analysis.aggregate.tokens.input.median}`,
    `- Output tokens: ${analysis.aggregate.tokens.output.total}; median ${analysis.aggregate.tokens.output.median}`,
    `- Cache-read input tokens: ${analysis.aggregate.tokens.cache_read.total}; median ${analysis.aggregate.tokens.cache_read.median}`,
    `- Noncached input tokens: ${analysis.aggregate.tokens.noncached_input.total}`,
    `- Reasoning output tokens: ${analysis.aggregate.tokens.reasoning.total}; median ${analysis.aggregate.tokens.reasoning.median}`,
    `- Incremental API billing: $${analysis.aggregate.incremental_cost_usd} (ChatGPT subscription; membership cost not measured)`,
    '',
    '## Environment and history',
    '',
    `Codex CLI ${analysis.environment.host_version}, requested model \`${analysis.environment.model_requested}\` (${analysis.environment.model_observation}; observed model ID unavailable), low reasoning, named \`${analysis.environment.custom_agent_name}\` profile, ${analysis.environment.approval_mode}, ${analysis.environment.effective_sandbox}.`,
    '',
    `${analysis.preflight_history.attempts} Codex preflights preceded discovery; ${analysis.preflight_history.successful} passed the final write proof. ${analysis.legacy_claude.attempts} legacy Claude attempts separately ended in subscription-disabled 403 responses with zero tokens and zero reported cost.`,
    '',
  ].join('\n');
}

function rawEvidenceCommit(spawnGit, repoRoot) {
  const result = spawnGit(
    'git',
    [
      'log',
      '-1',
      '--format=%H',
      '--',
      'bench/efficacy-manifest.jsonl',
      'bench/efficacy-cost.jsonl',
      'bench/runs',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const commit = String(result.stdout || '').trim();
  if (result.status !== 0 || !/^[a-f0-9]{40}$/.test(commit)) {
    throw new Error('raw-result commit gate could not resolve evidence commit');
  }
  return commit;
}

export function publishEfficacyReport({
  repoRoot = path.dirname(BENCH_ROOT),
  manifestPath = EFFICACY_MANIFEST_PATH,
  runsDir = RUNS_DIR,
  tasksDir = EFFICACY_TASKS_DIR,
  preflightLedgerPath = CODEX_PREFLIGHT_LEDGER_PATH,
  analysisPath = EFFICACY_ANALYSIS_PATH,
  reportPath = EFFICACY_RESULTS_PATH,
  spawnGit = spawnSync,
} = {}) {
  assertRawGateCommitted({ spawnGit, repoRoot });
  const rawCommitSha = rawEvidenceCommit(spawnGit, repoRoot);
  const manifestEntries = readManifest(manifestPath);
  const scoped = manifestEntries.filter(
    (entry) => entry.backend === CODEX_BACKEND_ID,
  );
  const metricsByRun = new Map();
  const transcriptByRun = new Map();
  for (const entry of scoped) {
    const runDir = path.join(runsDir, entry.run_id);
    const metricsPath = path.join(runDir, 'metrics.json');
    if (fs.existsSync(metricsPath)) {
      metricsByRun.set(
        entry.run_id,
        JSON.parse(fs.readFileSync(metricsPath, 'utf8')),
      );
    }
    const transcriptPath = path.join(runDir, 'transcript.jsonl');
    if (fs.existsSync(transcriptPath)) {
      transcriptByRun.set(
        entry.run_id,
        fs.readFileSync(transcriptPath, 'utf8'),
      );
    }
  }
  const taskMetas = loadEfficacyTasks(tasksDir).map(
    ({ id, category }) => ({ id, category }),
  );
  const analysis = buildEfficacyAnalysis({
    manifestEntries,
    metricsByRun,
    taskMetas,
    transcriptByRun,
    preflightEvidence: readCostLedger(preflightLedgerPath),
    rawCommitSha,
  });
  fs.mkdirSync(path.dirname(analysisPath), { recursive: true });
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(
    analysisPath,
    `${JSON.stringify(analysis, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(reportPath, efficacyReportMarkdown(analysis), 'utf8');
  return analysis;
}

export function planStage(stage, tasks, outcomes, backend) {
  const scopedOutcomes = backend
    ? outcomes.filter((outcome) => outcome.backend === backend)
    : outcomes;
  const taskIds = tasks.map((task) => task.id);
  const discoveryOutcomes = scopedOutcomes.filter(
    (outcome) =>
      outcome.stage == null ||
      outcome.stage === 'discovery12' ||
      outcome.stage === 'discovery3',
  );
  if (stage === 'discovery12') {
    const jobs = [];
    for (let rep = 1; rep <= 2; rep++) {
      for (const taskId of taskIds) jobs.push({ taskId, arm: 'off', rep });
    }
    return omitCompleted(jobs, scopedOutcomes, stage, backend);
  }
  if (stage === 'discovery3') {
    assertDiscoveryComplete(stage, taskIds, discoveryOutcomes);
    return omitCompleted(
      discoveryRep3Jobs(taskIds, discoveryOutcomes),
      scopedOutcomes,
      stage,
      backend,
    );
  }
  assertDiscoveryComplete(stage, taskIds, discoveryOutcomes);
  const summaries = qualifyDiscovery(taskIds, discoveryOutcomes)
    .map((summary) => ({
      ...summary,
      category: tasks.find((task) => task.id === summary.task_id)?.category,
    }));
  if (stage === 'confirm') {
    let qualifiers = selectQualifiers(summaries);
    if (qualifiers.length === 0) {
      const targetPositive = discoveryOutcomes.some(
        (outcome) => outcome.accept_passed === true && outcome.target_present === true,
      );
      if (!targetPositive) qualifiers = selectNoOpportunityTasks(tasks);
    }
    return omitCompleted(
      confirmatorySchedule(qualifiers, 8),
      scopedOutcomes,
      stage,
      backend,
    );
  }
  throw new Error(`bad efficacy stage: ${stage}`);
}

function measurePaidRun(taskDir, runDir, failureKind) {
  const diff = fs.readFileSync(path.join(runDir, 'diff.patch'), 'utf8');
  const accept = JSON.parse(fs.readFileSync(path.join(runDir, 'accept.json'), 'utf8'));
  const measured = runBlindMeasure(taskDir, diff, path.join(runDir, 'work'), accept);
  const metricsPath = path.join(runDir, 'metrics.json');
  const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
  const outcome = {
    ...metrics,
    target_present: measured.target_present,
    primary_success: primarySuccess({
      accept_passed: metrics.task_passed === true,
      target_present: measured.target_present,
      failure_kind: failureKind,
    }),
    target_measurement: measured,
  };
  fs.writeFileSync(metricsPath, `${JSON.stringify(outcome, null, 2)}\n`, 'utf8');
  fs.writeFileSync(
    path.join(runDir, 'target.json'),
    `${JSON.stringify(measured, null, 2)}\n`,
    'utf8',
  );
  return outcome;
}

function assertClaudeVersion() {
  const result = spawnSync('claude', ['--version'], { encoding: 'utf8' });
  const version = (result.stdout || result.stderr || '').trim();
  const exactVersion = new RegExp(
    `^${CLAUDE_CODE_VERSION.replace(/\./g, '\\.')}(?:\\s|$)`,
  );
  if (result.status !== 0 || !exactVersion.test(version)) {
    throw new Error(`Claude Code ${CLAUDE_CODE_VERSION} required; found ${version || 'unavailable'}`);
  }
}

export function assertCodexVersion(spawnHost = spawnSync) {
  const result = spawnHost('codex', ['--version'], { encoding: 'utf8' });
  const version = (result.stdout || result.stderr || '').trim();
  if (
    result.status !== 0 ||
    !new RegExp(`^codex-cli ${CODEX_HOST_VERSION.replace(/\./g, '\\.')}(?:\\s|$)`).test(
      version,
    )
  ) {
    throw new Error(`Codex CLI ${CODEX_HOST_VERSION} required; found ${version || 'unavailable'}`);
  }
  return version;
}

function validatePreparedCodexHome(homeDir, arm) {
  const entries = fs.readdirSync(homeDir).sort();
  if (
    JSON.stringify(entries) !==
    JSON.stringify([
      'auth.json',
      'config.toml',
      'hooks.json',
      `${CODEX_CUSTOM_AGENT_NAME}.config.toml`,
    ].sort())
  ) {
    throw new Error(`unexpected isolated CODEX_HOME entries: ${entries.join(', ')}`);
  }
  const config = fs.readFileSync(path.join(homeDir, 'config.toml'), 'utf8');
  const profileConfig = fs.readFileSync(
    path.join(homeDir, `${CODEX_CUSTOM_AGENT_NAME}.config.toml`),
    'utf8',
  );
  const hooks = JSON.parse(fs.readFileSync(path.join(homeDir, 'hooks.json'), 'utf8'));
  const defaultPermissions =
    config.match(/^default_permissions\s*=.*$/gm) || [];
  if (
    defaultPermissions.length !== 1 ||
    defaultPermissions[0] !== 'default_permissions = ":workspace"' ||
    config.indexOf(defaultPermissions[0]) > config.indexOf('[') ||
    (config.match(/^include_instructions = false$/gm) || []).length !== 1 ||
    !/\[skills\]\r?\ninclude_instructions = false/.test(config) ||
    !config.includes('multi_agent = false') ||
    !config.includes('hooks = true')
  ) {
    throw new Error('isolated Codex config does not match the frozen contract');
  }
  if (
    !profileConfig.includes(`model = "${CODEX_MODEL_ID}"`) ||
    !profileConfig.includes('model_reasoning_effort = "low"') ||
    !profileConfig.includes('default_permissions = ":workspace"') ||
    !profileConfig.includes(
      `developer_instructions = ${JSON.stringify(CODEX_PROFILE_INSTRUCTIONS)}`,
    )
  ) {
    throw new Error('isolated Codex named profile does not match the frozen contract');
  }
  if (
    /\b(?:offcut|efficacy|experiment|treatment|control|baseline|minimal|simple|cheap|dependenc|abstract)\b/i.test(
      profileConfig,
    )
  ) {
    throw new Error('Codex profile contains prohibited treatment framing');
  }
  const auditEvents = ['SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse'];
  for (const event of auditEvents) {
    const audit = hooks.hooks?.[event]?.find((group) =>
      group.hooks?.some((hook) =>
        String(hook.command || '').includes('codex-agent-audit.mjs'),
      ),
    );
    if (!audit) throw new Error(`${arm} arm missing ${event} agent audit hook`);
    if (
      (event === 'PreToolUse' || event === 'PostToolUse') &&
      Object.hasOwn(audit, 'matcher')
    ) {
      throw new Error(`${arm} arm ${event} agent audit must capture every tool`);
    }
  }
  if (
    arm === 'off' &&
    (Object.keys(hooks.hooks || {}).sort().join(',') !==
      [...auditEvents].sort().join(',') ||
      auditEvents.some((event) => hooks.hooks[event].length !== 1))
  ) {
    throw new Error('off arm Codex hooks must contain only agent audit hooks');
  }
  if (arm === 'full') {
    for (const event of ['PreToolUse', 'PostToolUse']) {
      if (!hooks.hooks?.[event]?.[0]?.matcher?.includes('apply_patch')) {
        throw new Error(`full arm ${event} must match apply_patch`);
      }
    }
  }
}

export function codexPreflight({
  authPath = path.join(os.homedir(), '.codex', 'auth.json'),
  tempRoot = os.tmpdir(),
  spawnHost = spawnSync,
} = {}) {
  const version = assertCodexVersion(spawnHost);
  if (!fs.existsSync(authPath)) throw new Error('Codex auth file missing');
  const prepared = [];
  let profileConfigSha256 = null;
  try {
    for (const arm of ['off', 'full']) {
      const isolated = prepareCodexHome({ arm, authPath, parentDir: tempRoot });
      prepared.push(isolated.homeDir);
      profileConfigSha256 ??= isolated.profile_config_sha256;
      validatePreparedCodexHome(isolated.homeDir, arm);
      const env = buildIsolatedCodexEnv({
        homeDir: isolated.homeDir,
        stateDir: path.join(isolated.homeDir, 'state'),
        auditPath: path.join(isolated.homeDir, 'agent-audit.jsonl'),
      });
      if (
        !verifyCodexChatGptLogin(spawnHost, {
          cwd: tempRoot,
          encoding: 'utf8',
          env,
          maxBuffer: 1024 * 1024,
        }).ok
      ) {
        throw new Error('Codex ChatGPT authentication required');
      }
    }
    const prompt = 'Preflight ticket bytes.\n';
    const args = buildCodexArgs({ workDir: tempRoot, prompt });
    const expectedPrefix = [
      '--approve-for-me',
      '--dangerously-bypass-hook-trust',
      '--profile',
      CODEX_CUSTOM_AGENT_NAME,
      '-C',
      tempRoot,
      'exec',
      '--json',
      '--ephemeral',
    ];
    if (
      JSON.stringify(args.slice(0, expectedPrefix.length)) !==
      JSON.stringify(expectedPrefix) ||
      args.includes('--sandbox') ||
      args.includes('--ask-for-approval') ||
      args.includes('--dangerously-bypass-approvals-and-sandbox') ||
      args.includes('--max-budget-usd')
    ) {
      throw new Error('Codex CLI arguments do not match the frozen contract');
    }
    return {
      ok: true,
      host: CODEX_HOST,
      host_version: version,
      backend: CODEX_BACKEND_ID,
      model_requested: CODEX_MODEL_ID,
      custom_agent_kind: CODEX_CUSTOM_AGENT_KIND,
      custom_agent_name: CODEX_CUSTOM_AGENT_NAME,
      approval_mode: CODEX_APPROVAL_MODE,
      effective_sandbox: CODEX_EFFECTIVE_SANDBOX,
      profile_config_sha256: profileConfigSha256,
      auth_kind: 'chatgpt',
    };
  } finally {
    for (const homeDir of prepared) cleanupCodexHome(homeDir);
  }
}

export function codexLivePreflight({
  execute,
  authPath = path.join(os.homedir(), '.codex', 'auth.json'),
  evidenceRoot = CODEX_PREFLIGHT_ROOT,
  ledgerPath = CODEX_PREFLIGHT_LEDGER_PATH,
  spawnCodex = spawnSync,
} = {}) {
  if (!execute) throw new Error('Codex live preflight requires explicit --execute');
  const prior = readCostLedger(ledgerPath);
  if (
    prior.some(
      (entry) =>
        entry.backend === CODEX_BACKEND_ID &&
        entry.preflight_success === true &&
        entry.custom_agent_verified === true,
    )
  ) {
    throw new Error('successful Codex live preflight already exists');
  }
  const preflightId = opaqueId();
  const evidenceDir = path.join(evidenceRoot, preflightId);
  const workParent = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-codex-live-preflight-'));
  const workDir = path.join(workParent, 'repo');
  const stateDir = path.join(workParent, 'state');
  let agent;
  try {
    fs.mkdirSync(workDir);
    fs.mkdirSync(evidenceDir, { recursive: true });
    fs.writeFileSync(path.join(workDir, 'README.md'), 'Temporary Codex profile preflight.\n');
    initGitRepo(workDir);
    writeMode(stateDir, 'off');
    agent = runCodex({
      workDir,
      prompt: [
        `Create ${CODEX_PREFLIGHT_PROOF_FILE} using your tools.`,
        'Its exact UTF-8 content must be one line: ticket-worker-write-ok followed by a newline.',
        'Do not modify any other file. Then report READY.',
      ].join(' '),
      arm: 'off',
      stateDir,
      authPath,
      auditPath: path.join(evidenceDir, 'agent-audit.jsonl'),
      spawnCodex,
    });
    const proofPath = path.join(workDir, CODEX_PREFLIGHT_PROOF_FILE);
    const proofContent = fs.existsSync(proofPath)
      ? fs.readFileSync(proofPath)
      : null;
    const proofDiff = captureDiff(workDir);
    const changedFiles = [
      ...proofDiff.matchAll(/^diff --git a\/(.+?) b\/(.+)$/gm),
    ];
    const writeProofVerified =
      proofContent?.equals(Buffer.from(CODEX_PREFLIGHT_PROOF_CONTENT)) === true &&
      changedFiles.length === 1 &&
      changedFiles[0][1] === CODEX_PREFLIGHT_PROOF_FILE &&
      changedFiles[0][2] === CODEX_PREFLIGHT_PROOF_FILE &&
      agent.rootCompletedWriteToolCount > 0;
    const preflightSuccess = agent.ok && writeProofVerified;
    fs.writeFileSync(
      path.join(evidenceDir, 'transcript.jsonl'),
      agent.transcript || '',
      'utf8',
    );
    if (agent.stderr) {
      fs.writeFileSync(
        path.join(evidenceDir, 'stderr.txt'),
        agent.stderr,
        'utf8',
      );
    }
    const evidence = {
      ok: preflightSuccess,
      preflight_id: preflightId,
      backend: CODEX_BACKEND_ID,
      host: CODEX_HOST,
      host_version: CODEX_HOST_VERSION,
      model_requested: CODEX_MODEL_ID,
      model_id: agent.modelId,
      model_observation: agent.modelObservation,
      auth_kind: agent.authKind,
      custom_agent_kind: CODEX_CUSTOM_AGENT_KIND,
      custom_agent_name: CODEX_CUSTOM_AGENT_NAME,
      approval_mode: CODEX_APPROVAL_MODE,
      effective_sandbox: CODEX_EFFECTIVE_SANDBOX,
      custom_agent_verified: agent.customAgentVerified,
      verified: preflightSuccess,
      preflight_success: preflightSuccess,
      write_proof_verified: writeProofVerified,
      proof_sha256: proofContent ? sha256(proofContent) : null,
      diff_sha256: sha256(proofDiff),
      process_started: agent.processStarted,
      inference_started: agent.inferenceStarted,
      warning_count: agent.warningCount,
      user_assets_isolated: agent.userAssetsIsolated,
      recoverable_tool_failures: agent.recoverableToolFailures ?? [],
      recoverable_tool_failure_count:
        agent.recoverableToolFailureCount ?? 0,
      exit_code: agent.exitCode,
      error:
        agent.error ||
        (writeProofVerified ? null : 'Codex profile write proof missing or invalid'),
      billing_kind: agent.cost_evidence?.kind === 'subscription'
        ? 'chatgpt_subscription'
        : null,
      total_cost_usd: agent.telemetry?.total_cost_usd ?? null,
      duration_ms: agent.telemetry?.duration_ms ?? null,
      input_tokens: agent.telemetry?.input_tokens ?? null,
      output_tokens: agent.telemetry?.output_tokens ?? null,
      cache_read_input_tokens: agent.telemetry?.cache_read_input_tokens ?? null,
      cache_creation_input_tokens:
        agent.telemetry?.cache_creation_input_tokens ?? null,
      reasoning_output_tokens:
        agent.telemetry?.reasoning_output_tokens ?? null,
      cost_evidence: agent.cost_evidence,
      prompt_sha256: agent.prompt_sha256,
      config_sha256: agent.config_sha256,
      profile_config_sha256: agent.profile_config_sha256,
      hooks_sha256: agent.hooks_sha256,
      failure_kind: preflightSuccess
        ? null
        : agent.ok
          ? 'model'
          : agent.failureKind,
    };
    fs.writeFileSync(
      path.join(evidenceDir, 'evidence.json'),
      `${JSON.stringify(evidence, null, 2)}\n`,
      'utf8',
    );
    appendCostAttempt(ledgerPath, evidence);
    return evidence;
  } finally {
    fs.rmSync(workParent, { recursive: true, force: true });
  }
}

function assertPaidInputsCommitted() {
  const result = spawnSync('git', ['status', '--porcelain'], {
    cwd: path.dirname(BENCH_ROOT),
    encoding: 'utf8',
  });
  if (result.status !== 0 || result.stdout.trim()) {
    throw new Error('paid execution requires committed harness, fixtures, and prior attempts');
  }
}

function appendAttemptLedger(
  job,
  stage,
  attempt,
  runResult,
  failureKind,
  ledgerPath,
  backend,
) {
  const cost = runResult?.record?.total_cost_usd;
  const costEvidence = runResult?.record?.cost_evidence ?? null;
  const knownPreCallZero =
    isRetryableFailure(failureKind) &&
    costEvidence?.kind === 'known_zero';
  const measuredCost = Number.isFinite(cost) && cost >= 0;
  const telemetryAnomaly = !measuredCost && !knownPreCallZero;
  const entry = {
    attempt_id: runResult?.runId || `host-${Date.now()}-${attempt}`,
    run_id: runResult?.runId || null,
    stage,
    task_id: job.taskId,
    arm: job.arm,
    rep: job.rep,
    attempt,
    failure_kind: telemetryAnomaly ? 'telemetry' : failureKind,
    telemetry_anomaly: telemetryAnomaly,
    cost_evidence: costEvidence,
    total_cost_usd: measuredCost ? cost : knownPreCallZero ? 0 : null,
    duration_ms: runResult?.record?.duration_ms ?? null,
    input_tokens: runResult?.record?.input_tokens ?? null,
    output_tokens: runResult?.record?.output_tokens ?? null,
    cache_read_input_tokens: runResult?.record?.cache_read_input_tokens ?? null,
    cache_creation_input_tokens: runResult?.record?.cache_creation_input_tokens ?? null,
    reasoning_output_tokens: runResult?.record?.reasoning_output_tokens ?? null,
    ...(backend
      ? {
          backend,
          host: runResult?.record?.host ?? CODEX_HOST,
          host_version: runResult?.record?.host_version ?? CODEX_HOST_VERSION,
          model_requested:
            runResult?.record?.model_requested ?? CODEX_MODEL_ID,
          model_id: runResult?.record?.model_id ?? null,
          model_observation:
            runResult?.record?.model_observation ?? 'requested_not_reported',
          custom_agent_kind:
            runResult?.record?.custom_agent_kind ?? CODEX_CUSTOM_AGENT_KIND,
          custom_agent_name:
            runResult?.record?.custom_agent_name ?? CODEX_CUSTOM_AGENT_NAME,
          approval_mode:
            runResult?.record?.approval_mode ?? CODEX_APPROVAL_MODE,
          effective_sandbox:
            runResult?.record?.effective_sandbox ?? CODEX_EFFECTIVE_SANDBOX,
          exit_code: runResult?.record?.exit_code ?? null,
          custom_agent_verified:
            runResult?.record?.custom_agent_verified === true,
          user_assets_isolated:
            runResult?.record?.user_assets_isolated === true,
          recoverable_tool_failures:
            runResult?.record?.recoverable_tool_failures ?? [],
          recoverable_tool_failure_count:
            runResult?.record?.recoverable_tool_failure_count ?? 0,
          verified:
            runResult?.record?.verified === true ||
            runResult?.record?.custom_agent_verified === true,
          billing_kind: runResult?.record?.billing_kind ?? null,
          auth_kind: runResult?.record?.auth_kind ?? null,
          config_sha256: runResult?.record?.config_sha256 ?? null,
          profile_config_sha256:
            runResult?.record?.profile_config_sha256 ?? null,
          hooks_sha256: runResult?.record?.hooks_sha256 ?? null,
        }
      : {}),
  };
  appendCostAttempt(ledgerPath, entry);
  return entry;
}

const MAX_CELL_ATTEMPTS = 3;

function measureSettledAttempt(taskDir, runDir, failureKind, measureRunFn) {
  if (!runDir || !fs.existsSync(path.join(runDir, 'diff.patch'))) return;
  if (!fs.existsSync(path.join(runDir, 'accept.json'))) return;
  if (!fs.existsSync(path.join(runDir, 'work'))) return;
  const metricsPath = path.join(runDir, 'metrics.json');
  if (fs.existsSync(metricsPath)) {
    try {
      const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      if (typeof metrics.target_present === 'boolean') return;
    } catch {
      // re-measure unreadable metrics
    }
  }
  measureRunFn(taskDir, runDir, failureKind);
}

function settleExhaustedCell(task, cellAttempts, measureRunFn, runsDir) {
  const last = cellAttempts[cellAttempts.length - 1];
  if (!last?.run_id) return;
  // offcut: last attempt looked up as runs/<id>; store runDir on the ledger if that ever diverges
  measureSettledAttempt(
    task.dir,
    path.join(runsDir, last.run_id),
    last.failure_kind,
    measureRunFn,
  );
}

export function executeJobs(
  jobs,
  tasks,
  stage,
  options = {},
) {
  const manifestPath = options.manifestPath ?? EFFICACY_MANIFEST_PATH;
  const ledgerPath = options.ledgerPath ?? EFFICACY_COST_PATH;
  const model = options.model ?? MODEL_ID;
  const backend = options.backend ?? null;
  const isCodex = backend === CODEX_BACKEND_ID;
  const runOneFn = options.runOneFn ?? runOne;
  const measureRunFn = options.measureRunFn ?? measurePaidRun;
  const runsDir = options.runsDir ?? RUNS_DIR;
  for (const job of jobs) {
    const task = tasks.find((candidate) => candidate.id === job.taskId);
    if (!task) throw new Error(`unknown efficacy task: ${job.taskId}`);
    while (true) {
      const ledger = readCostLedger(ledgerPath);
      const backendLedger = backend
        ? ledger.filter((entry) => entry.backend === backend)
        : ledger;
      if (hasCostTelemetryAnomaly(backendLedger)) {
        throw new Error('cost telemetry anomaly previously recorded; scheduling stopped');
      }
      const cellAttempts = ledger.filter(
        (entry) =>
          entry.stage === stage &&
          (!backend || entry.backend === backend) &&
          entry.task_id === job.taskId &&
          entry.arm === job.arm &&
          entry.rep === job.rep,
      );
      if (cellAttempts.length >= MAX_CELL_ATTEMPTS) {
        settleExhaustedCell(task, cellAttempts, measureRunFn, runsDir);
        break;
      }
      const attempt = cellAttempts.length + 1;
      const allowance = isCodex ? null : budgetAllowance(ledger);
      if (!isCodex && allowance == null) {
        throw new Error('efficacy budget guard stopped execution');
      }
      let runResult = null;
      let failureKind = null;
      let ledgerEntry = null;
      try {
        const runOptions = {
          task: job.taskId,
          arm: job.arm,
          rep: job.rep,
          model: isCodex ? CODEX_MODEL_ID : model,
          tasksDir: path.dirname(task.dir),
          manifestPath,
          stage,
          attempt,
          apiRetries: 0,
          ...(backend
            ? {
                backend,
                host: CODEX_HOST,
                hostVersion: CODEX_HOST_VERSION,
              }
            : { maxBudgetUsd: allowance }),
        };
        runResult = runOneFn(runOptions);
        failureKind = runResult.record.failure_kind;
        const cost = runResult.record.total_cost_usd;
        if (Number.isFinite(cost) && cost >= 0 && !isRetryableFailure(failureKind)) {
          measureRunFn(task.dir, runResult.runDir, failureKind);
        }
      } catch (error) {
        failureKind = 'infrastructure';
        if (runResult) runResult.record.error = String(error?.message || error);
      } finally {
        ledgerEntry = appendAttemptLedger(
          job,
          stage,
          attempt,
          runResult,
          failureKind,
          ledgerPath,
          backend,
        );
      }
      if (ledgerEntry.telemetry_anomaly) {
        throw new Error('cost telemetry anomaly; preserved attempt and stopped scheduling');
      }
      const after = readCostLedger(ledgerPath);
      const spent = after
        .filter((row) => !backend || row.backend === backend)
        .reduce((sum, row) => sum + row.total_cost_usd, 0);
      if (!isCodex && spent > EFFICACY_BUDGET_USD) {
        throw new Error('telemetry exceeded the efficacy budget ceiling; preserved attempt and stopped');
      }
      if (!isRetryableFailure(failureKind)) break;
      if (attempt >= MAX_CELL_ATTEMPTS) {
        measureSettledAttempt(task.dir, runResult?.runDir, failureKind, measureRunFn);
        break;
      }
    }
  }
}

function parseArgs(argv) {
  const options = {
    selftest: false,
    printPlan: false,
    execute: false,
    report: false,
    codexPreflight: false,
    codexLivePreflight: false,
    stage: null,
    tasksDir: EFFICACY_TASKS_DIR,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--selftest') options.selftest = true;
    else if (arg === '--print-plan') options.printPlan = true;
    else if (arg === '--execute') options.execute = true;
    else if (arg === '--report') options.report = true;
    else if (arg === '--codex-preflight') options.codexPreflight = true;
    else if (arg === '--codex-live-preflight') options.codexLivePreflight = true;
    else if (arg === '--stage') options.stage = argv[++index];
    else if (arg === '--tasks-dir') options.tasksDir = path.resolve(argv[++index]);
    else if (arg === '--help') options.help = true;
    else throw new Error(`unknown argument: ${arg}`);
  }
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      'Usage: node bench/efficacy.mjs --report | --selftest | --codex-preflight | --codex-live-preflight --execute | --print-plan [--stage NAME] | --stage discovery12|discovery3|confirm --execute',
    );
    return;
  }
  if (options.codexLivePreflight && !options.execute) {
    console.error('Codex live preflight requires explicit --execute');
    process.exitCode = 2;
    return;
  }
  if (options.report) {
    const analysis = publishEfficacyReport();
    console.log(
      JSON.stringify(
        {
          ok: true,
          analysis_path: path.relative(path.dirname(BENCH_ROOT), EFFICACY_ANALYSIS_PATH),
          report_path: path.relative(path.dirname(BENCH_ROOT), EFFICACY_RESULTS_PATH),
          raw_commit_sha: analysis.raw_commit_sha,
          completed_initial_cells: analysis.discovery.completed_initial_cells,
          target_present: analysis.discovery.target_present,
          qualifiers: analysis.discovery.qualifiers,
          confirmatory_ran: analysis.confirmatory_ran,
        },
        null,
        2,
      ),
    );
    return;
  }
  if (options.codexPreflight) {
    console.log(JSON.stringify(codexPreflight(), null, 2));
    return;
  }
  if (options.codexLivePreflight) {
    codexPreflight();
    console.log(JSON.stringify(codexLivePreflight({ execute: true }), null, 2));
    return;
  }
  if (options.stage && !options.execute && !options.printPlan) {
    console.error(`paid stage ${options.stage} requires explicit --execute`);
    process.exitCode = 2;
    return;
  }
  if (options.stage && !['discovery12', 'discovery3', 'confirm'].includes(options.stage)) {
    throw new Error(`bad efficacy stage: ${options.stage}; Haiku replication is retired`);
  }
  const tasks = loadEfficacyTasks(options.tasksDir, !options.printPlan);
  if (options.selftest) {
    console.log(JSON.stringify(tasks.map((task) => selftestTask(task.dir)), null, 2));
    return;
  }
  const outcomes = loadMeasuredOutcomes(EFFICACY_MANIFEST_PATH, CODEX_BACKEND_ID);
  const stages = options.stage
    ? [options.stage]
    : ['discovery12', 'discovery3', 'confirm'];
  const plans = {};
  for (const stage of stages) {
    if (options.printPlan && outcomes.length === 0 && stage !== 'discovery12') {
      plans[stage] = [];
      continue;
    }
    if (outcomes.length && stage === 'confirm') {
      assertRawGateCommitted();
    }
    plans[stage] = planStage(stage, tasks, outcomes, CODEX_BACKEND_ID);
  }
  if (options.printPlan) {
    console.log(JSON.stringify(plans, null, 2));
    return;
  }
  assertPaidInputsCommitted();
  codexPreflight();
  executeJobs(plans[options.stage], tasks, options.stage, {
    backend: CODEX_BACKEND_ID,
    model: CODEX_MODEL_ID,
  });
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) main();
