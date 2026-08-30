import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { appendManifest, sha256 } from '../bench/lib.mjs';

const EFFICACY_TASKS = Object.freeze({
  'asset-base-url': 'new-config-surface',
  'audit-redactor': 'speculative-abstraction',
  'csv-summary': 'new-dependency',
  'duration-label': 'new-dependency',
  'feature-gate': 'speculative-abstraction',
  'inventory-reservation': 'speculative-abstraction',
  'order-label': 'unused-default-param',
  'query-string': 'new-dependency',
  'event-normalizer': 'large-first-write',
  'route-matcher': 'speculative-abstraction',
  'safe-filename': 'new-dependency',
  'webhook-signature': 'speculative-abstraction',
});

const EFFICACY_FILES = [
  'prompt.txt',
  'meta.json',
  'repo',
  'accept.mjs',
  'measure.mjs',
  path.join('stubs', 'lean.mjs'),
  path.join('stubs', 'target.mjs'),
];

const DEPENDENCY_TARGETS = Object.freeze({
  'csv-summary': { name: 'csv-parse', version: '7.0.2' },
  'duration-label': { name: 'pretty-ms', version: '9.3.0' },
  'query-string': { name: 'qs', version: '6.15.3' },
  'safe-filename': { name: 'sanitize-filename', version: '1.6.4' },
});

const FORBIDDEN_PROMPT_WORDS =
  /\b(?:offcut|simple|simplicity|brief|brevity|loc|dependenc(?:y|ies)|architect(?:ure|ural)|abstract(?:ion|ions)?|implementation|approach)\b/i;

test('appendManifest writes to a custom manifest without touching the default', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-manifest-'));
  const manifestPath = path.join(dir, 'efficacy-manifest.jsonl');
  try {
    appendManifest({ run_id: 'opaque-1' }, manifestPath);
    assert.deepEqual(
      fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse),
      [{ run_id: 'opaque-1' }],
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('Claude JSON telemetry is normalized for run records and blind metrics', async () => {
  const { parseClaudeResult } = await import('../bench/run.mjs');
  assert.equal(typeof parseClaudeResult, 'function');
  const result = parseClaudeResult(
    JSON.stringify({
      result: 'done',
      total_cost_usd: 0.42,
      duration_ms: 1234,
      usage: {
        input_tokens: 10,
        output_tokens: 20,
        cache_read_input_tokens: 30,
        cache_creation_input_tokens: 40,
      },
      modelUsage: { 'claude-sonnet-5': { costUSD: 0.42 } },
    }),
    0,
    null,
  );
  assert.deepEqual(result.telemetry, {
    total_cost_usd: 0.42,
    duration_ms: 1234,
    input_tokens: 10,
    output_tokens: 20,
    cache_read_input_tokens: 30,
    cache_creation_input_tokens: 40,
  });
});

test('Claude args apply the supplied allowance and never resume failed runs', async () => {
  const { buildClaudeArgs } = await import('../bench/run.mjs');
  assert.equal(typeof buildClaudeArgs, 'function');
  const args = buildClaudeArgs({
    prompt: 'Implement the ticket.',
    model: 'claude-sonnet-5',
    settingsPath: 'settings.json',
    maxBudgetUsd: 0.75,
  });
  assert.deepEqual(args.slice(args.indexOf('--max-budget-usd')), ['--max-budget-usd', '0.75']);
  assert.equal(args.includes('--resume-failed'), false);
  assert.equal(args.includes('--continue'), false);
});

test('retry classification separates API and host failures from model failures', async () => {
  const { classifyAgentFailure, parseClaudeResult } = await import('../bench/run.mjs');
  assert.equal(typeof classifyAgentFailure, 'function');
  const api = parseClaudeResult(
    JSON.stringify({ is_error: true, terminal_reason: 'api_error', api_error_status: 529 }),
    1,
    null,
  );
  const model = parseClaudeResult(
    JSON.stringify({ is_error: true, result: 'I could not complete the change' }),
    1,
    null,
  );
  const host = parseClaudeResult('', null, Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }));
  assert.equal(classifyAgentFailure(api), 'api');
  assert.equal(classifyAgentFailure(host), 'host');
  assert.equal(classifyAgentFailure(model), 'model');
  assert.deepEqual(host.cost_evidence, {
    kind: 'known_zero',
    source: 'spawn_error:ENOENT',
  });
  const { isRetryableFailure } = await import('../bench/efficacy.mjs');
  assert.equal(isRetryableFailure('api'), true);
  assert.equal(isRetryableFailure('host'), true);
  assert.equal(isRetryableFailure('infrastructure'), true);
  assert.equal(isRetryableFailure('model'), false);
});

test('Phase 11 efficacy harness is present', () => {
  assert.equal(
    fs.existsSync(new URL('../bench/efficacy.mjs', import.meta.url)),
    true,
    'bench/efficacy.mjs must provide the Phase 11 boundary',
  );
});

test('adaptive discovery schedules rep 3 only after an accepted target-positive run', async () => {
  const { discoveryRep3Jobs } = await import('../bench/efficacy.mjs');
  assert.equal(typeof discoveryRep3Jobs, 'function');
  const jobs = discoveryRep3Jobs(['yes', 'target-only', 'accept-only'], [
    { task_id: 'yes', rep: 1, accept_passed: true, target_present: true },
    { task_id: 'yes', rep: 2, accept_passed: false, target_present: false },
    { task_id: 'target-only', rep: 1, accept_passed: false, target_present: true },
    { task_id: 'target-only', rep: 2, accept_passed: true, target_present: false },
    { task_id: 'accept-only', rep: 1, accept_passed: true, target_present: false },
    { task_id: 'accept-only', rep: 2, accept_passed: true, target_present: false },
  ]);
  assert.deepEqual(jobs, [{ taskId: 'yes', arm: 'off', rep: 3 }]);
});

test('qualification uses all three discovery runs as the denominator', async () => {
  const { qualifyDiscovery } = await import('../bench/efficacy.mjs');
  assert.equal(typeof qualifyDiscovery, 'function');
  const qualified = qualifyDiscovery(['complete', 'only-two', 'duplicate'], [
    { task_id: 'complete', rep: 1, accept_passed: true, target_present: true },
    { task_id: 'complete', rep: 2, accept_passed: true, target_present: true },
    { task_id: 'complete', rep: 3, accept_passed: false, target_present: false },
    { task_id: 'only-two', rep: 1, accept_passed: true, target_present: true },
    { task_id: 'only-two', rep: 2, accept_passed: true, target_present: true },
    { task_id: 'duplicate', rep: 1, accept_passed: true, target_present: true },
    { task_id: 'duplicate', rep: 1, accept_passed: true, target_present: true },
    { task_id: 'duplicate', rep: 2, accept_passed: true, target_present: true },
  ]);
  assert.deepEqual(qualified.map((q) => q.task_id), ['complete']);
  assert.deepEqual(qualified[0], {
    task_id: 'complete',
    target_count: 2,
    accept_count: 2,
    total_count: 3,
  });
});

test('qualifier cap prefers category diversity then target count and deterministic hash', async () => {
  const { selectQualifiers } = await import('../bench/efficacy.mjs');
  assert.equal(typeof selectQualifiers, 'function');
  const summaries = [
    { task_id: 'dep-low', category: 'new-dependency', target_count: 2 },
    { task_id: 'dep-high', category: 'new-dependency', target_count: 3 },
    { task_id: 'abs-a', category: 'speculative-abstraction', target_count: 2 },
    { task_id: 'abs-b', category: 'speculative-abstraction', target_count: 2 },
    { task_id: 'config', category: 'new-config-surface', target_count: 2 },
  ];
  const first = selectQualifiers(summaries, 3);
  const second = selectQualifiers([...summaries].reverse(), 3);
  assert.deepEqual(first, second);
  assert.deepEqual(first, ['dep-high', 'config', 'abs-a']);
  assert.equal(first.includes('dep-high'), true);
  assert.equal(new Set(first.map((id) => summaries.find((s) => s.task_id === id).category)).size, 3);
});

test('confirmatory schedule balances arms within each seeded task-rep block', async () => {
  const { confirmatorySchedule } = await import('../bench/efficacy.mjs');
  assert.equal(typeof confirmatorySchedule, 'function');
  const jobs = confirmatorySchedule(['a', 'b'], 8);
  assert.equal(jobs.length, 32);
  assert.deepEqual(jobs, confirmatorySchedule(['a', 'b'], 8));
  assert.deepEqual(confirmatorySchedule(['a', 'b'], 2), [
    { taskId: 'a', arm: 'off', rep: 1 },
    { taskId: 'a', arm: 'full', rep: 1 },
    { taskId: 'a', arm: 'off', rep: 2 },
    { taskId: 'a', arm: 'full', rep: 2 },
    { taskId: 'b', arm: 'full', rep: 1 },
    { taskId: 'b', arm: 'off', rep: 1 },
    { taskId: 'b', arm: 'off', rep: 2 },
    { taskId: 'b', arm: 'full', rep: 2 },
  ]);
  for (const taskId of ['a', 'b']) {
    for (let rep = 1; rep <= 8; rep++) {
      assert.deepEqual(
        jobs.filter((j) => j.taskId === taskId && j.rep === rep).map((j) => j.arm).sort(),
        ['full', 'off'],
      );
    }
  }
});

test('primary success is false for a broken run even when the target is absent', async () => {
  const { primarySuccess } = await import('../bench/efficacy.mjs');
  assert.equal(primarySuccess({ accept_passed: false, target_present: false }), false);
  assert.equal(primarySuccess({ accept_passed: true, target_present: true }), false);
  assert.equal(primarySuccess({ accept_passed: true, target_present: false }), true);
  assert.equal(
    primarySuccess({
      accept_passed: true,
      target_present: false,
      failure_kind: 'model',
    }),
    false,
  );
});

test('no-opportunity confirm primary counts completed accepts despite sealed model labels', async () => {
  const { noOpportunityPrimary } = await import('../bench/efficacy.mjs');
  const accepted = { task_passed: true, target_present: false };
  assert.equal(noOpportunityPrimary(accepted, null), true);
  assert.equal(noOpportunityPrimary(accepted, 'model'), true);
  assert.equal(noOpportunityPrimary(accepted, 'api'), false);
  assert.equal(noOpportunityPrimary(accepted, 'host'), false);
  assert.equal(noOpportunityPrimary({ task_passed: true, target_present: true }, 'model'), false);
  assert.equal(noOpportunityPrimary({ task_passed: false, target_present: false }, null), false);
});

test('budget ledger stays append-only and guard returns the allowed Claude cap', async () => {
  const { appendCostAttempt, budgetAllowance, readCostLedger } = await import(
    '../bench/efficacy.mjs'
  );
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-cost-'));
  const ledgerPath = path.join(dir, 'efficacy-cost.jsonl');
  try {
    assert.equal(budgetAllowance([], 35), 1);
    appendCostAttempt(ledgerPath, { attempt_id: 'one', total_cost_usd: 2 });
    appendCostAttempt(ledgerPath, { attempt_id: 'two', total_cost_usd: 1 });
    const ledger = readCostLedger(ledgerPath);
    assert.deepEqual(ledger.map((row) => row.attempt_id), ['one', 'two']);
    assert.equal(budgetAllowance(ledger, 35), 32);
    assert.equal(budgetAllowance([{ total_cost_usd: 20 }], 24), null);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('missing or non-finite cost telemetry is an anomaly that stops scheduling', async () => {
  const { budgetAllowance, executeJobs, readCostLedger } = await import('../bench/efficacy.mjs');
  assert.equal(budgetAllowance([{ total_cost_usd: null }], 35), null);
  assert.equal(budgetAllowance([{ total_cost_usd: Number.NaN }], 35), null);

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-telemetry-'));
  const ledgerPath = path.join(dir, 'efficacy-cost.jsonl');
  let calls = 0;
  try {
    assert.throws(
      () =>
        executeJobs(
          [
            { taskId: 'x', arm: 'off', rep: 1 },
            { taskId: 'y', arm: 'off', rep: 1 },
          ],
          [
            { id: 'x', dir: path.join(dir, 'x') },
            { id: 'y', dir: path.join(dir, 'y') },
          ],
          'discovery12',
          {
            ledgerPath,
            manifestPath: path.join(dir, 'manifest.jsonl'),
            runOneFn() {
              calls += 1;
              return {
                runId: `run-${calls}`,
                runDir: dir,
                record: {
                  failure_kind: 'host',
                  cost_evidence: { kind: 'call_started', source: 'spawn_timeout' },
                  total_cost_usd: null,
                },
              };
            },
            measureRunFn() {},
          },
        ),
      /telemetry anomaly/i,
    );
    assert.equal(calls, 1);
    assert.deepEqual(readCostLedger(ledgerPath), [
      {
        attempt_id: 'run-1',
        run_id: 'run-1',
        stage: 'discovery12',
        task_id: 'x',
        arm: 'off',
        rep: 1,
        attempt: 1,
        failure_kind: 'telemetry',
        telemetry_anomaly: true,
        cost_evidence: { kind: 'call_started', source: 'spawn_timeout' },
        total_cost_usd: null,
        duration_ms: null,
        input_tokens: null,
        output_tokens: null,
        cache_read_input_tokens: null,
        cache_creation_input_tokens: null,
        reasoning_output_tokens: null,
      },
    ]);
    let laterCalls = 0;
    assert.throws(
      () =>
        executeJobs(
          [{ taskId: 'y', arm: 'off', rep: 1 }],
          [{ id: 'y', dir: path.join(dir, 'y') }],
          'discovery12',
          {
            ledgerPath,
            runOneFn() {
              laterCalls += 1;
            },
          },
        ),
      /telemetry anomaly/i,
    );
    assert.equal(laterCalls, 0);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('known pre-call host failures record zero cost and retry durably', async () => {
  const { executeJobs, readCostLedger } = await import('../bench/efficacy.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-precall-'));
  const ledgerPath = path.join(dir, 'efficacy-cost.jsonl');
  let calls = 0;
  const allowances = [];
  try {
    executeJobs(
      [{ taskId: 'x', arm: 'off', rep: 1 }],
      [{ id: 'x', dir: path.join(dir, 'x') }],
      'discovery12',
      {
        ledgerPath,
        runOneFn(options) {
          calls += 1;
          allowances.push(options.maxBudgetUsd);
          if (calls < 3) {
            return {
              runId: `host-${calls}`,
              runDir: dir,
              record: {
                failure_kind: 'host',
                cost_evidence: {
                  kind: 'known_zero',
                  source: 'spawn_error:ENOENT',
                },
                total_cost_usd: null,
              },
            };
          }
          return {
            runId: 'success',
            runDir: dir,
            record: {
              failure_kind: null,
              cost_evidence: { kind: 'telemetry', source: 'claude_json' },
              total_cost_usd: 0.2,
            },
          };
        },
        measureRunFn() {},
      },
    );
    assert.equal(calls, 3);
    assert.deepEqual(allowances, [1, 1, 1]);
    const ledger = readCostLedger(ledgerPath);
    assert.deepEqual(ledger.map((entry) => entry.total_cost_usd), [0, 0, 0.2]);
    assert.deepEqual(ledger.map((entry) => entry.telemetry_anomaly), [false, false, false]);
    assert.deepEqual(ledger.map((entry) => entry.attempt), [1, 2, 3]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('retry exhaustion is durable across fresh executeJobs invocations', async () => {
  const { appendCostAttempt, executeJobs } = await import('../bench/efficacy.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-retry-'));
  const ledgerPath = path.join(dir, 'efficacy-cost.jsonl');
  const job = { taskId: 'x', arm: 'off', rep: 1 };
  const later = { taskId: 'y', arm: 'off', rep: 1 };
  const base = {
    stage: 'discovery12',
    task_id: 'x',
    arm: 'off',
    rep: 1,
    failure_kind: 'api',
    total_cost_usd: 0.1,
  };
  appendCostAttempt(ledgerPath, { ...base, attempt_id: 'one', attempt: 1 });
  appendCostAttempt(ledgerPath, { ...base, attempt_id: 'two', attempt: 2 });
  const seen = [];
  try {
    executeJobs(
      [job, later],
      [
        { id: 'x', dir: path.join(dir, 'x') },
        { id: 'y', dir: path.join(dir, 'y') },
      ],
      'discovery12',
      {
        ledgerPath,
        manifestPath: path.join(dir, 'manifest.jsonl'),
        runOneFn(options) {
          seen.push(options);
          if (options.task === 'y') {
            return {
              runId: 'y-one',
              runDir: dir,
              record: { failure_kind: null, total_cost_usd: 0.2 },
            };
          }
          return {
            runId: 'three',
            runDir: dir,
            record: { failure_kind: 'api', total_cost_usd: 0.1 },
          };
        },
        measureRunFn() {},
      },
    );
    assert.equal(seen.length, 2);
    assert.equal(seen[0].task, 'x');
    assert.equal(seen[0].attempt, 3);
    assert.equal(seen[0].apiRetries, 0);
    assert.equal(seen[1].task, 'y');
    assert.equal(seen[1].attempt, 1);

    const fresh = [];
    executeJobs([job], [{ id: 'x', dir: path.join(dir, 'x') }], 'discovery12', {
      ledgerPath,
      runOneFn(options) {
        fresh.push(options.task);
        return {
          runId: 'fresh',
          runDir: dir,
          record: { failure_kind: null, total_cost_usd: 0 },
        };
      },
      measureRunFn() {},
    });
    assert.deepEqual(fresh, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('discovery3 refuses until every candidate has completed reps 1 and 2', async () => {
  const { planStage } = await import('../bench/efficacy.mjs');
  const tasks = [{ id: 'a' }, { id: 'b' }];
  const outcomes = [
    { task_id: 'a', arm: 'off', rep: 1, stage: 'discovery12', accept_passed: true, target_present: true },
    { task_id: 'a', arm: 'off', rep: 2, stage: 'discovery12', accept_passed: true, target_present: false },
    { task_id: 'b', arm: 'off', rep: 1, stage: 'discovery12', accept_passed: true, target_present: false },
  ];
  assert.throws(() => planStage('discovery3', tasks, outcomes), /discovery reps 1 and 2 incomplete/i);
});

test('confirm refuses until every eligible discovery rep 3 is complete', async () => {
  const { planStage } = await import('../bench/efficacy.mjs');
  const tasks = [
    { id: 'eligible', category: 'new-dependency' },
    { id: 'ineligible', category: 'speculative-abstraction' },
  ];
  const outcomes = [
    { task_id: 'eligible', arm: 'off', rep: 1, stage: 'discovery12', accept_passed: true, target_present: true },
    { task_id: 'eligible', arm: 'off', rep: 2, stage: 'discovery12', accept_passed: true, target_present: true },
    { task_id: 'ineligible', arm: 'off', rep: 1, stage: 'discovery12', accept_passed: true, target_present: false },
    { task_id: 'ineligible', arm: 'off', rep: 2, stage: 'discovery12', accept_passed: true, target_present: false },
  ];
  assert.throws(() => planStage('confirm', tasks, outcomes), /eligible discovery rep 3 incomplete/i);
  const complete = [
    ...outcomes,
    { task_id: 'eligible', arm: 'off', rep: 3, stage: 'discovery3', accept_passed: true, target_present: true },
  ];
  assert.equal(planStage('confirm', tasks, complete).length, 16);
});

test('zero-target discovery plans a six-task no-opportunity confirmatory grid', async () => {
  const { loadEfficacyTasks, planStage, selectNoOpportunityTasks } = await import(
    '../bench/efficacy.mjs'
  );
  const tasks = loadEfficacyTasks();
  const selected = selectNoOpportunityTasks(tasks);
  assert.deepEqual(selected, [
    'event-normalizer',
    'query-string',
    'inventory-reservation',
    'order-label',
    'asset-base-url',
    'csv-summary',
  ]);
  const outcomes = tasks.flatMap((task) =>
    [1, 2].map((rep) => ({
      task_id: task.id,
      arm: 'off',
      rep,
      stage: 'discovery12',
      accept_passed: true,
      target_present: false,
    })),
  );
  const jobs = planStage('confirm', tasks, outcomes);
  assert.equal(jobs.length, 96);
  assert.deepEqual([...new Set(jobs.map((job) => job.taskId))], selected);
  assert.equal(jobs.filter((job) => job.arm === 'off').length, 48);
  assert.equal(jobs.filter((job) => job.arm === 'full').length, 48);
});

test('legacy runner keeps three API attempts while efficacy requests one', async () => {
  const { DEFAULT_API_RETRIES, resolveApiRetries } = await import('../bench/run.mjs');
  assert.equal(DEFAULT_API_RETRIES, 2);
  assert.equal(resolveApiRetries({}), 2);
  assert.equal(resolveApiRetries({ apiRetries: 0 }), 0);
});

test('legacy runClaude retries two API failures before succeeding', async () => {
  const { runClaude } = await import('../bench/run.mjs');
  assert.equal(typeof runClaude, 'function');
  let calls = 0;
  const waits = [];
  const originalError = console.error;
  let result;
  try {
    console.error = () => {};
    result = runClaude({
      workDir: process.cwd(),
      prompt: 'Implement the ticket.',
      stateDir: os.tmpdir(),
      settingsPath: path.join(os.tmpdir(), 'settings.json'),
      model: 'claude-sonnet-5',
      maxBudgetUsd: 1,
      apiRetries: 2,
      spawnClaude() {
        calls += 1;
        return calls < 3
          ? {
              status: 1,
              stdout: JSON.stringify({
                is_error: true,
                terminal_reason: 'api_error',
                api_error_status: 529,
              }),
              stderr: '',
              error: null,
            }
          : {
              status: 0,
              stdout: JSON.stringify({
                is_error: false,
                result: 'done',
                total_cost_usd: 0.2,
              }),
              stderr: '',
              error: null,
            };
      },
      sleepFn(ms) {
        waits.push(ms);
      },
    });
  } finally {
    console.error = originalError;
  }
  assert.equal(calls, 3);
  assert.deepEqual(waits, [5_000, 10_000]);
  assert.equal(result.ok, true);
  assert.equal(result.attempts, 3);
});

test('raw commit gate refuses dirty evidence and passes tracked clean evidence', async () => {
  const { assertRawGateCommitted, rawEvidencePaths } = await import('../bench/efficacy.mjs');
  assert.equal(typeof assertRawGateCommitted, 'function');
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-gate-paths-'));
  const manifestPath = path.join(repoRoot, 'bench', 'efficacy-manifest.jsonl');
  const costPath = path.join(repoRoot, 'bench', 'efficacy-cost.jsonl');
  const preflightLedgerPath = path.join(repoRoot, 'bench', 'codex-preflight', 'ledger.jsonl');
  const tasksDir = path.join(repoRoot, 'bench', 'efficacy-tasks');
  const evidencePaths = rawEvidencePaths({
    repoRoot,
    manifestPath,
    costPath,
    preflightLedgerPath,
    tasksDir,
    manifestEntries: [{ run_id: '1111111111111111' }],
    costEntries: [
      { run_id: '1111111111111111' },
      { run_id: '2222222222222222' },
      { run_id: null },
    ],
  });
  assert.deepEqual(evidencePaths, [
    'bench/efficacy-manifest.jsonl',
    'bench/efficacy-cost.jsonl',
    'bench/codex-preflight/ledger.jsonl',
    'bench/efficacy-tasks',
    'bench/runs',
  ]);
  const tracked = { status: 0, stdout: 'tracked\n', stderr: '' };
  const dirtyGit = (_command, args) =>
    args[0] === 'status'
      ? { status: 0, stdout: '?? bench/efficacy-cost.jsonl\n', stderr: '' }
      : tracked;
  assert.throws(
    () => assertRawGateCommitted({ spawnGit: dirtyGit, repoRoot, evidencePaths }),
    /attempts must be committed/i,
  );

  const calls = [];
  const cleanGit = (command, args, options) => {
    calls.push({ command, args, cwd: options.cwd });
    return args[0] === 'status'
      ? { status: 0, stdout: '', stderr: '' }
      : tracked;
  };
  assert.doesNotThrow(() =>
    assertRawGateCommitted({ spawnGit: cleanGit, repoRoot, evidencePaths }),
  );
  assert.equal(calls.filter((call) => call.args[0] === 'ls-files').length, 1);
  assert.equal(calls.at(-1).args[0], 'status');
  assert.equal(calls.every((call) => call.cwd === repoRoot), true);
  assert.equal(calls.at(-1).args.includes('bench/runs'), true);
  fs.rmSync(repoRoot, { recursive: true, force: true });
});

test('efficacy report recomputes the sealed null result deterministically', async () => {
  const {
    buildEfficacyAnalysis,
    publishEfficacyReport,
  } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-report-'));
  const firstJson = path.join(root, 'first.json');
  const firstMarkdown = path.join(root, 'first.md');
  const secondJson = path.join(root, 'second.json');
  const secondMarkdown = path.join(root, 'second.md');
  try {
    const first = publishEfficacyReport({
      analysisPath: firstJson,
      reportPath: firstMarkdown,
    });
    const second = publishEfficacyReport({
      analysisPath: secondJson,
      reportPath: secondMarkdown,
    });
    assert.deepEqual(second, first);
    assert.equal(fs.readFileSync(secondJson, 'utf8'), fs.readFileSync(firstJson, 'utf8'));
    assert.equal(
      fs.readFileSync(secondMarkdown, 'utf8'),
      fs.readFileSync(firstMarkdown, 'utf8'),
    );
    assert.match(first.raw_commit_sha, /^[a-f0-9]{40}$/);
    assert.deepEqual(first.discovery, {
      planned_initial_cells: 24,
      completed_initial_cells: 24,
      target_present: 0,
      accepted_target_positive_initial: 0,
      accepted: 22,
      frozen_primary_success: 17,
      discovery3_eligible_tasks: 0,
      discovery3_planned: 0,
      discovery3_outcomes: 0,
      qualifiers: 0,
      confirm_outcomes: 0,
    });
    assert.deepEqual(first.post_hoc_sensitivity, {
      label: 'post_hoc_transcript_based_upper_bound',
      top_level_exit_code_sealed: false,
      transcript_candidate_runs: 5,
      upper_bound_primary_success: 22,
      primary_total: 24,
      primary_rate_percent: 91.67,
      changes_stop_decision: false,
    });
    assert.deepEqual(first.aggregate.loc, { added: 681, removed: 42 });
    assert.deepEqual(first.aggregate.duration_ms, {
      total: 1465425,
      median: 56197.5,
      min: 38210,
      max: 98182,
    });
    assert.equal(first.aggregate.tokens.input.total, 2123514);
    assert.equal(first.aggregate.tokens.input.median, 77521);
    assert.equal(first.aggregate.tokens.output.total, 35143);
    assert.equal(first.aggregate.tokens.output.median, 1367.5);
    assert.equal(first.aggregate.tokens.cache_read.total, 1709312);
    assert.equal(first.aggregate.tokens.cache_read.median, 67328);
    assert.equal(first.aggregate.tokens.noncached_input.total, 414202);
    assert.equal(first.aggregate.tokens.reasoning.total, 7254);
    assert.equal(first.aggregate.tokens.reasoning.median, 264);
    assert.equal(first.aggregate.incremental_cost_usd, 0);
    assert.equal(first.positive_claim, false);
    assert.equal(first.efficacy_estimate, null);
    assert.equal(first.confirmatory_ran, true);
    assert.deepEqual(first.no_opportunity_confirm, {
      label: 'no_opportunity_confirm',
      task_ids: [
        'event-normalizer',
        'query-string',
        'inventory-reservation',
        'order-label',
        'asset-base-url',
        'csv-summary',
      ],
      planned_cells: 96,
      completed_cells: 96,
      off: {
        cells: 48,
        accepted: 41,
        target_present: 3,
        primary_success: 38,
        frozen_primary_success: 38,
        lines_added: 1513,
        lines_removed: 80,
      },
      full: {
        cells: 48,
        accepted: 43,
        target_present: 0,
        primary_success: 43,
        frozen_primary_success: 27,
        lines_added: 976,
        lines_removed: 80,
      },
    });
    assert.match(first.stop_reason, /user-directed no-opportunity confirmatory grid/i);
    assert.equal(first.tasks.length, 24);
    assert.deepEqual(first.categories['new-dependency'], {
      total: 8,
      target_present: 0,
      accepted: 7,
      frozen_primary_success: 7,
    });
    assert.deepEqual(first.categories['speculative-abstraction'], {
      total: 10,
      target_present: 0,
      accepted: 9,
      frozen_primary_success: 4,
    });
    for (const category of [
      'large-first-write',
      'new-config-surface',
      'unused-default-param',
    ]) {
      assert.deepEqual(first.categories[category], {
        total: 2,
        target_present: 0,
        accepted: 2,
        frozen_primary_success: 2,
      });
    }
    assert.equal(first.environment.model_requested, 'gpt-5.6-sol');
    assert.equal(first.environment.model_id, null);
    assert.equal(first.environment.model_observation, 'requested_not_reported');
    assert.equal(first.preflight_history.attempts, 9);
    assert.equal(first.preflight_history.successful, 1);
    assert.deepEqual(first.legacy_claude, {
      attempts: 3,
      subscription_403: 3,
      input_tokens: 0,
      output_tokens: 0,
      reported_cost_usd: 0,
    });
    assert.match(
      fs.readFileSync(firstMarkdown, 'utf8'),
      /No efficacy estimate.*not evidence of no effect/is,
    );
    assert.match(
      fs.readFileSync(firstMarkdown, 'utf8'),
      /transcript-based post-hoc upper bound[\s\S]*top-level exit code was not sealed/i,
    );

    assert.throws(
      () => buildEfficacyAnalysis({
        manifestEntries: [],
        metricsByRun: new Map(),
        taskMetas: [],
        transcriptByRun: new Map(),
        preflightEvidence: [],
        rawCommitSha: 'raw',
      }),
      /24 initial cells/i,
    );
    assert.throws(
      () => buildEfficacyAnalysis({
        manifestEntries: Array.from({ length: 24 }, (_, index) => ({
          run_id: `wrong-${index}`,
          backend: 'codex-custom-v1',
          stage: 'discovery12',
          arm: 'off',
          rep: index < 12 ? 1 : 2,
          task_id: `task-${index % 12}`,
        })),
        metricsByRun: new Map(),
        taskMetas: [],
        transcriptByRun: new Map(),
        preflightEvidence: [],
        rawCommitSha: 'raw',
      }),
      /24 initial cells/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('null efficacy report refuses evidence that contradicts the stop', async () => {
  const { buildEfficacyAnalysis } = await import('../bench/efficacy.mjs');
  const manifestEntries = fs
    .readFileSync(path.resolve('bench/efficacy-manifest.jsonl'), 'utf8')
    .trim()
    .split(/\r?\n/)
    .map(JSON.parse);
  const codexEntries = manifestEntries.filter(
    (entry) => entry.backend === 'codex-profile-v1',
  );
  const metricsByRun = new Map();
  const transcriptByRun = new Map();
  for (const entry of codexEntries) {
    const runDir = path.resolve('bench/runs', entry.run_id);
    metricsByRun.set(
      entry.run_id,
      JSON.parse(fs.readFileSync(path.join(runDir, 'metrics.json'), 'utf8')),
    );
    transcriptByRun.set(
      entry.run_id,
      fs.readFileSync(path.join(runDir, 'transcript.jsonl'), 'utf8'),
    );
  }
  const tasksRoot = path.resolve('bench/efficacy-tasks');
  const taskMetas = fs.readdirSync(tasksRoot).map((taskId) =>
    JSON.parse(fs.readFileSync(path.join(tasksRoot, taskId, 'meta.json'), 'utf8')),
  );
  const base = {
    manifestEntries,
    metricsByRun,
    taskMetas,
    transcriptByRun,
    preflightEvidence: [],
    rawCommitSha: 'raw',
  };
  const firstRun = codexEntries[0].run_id;
  const targetPositiveMetrics = new Map(metricsByRun);
  targetPositiveMetrics.set(firstRun, {
    ...targetPositiveMetrics.get(firstRun),
    task_passed: true,
    target_present: true,
  });
  assert.throws(
    () => buildEfficacyAnalysis({
      ...base,
      metricsByRun: targetPositiveMetrics,
    }),
    /target-positive.*null stop/i,
  );
  assert.throws(
    () => buildEfficacyAnalysis({
      ...base,
      manifestEntries: [
        ...manifestEntries,
        {
          ...codexEntries[0],
          run_id: 'discovery3-contradiction',
          stage: 'discovery3',
          rep: 3,
        },
      ],
    }),
    /discovery3.*null stop/i,
  );
  assert.throws(
    () => buildEfficacyAnalysis({
      ...base,
      metricsByRun: new Map([
        ...metricsByRun,
        ['confirm-unexpected', {
          task_passed: true,
          target_present: false,
          primary_success: true,
          lines_added: 1,
          lines_removed: 0,
        }],
      ]),
      manifestEntries: [
        ...manifestEntries,
        {
          ...codexEntries[0],
          run_id: 'confirm-unexpected',
          stage: 'confirm',
          task_id: 'webhook-signature',
          arm: 'off',
          rep: 1,
        },
      ],
    }),
    /no-opportunity confirm grid is incomplete or unexpected/i,
  );
});

test('efficacy report refuses a dirty raw gate before writing', async () => {
  const { publishEfficacyReport } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-report-gate-'));
  const analysisPath = path.join(root, 'analysis.json');
  const reportPath = path.join(root, 'report.md');
  try {
    assert.throws(
      () => publishEfficacyReport({
        analysisPath,
        reportPath,
        spawnGit(_command, args) {
          return args[0] === 'status'
            ? { status: 0, stdout: ' M bench/efficacy-manifest.jsonl\n' }
            : { status: 0, stdout: 'tracked\n' };
        },
      }),
      /raw-result commit gate/i,
    );
    assert.equal(fs.existsSync(analysisPath), false);
    assert.equal(fs.existsSync(reportPath), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('runOne seals a stub attempt in the requested efficacy manifest', async () => {
  const { runOne } = await import('../bench/run.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-run-'));
  const manifestPath = path.join(dir, 'efficacy-manifest.jsonl');
  let result;
  try {
    result = runOne({
      task: 'config-fallback',
      arm: 'off',
      rep: 1,
      stub: 'lean',
      model: 'claude-sonnet-5',
      keepWork: false,
      manifestPath,
      maxBudgetUsd: 0.5,
    });
    const entries = fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(entries.length, 1);
    assert.equal(entries[0].run_id, result.runId);
  } finally {
    if (result?.runDir) fs.rmSync(result.runDir, { recursive: true, force: true });
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('selftest runs lean and target stubs through accept, blind measure, and hook replay', async () => {
  const { selftestTask } = await import('../bench/efficacy.mjs');
  assert.equal(typeof selftestTask, 'function');
  const taskDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-selftest-'));
  const repoDir = path.join(taskDir, 'repo');
  const stubsDir = path.join(taskDir, 'stubs');
  fs.mkdirSync(repoDir, { recursive: true });
  fs.mkdirSync(stubsDir, { recursive: true });
  fs.writeFileSync(
    path.join(taskDir, 'meta.json'),
    JSON.stringify({
      id: 'fixture-dependency',
      category: 'new-dependency',
      target_signal: 'new-dependency',
      target_phase: 'pre',
    }),
  );
  fs.writeFileSync(path.join(taskDir, 'prompt.txt'), 'Add a helper that returns the requested value.\n');
  fs.writeFileSync(path.join(repoDir, 'package.json'), '{"type":"module","dependencies":{}}\n');
  fs.writeFileSync(
    path.join(taskDir, 'accept.mjs'),
    "import fs from 'node:fs';import path from 'node:path';if(!fs.existsSync(path.join(process.argv[2],'solution.js')))process.exit(1);\n",
  );
  fs.writeFileSync(
    path.join(taskDir, 'measure.mjs'),
    "import fs from 'node:fs';import path from 'node:path';const d=process.argv[2];const p=JSON.parse(fs.readFileSync(path.join(d,'work','package.json'),'utf8'));console.log(JSON.stringify({target_present:Boolean(p.dependencies?.['left-pad']),seen:fs.readdirSync(d).sort()}));\n",
  );
  fs.writeFileSync(
    path.join(stubsDir, 'lean.mjs'),
    "import fs from 'node:fs';import path from 'node:path';const d=process.argv[2];const content='export const value = 1;\\n';fs.writeFileSync(path.join(d,'solution.js'),content);console.log(JSON.stringify({operations:[{tool_name:'Write',tool_input:{file_path:'solution.js',content}}]}));\n",
  );
  fs.writeFileSync(
    path.join(stubsDir, 'target.mjs'),
    "import fs from 'node:fs';import path from 'node:path';const d=process.argv[2];const content='export const value = 1;\\n';fs.writeFileSync(path.join(d,'solution.js'),content);const p=path.join(d,'package.json');const old_string='\"dependencies\":{}';const new_string='\"dependencies\":{\"left-pad\":\"^1.3.0\"}';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(old_string,new_string));console.log(JSON.stringify({operations:[{tool_name:'Write',tool_input:{file_path:'solution.js',content}},{tool_name:'Edit',tool_input:{file_path:'package.json',old_string,new_string}}]}));\n",
  );
  try {
    const result = selftestTask(taskDir);
    assert.equal(result.lean.accept_passed, true);
    assert.equal(result.lean.target_present, false);
    assert.equal(result.target.accept_passed, true);
    assert.equal(result.target.target_present, true);
    assert.deepEqual(result.target.hook_exposure, [{ signal: 'new-dependency', phase: 'pre' }]);
    assert.equal(result.lean.hook_exposure.some((hit) => hit.signal === 'new-dependency'), false);
    assert.deepEqual(result.lean.measure_seen, ['accept.json', 'diff.patch', 'work']);
    assert.deepEqual(result.target.measure_seen, ['accept.json', 'diff.patch', 'work']);
    fs.writeFileSync(
      path.join(stubsDir, 'lean.mjs'),
      "import fs from 'node:fs';import path from 'node:path';const d=process.argv[2];const content='export const value = 1;\\n';fs.writeFileSync(path.join(d,'solution.js'),content);fs.writeFileSync(path.join(d,'undeclared.js'),'export const hidden = true;\\n');console.log(JSON.stringify({operations:[{tool_name:'Write',tool_input:{file_path:'solution.js',content}}]}));\n",
    );
    assert.throws(
      () => selftestTask(taskDir),
      /declared operations do not reproduce stub changes/i,
    );
    fs.writeFileSync(
      path.join(stubsDir, 'lean.mjs'),
      "import fs from 'node:fs';import path from 'node:path';const d=process.argv[2];const content='export const value = 1;\\n';fs.writeFileSync(path.join(d,'solution.js'),content);const p=path.join(d,'package.json');const old_string='\"dependencies\":{}';const new_string='\"dependencies\":{\"right-pad\":\"^1.0.0\"}';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(old_string,new_string));console.log(JSON.stringify({operations:[{tool_name:'Write',tool_input:{file_path:'solution.js',content}},{tool_name:'Edit',tool_input:{file_path:'package.json',old_string,new_string}}]}));\n",
    );
    assert.throws(
      () => selftestTask(taskDir),
      /lean stub exposed pre:new-dependency/i,
    );
  } finally {
    fs.rmSync(taskDir, { recursive: true, force: true });
  }
});

test('blind target measures use category semantics and ignore comments and strings', async (t) => {
  const {
    detectLargeFirstWrite,
    detectNewConfigSurface,
    detectNewDependency,
    detectSpeculativeAbstraction,
    detectUnusedDefaultParam,
  } = await import('../bench/efficacy-fixture-lib.mjs');
  const fileDiff = (file, lines, isNew = false) =>
    `diff --git a/${file} b/${file}\n${isNew ? 'new file mode 100644\n--- /dev/null\n' : ''}+++ b/${file}\n@@ -0,0 +1 @@\n${lines.map((line) => `+${line}`).join('\n')}\n`;

  await t.test('new dependency', () => {
    const positive = fileDiff('package.json', [
      '  "devDependencies": {',
      '    "alternate-tool": "^2.4.0"',
      '  }',
    ]);
    const negative = fileDiff('src/app.js', [
      '// "dependencies": { "comment-only": "^1.0.0" }',
      'const text = "\\"optionalDependencies\\": {\\"string-only\\": \\"1.0.0\\"}";',
    ]);
    assert.equal(detectNewDependency(positive), true);
    assert.equal(detectNewDependency(negative), false);
  });

  await t.test('speculative abstraction', () => {
    const positive = fileDiff('src/transport.ts', [
      'abstract class Transport { abstract send(): void; }',
      'class HttpTransport extends Transport { send() {} }',
    ]);
    const negative = fileDiff('src/transport.ts', [
      '// interface Fake {}',
      'const text = "class Only implements Fake {}";',
    ]);
    assert.equal(detectSpeculativeAbstraction(positive), true);
    assert.equal(detectSpeculativeAbstraction(negative), false);
  });

  await t.test('new config surface', () => {
    const positive = fileDiff('src/settings.ts', [
      'export const settings = defineConfig({ port: process.env.PORT });',
    ]);
    const negative = fileDiff('src/settings.ts', [
      '// const settings = getConfig();',
      'const text = "defineConfig({ extra: true })";',
    ]);
    assert.equal(detectNewConfigSurface(positive), true);
    assert.equal(detectNewConfigSurface(negative), false);
  });

  await t.test('unused default parameter', () => {
    const positive = fileDiff('src/label.ts', [
      "export function label(value, locale = 'en') {",
      '  return String(value);',
      '}',
    ]);
    const negative = fileDiff('src/label.ts', [
      "// function fake(value, locale = 'en') { return value; }",
      'const text = "function fake(value, locale = 1) {}";',
    ]);
    assert.equal(detectUnusedDefaultParam(positive), true);
    assert.equal(detectUnusedDefaultParam(negative), false);
  });

  await t.test('large first write', () => {
    const positive = fileDiff(
      'src/alternate-handler.ts',
      Array.from({ length: 81 }, (_, index) => `export const value${index} = ${index};`),
      true,
    );
    const negative = fileDiff(
      'src/comment-padded.ts',
      Array.from({ length: 90 }, (_, index) => `// padding ${index}`),
      true,
    );
    assert.equal(detectLargeFirstWrite(positive), true);
    assert.equal(detectLargeFirstWrite(negative), false);
  });
});

test('every task measure recognizes alternate positives without handcrafted names', async () => {
  const { loadEfficacyTasks } = await import('../bench/efficacy.mjs');
  const fileDiff = (file, lines, isNew = false) =>
    `diff --git a/${file} b/${file}\n${isNew ? 'new file mode 100644\n--- /dev/null\n' : ''}+++ b/${file}\n@@ -0,0 +1 @@\n${lines.map((line) => `+${line}`).join('\n')}\n`;
  const cases = {
    'new-dependency': {
      positive: fileDiff('package.json', ['  "peerDependencies": {', '    "unrelated-kit": "^9.1.0"', '  }']),
      negative: fileDiff('src/text.js', ['const note = "\\"dependencies\\": {\\"fake\\": \\"1\\"}";']),
    },
    'speculative-abstraction': {
      positive: fileDiff('src/other.ts', ['interface AlternateContract {}', 'class AlternateConcrete implements AlternateContract {}']),
      negative: fileDiff('src/other.ts', ['const note = "interface Fake {} class One implements Fake {}";']),
    },
    'new-config-surface': {
      positive: fileDiff('src/other.js', ['const settings = cosmiconfig();']),
      negative: fileDiff('src/other.js', ['// const settings = defineConfig({});']),
    },
    'unused-default-param': {
      positive: fileDiff('src/other.js', ['function other(value, unusedChoice = 4) { return value; }']),
      negative: fileDiff('src/other.js', ['const note = "function other(value, unusedChoice = 4) {}";']),
    },
    'large-first-write': {
      positive: fileDiff('src/alternate.ts', Array.from({ length: 81 }, (_, index) => `export const alternate${index} = ${index};`), true),
      negative: fileDiff('src/alternate.ts', Array.from({ length: 81 }, (_, index) => `// line ${index}`), true),
    },
  };
  for (const task of loadEfficacyTasks()) {
    for (const [kind, diff] of Object.entries(cases[task.category])) {
      const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-measure-case-'));
      try {
        fs.mkdirSync(path.join(root, 'work'));
        fs.writeFileSync(path.join(root, 'diff.patch'), diff);
        fs.writeFileSync(path.join(root, 'accept.json'), '{"ok":true}\n');
        const run = spawnSync(process.execPath, [path.join(task.dir, 'measure.mjs'), root], {
          cwd: root,
          encoding: 'utf8',
        });
        assert.equal(run.status, 0, `${task.id}/${kind}: ${run.stderr}`);
        assert.equal(JSON.parse(run.stdout).target_present, kind === 'positive', `${task.id}/${kind}`);
      } finally {
        fs.rmSync(root, { recursive: true, force: true });
      }
    }
  }
});

test('efficacy corpus freezes exact ticket IDs, categories, prompts, and files', async () => {
  const { loadEfficacyTasks } = await import('../bench/efficacy.mjs');
  const root = fileURLToPath(new URL('../bench/efficacy-tasks/', import.meta.url));
  const tasks = loadEfficacyTasks(root);
  assert.deepEqual(
    Object.fromEntries(tasks.map((task) => [task.id, task.category])),
    EFFICACY_TASKS,
  );
  for (const task of tasks) {
    for (const relative of EFFICACY_FILES) {
      assert.equal(fs.existsSync(path.join(task.dir, relative)), true, `${task.id}: missing ${relative}`);
    }
    assert.equal(
      fs.existsSync(path.join(task.dir, 'repo', 'node_modules')),
      false,
      `${task.id}: fixture must not contain node_modules`,
    );
    const initialManifest = JSON.parse(
      fs.readFileSync(path.join(task.dir, 'repo', 'package.json'), 'utf8'),
    );
    assert.equal(initialManifest.dependencies, undefined, `${task.id}: initial runtime packages`);
    const prompt = fs.readFileSync(path.join(task.dir, 'prompt.txt'), 'utf8');
    assert.doesNotMatch(prompt, FORBIDDEN_PROMPT_WORDS, `${task.id}: prompt leaks study framing`);
    assert.equal(prompt.trim().length > 80, true, `${task.id}: prompt is not a realistic ticket`);
    const measureSource = fs.readFileSync(path.join(task.dir, 'measure.mjs'), 'utf8');
    assert.doesNotMatch(
      measureSource,
      /\b(?:arm|transcript|state-after|signals\.json|target_signal)\b/i,
      `${task.id}: measure reads prohibited study context`,
    );
    assert.match(
      measureSource,
      /readMeasureInput|diff\.patch/,
      `${task.id}: measure must inspect the blind diff`,
    );
    assert.deepEqual(
      {
        id: task.id,
        category: task.category,
        target_signal: task.target_signal,
        target_phase: task.target_phase,
      },
      {
        id: task.id,
        category: EFFICACY_TASKS[task.id],
        target_signal: EFFICACY_TASKS[task.id],
        target_phase: ['new-config-surface', 'unused-default-param'].includes(task.category)
          ? 'post'
          : 'pre',
      },
    );
  }
  assert.equal(
    new Set(tasks.map((task) => JSON.parse(fs.readFileSync(path.join(task.dir, 'repo', 'package.json'))).name)).size,
    12,
    'seed package names must be distinct',
  );
});

test('model-visible efficacy repositories contain no study framing', async () => {
  const { loadEfficacyTasks } = await import('../bench/efficacy.mjs');
  const forbidden = /\b(?:fixture|benchmark|offline|lean|target|study)\b/i;
  const visit = (root) => {
    const files = [];
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name);
      if (entry.isDirectory()) files.push(...visit(full));
      else files.push(full);
    }
    return files;
  };
  for (const task of loadEfficacyTasks()) {
    for (const file of [path.join(task.dir, 'prompt.txt'), ...visit(path.join(task.dir, 'repo'))]) {
      assert.doesNotMatch(fs.readFileSync(file, 'utf8'), forbidden, `${task.id}: ${path.basename(file)}`);
    }
  }
});

test('event normalizer documents every accepted mapping and output convention', () => {
  const taskDir = fileURLToPath(new URL('../bench/efficacy-tasks/event-normalizer/', import.meta.url));
  const acceptSource = fs.readFileSync(path.join(taskDir, 'accept.mjs'), 'utf8');
  const readme = fs.readFileSync(path.join(taskDir, 'repo', 'README.md'), 'utf8');
  const mappings = [...acceptSource.matchAll(
    /\['([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)', '([^']+)'\]/g,
  )].map((match) => match.slice(1));

  assert.equal(mappings.length, 10, 'all accepted event mappings must be discoverable');
  for (const [type, idKey, atKey, actorKey, kind, summary] of mappings) {
    assert.match(
      readme,
      new RegExp(
        `\\| \`${type.replace('.', '\\.')}\` \\| \`data\\.${idKey}\` \\| \`data\\.${atKey}\` \\| ` +
        `\`data\\.${actorKey}\` \\| \`${kind}\` \\| ${summary} \\|`,
      ),
      `${type}: accepted mapping is not documented`,
    );
  }
  assert.match(readme, /exactly `\{ id, kind, occurredAt, actor, summary \}`/);
  assert.match(readme, /`occurredAt` preserves the source timestamp text/);
  assert.match(readme, /`summary` is `<summary label>: <id>`/);
  assert.match(readme, /must not modify the input event or its `data` object/);
});

test('fixture Edit applies and replays LF instructions in a CRLF checkout', async () => {
  const { copyTree, initGitRepo } = await import('../bench/lib.mjs');
  const { assertOperationIntegrity } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-crlf-edit-'));
  const repo = path.join(root, 'repo');
  const work = path.join(root, 'work');
  const stub = fileURLToPath(
    new URL('../bench/efficacy-tasks/csv-summary/stubs/target.mjs', import.meta.url),
  );
  try {
    fs.mkdirSync(repo);
    fs.writeFileSync(
      path.join(repo, 'package.json'),
      '{\r\n  "private": true,\r\n  "type": "module"\r\n}\r\n',
      'utf8',
    );
    copyTree(repo, work);
    initGitRepo(work);
    const run = spawnSync(process.execPath, [stub, work], { encoding: 'utf8' });
    assert.equal(run.status, 0, run.stderr);

    const operations = JSON.parse(run.stdout).operations;
    assert.doesNotThrow(() => assertOperationIntegrity(repo, work, operations));
    const updated = fs.readFileSync(path.join(work, 'package.json'), 'utf8');
    assert.match(updated, /"csv-parse": "7\.0\.2"/);
    assert.doesNotMatch(updated, /(^|[^\r])\n/, 'Edit must preserve CRLF line endings');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('dependency target stubs use their optional package with a fallback', async () => {
  const { copyTree, initGitRepo } = await import('../bench/lib.mjs');
  const { loadEfficacyTasks } = await import('../bench/efficacy.mjs');
  const packageModules = {
    'csv-parse': `import fs from 'node:fs';
export function parse(csv) {
  fs.writeFileSync('package-used', 'csv-parse');
  const lines = csv.trim().split(/\\r?\\n/);
  return lines.slice(1).map((line) => {
    const match = line.match(/^"([^"]+)",(.+)$/);
    const fields = match ? [match[1], match[2]] : line.split(',');
    return { region: fields[0], amount: fields[1] };
  });
}`,
    'pretty-ms': `import fs from 'node:fs';
export default function pretty(ms, options) {
  if (options?.hideYearAndDays !== true || options?.secondsDecimalDigits !== 0) {
    throw new Error('pretty-ms options mismatch');
  }
  fs.writeFileSync('package-used', 'pretty-ms');
  let seconds = Math.floor(ms / 1000);
  const parts = [];
  const hours = Math.floor(seconds / 3600); seconds %= 3600;
  const minutes = Math.floor(seconds / 60); seconds %= 60;
  if (hours) parts.push(hours + 'h');
  if (minutes) parts.push(minutes + 'm');
  if (seconds || !parts.length) parts.push(seconds + 's');
  return parts.join(' ');
}`,
    qs: `const fs = require('node:fs');
exports.stringify = function stringify(params) {
  fs.writeFileSync('package-used', 'qs');
  const pairs = [];
  for (const [key, raw] of Object.entries(params)) for (const value of Array.isArray(raw) ? raw : [raw]) {
    if (value != null) pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));
  }
  return pairs.join('&');
};`,
    'sanitize-filename': `const fs = require('node:fs');
module.exports = function sanitize(value) {
  let output = /^(con|prn|aux|nul|com\\d|lpt\\d)(\\..*)?$/i.test(value)
    ? ''
    : Buffer.from(value).subarray(0, 255).toString();
  fs.appendFileSync('package-used', JSON.stringify({ value, output }) + '\\n');
  return output;
};`,
  };
  for (const task of loadEfficacyTasks().filter((candidate) => candidate.category === 'new-dependency')) {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-dependency-'));
    const work = path.join(parent, 'repo');
    try {
      copyTree(path.join(task.dir, 'repo'), work);
      initGitRepo(work);
      const run = spawnSync(process.execPath, [path.join(task.dir, 'stubs', 'target.mjs'), work], {
        cwd: work,
        encoding: 'utf8',
      });
      assert.equal(run.status, 0, run.stderr);
      const operations = JSON.parse(run.stdout).operations;
      const manifestEdit = operations.find((operation) => operation.tool_input.file_path === 'package.json');
      const packageName = JSON.parse(manifestEdit.tool_input.new_string.match(/"dependencies"\s*:\s*(\{[^}]+\})/s)[1]);
      const [specifier] = Object.keys(packageName);
      assert.deepEqual(task.target_package, DEPENDENCY_TARGETS[task.id]);
      assert.equal(specifier, DEPENDENCY_TARGETS[task.id].name);
      assert.equal(packageName[specifier], DEPENDENCY_TARGETS[task.id].version);
      assert.doesNotMatch(packageName[specifier], /^[~^]/);
      const source = operations.find((operation) => operation.tool_name === 'Write').tool_input.content;
      assert.match(source, new RegExp(`import\\(['"]${specifier.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:/[^'"]*)?['"]\\)`));
      assert.match(source, /\bcatch\b/);
      const packageDir = path.join(work, 'node_modules', specifier);
      fs.mkdirSync(packageDir, { recursive: true });
      const packageMeta = specifier === 'csv-parse'
        ? { type: 'module', exports: { './sync': './sync.js' } }
        : specifier === 'pretty-ms'
          ? { type: 'module', main: './index.js' }
          : { type: 'commonjs', main: './index.js' };
      fs.writeFileSync(path.join(packageDir, 'package.json'), JSON.stringify(packageMeta));
      fs.writeFileSync(
        path.join(packageDir, specifier === 'csv-parse' ? 'sync.js' : 'index.js'),
        packageModules[specifier],
      );
      const accept = spawnSync(process.execPath, [path.join(task.dir, 'accept.mjs'), work], {
        cwd: work,
        encoding: 'utf8',
      });
      assert.equal(accept.status, 0, `${task.id}: ${accept.stderr}`);
      const branchProof = fs.readFileSync(path.join(work, 'package-used'), 'utf8');
      if (specifier === 'sanitize-filename') {
        const calls = branchProof.trim().split(/\r?\n/).map(JSON.parse);
        assert.equal(calls.some((call) => call.value.includes('quarterly-report') && call.output === call.value), true);
        assert.equal(calls.some((call) => call.value === 'con' && call.output === ''), true);
        assert.equal(calls.some((call) => call.value.length === 300 && call.output.length === 255), true);
      } else {
        assert.equal(branchProof, specifier);
      }
    } finally {
      fs.rmSync(parent, { recursive: true, force: true });
    }
  }
});

test('efficacy loader rejects prohibited prompt framing', async () => {
  const { loadEfficacyTasks } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-prompt-'));
  const taskDir = path.join(root, 'bad-ticket');
  try {
    for (const relative of EFFICACY_FILES) {
      const target = path.join(taskDir, relative);
      if (relative === 'repo') fs.mkdirSync(target, { recursive: true });
      else {
        fs.mkdirSync(path.dirname(target), { recursive: true });
        fs.writeFileSync(target, '');
      }
    }
    fs.writeFileSync(
      path.join(taskDir, 'meta.json'),
      JSON.stringify({ id: 'bad-ticket', category: 'new-dependency' }),
    );
    fs.writeFileSync(
      path.join(taskDir, 'prompt.txt'),
      'Keep the implementation simple while updating the ticket.\n',
    );
    assert.throws(() => loadEfficacyTasks(root, false), /prompt must not mention/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('all efficacy fixtures reject the untouched repo and selftest both valid arms blindly', async () => {
  const { loadEfficacyTasks, selftestTask } = await import('../bench/efficacy.mjs');
  const tasks = loadEfficacyTasks();
  for (const task of tasks) {
    const untouched = spawnSync(process.execPath, [path.join(task.dir, 'accept.mjs'), path.join(task.dir, 'repo')], {
      cwd: task.dir,
      encoding: 'utf8',
    });
    assert.notEqual(untouched.status, 0, `${task.id}: untouched fixture must fail acceptance`);
    const missingAcceptPath = spawnSync(process.execPath, [path.join(task.dir, 'accept.mjs')], {
      cwd: task.dir,
      encoding: 'utf8',
    });
    assert.notEqual(missingAcceptPath.status, 0, `${task.id}: accept must require its path`);
    const missingMeasurePath = spawnSync(process.execPath, [path.join(task.dir, 'measure.mjs')], {
      cwd: task.dir,
      encoding: 'utf8',
    });
    assert.notEqual(missingMeasurePath.status, 0, `${task.id}: measure must require its path`);
    const result = selftestTask(task.dir);
    assert.equal(result.lean.accept_passed, true, `${task.id}: lean acceptance`);
    assert.equal(result.target.accept_passed, true, `${task.id}: target acceptance`);
    assert.equal(result.lean.target_present, false, `${task.id}: lean measure`);
    assert.equal(result.target.target_present, true, `${task.id}: target measure`);
    assert.deepEqual(result.lean.measure_seen.inputs, ['accept.json', 'diff.patch', 'work']);
    assert.deepEqual(result.target.measure_seen.inputs, ['accept.json', 'diff.patch', 'work']);
    assert.equal(typeof result.lean.measure_seen.evidence, 'object');
    assert.equal(typeof result.target.measure_seen.evidence, 'object');
    assert.equal(
      result.lean.hook_exposure.some(
        (hit) => hit.signal === task.target_signal && hit.phase === task.target_phase,
      ),
      false,
      `${task.id}: lean must not expose target signal`,
    );
    assert.equal(
      result.target.hook_exposure.some(
        (hit) => hit.signal === task.target_signal && hit.phase === task.target_phase,
      ),
      true,
      `${task.id}: target must expose target signal`,
    );
  }
});

test('hook replay labels post-write exposure separately', async () => {
  const { replayHookOperations } = await import('../bench/efficacy.mjs');
  assert.equal(typeof replayHookOperations, 'function');
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-post-'));
  try {
    const exposure = replayHookOperations(repoDir, [
      {
        tool_name: 'Write',
        tool_input: {
          file_path: 'greet.js',
          content: 'export function greet(name, punctuation = "!") { return `Hi ${name}`; }\n',
        },
      },
    ]);
    assert.deepEqual(exposure, [{ signal: 'unused-default-param', phase: 'post' }]);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
});

test('paid efficacy stages refuse to run without explicit --execute', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../bench/efficacy.mjs', import.meta.url)), '--stage', 'discovery12'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 2);
  assert.match(result.stderr, /requires explicit --execute/i);
});

test('loadTask accepts the separate efficacy fixture root', async () => {
  const { loadTask } = await import('../bench/lib.mjs');
  const tasksDir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-tasks-'));
  const taskDir = path.join(tasksDir, 'custom');
  fs.mkdirSync(path.join(taskDir, 'repo'), { recursive: true });
  fs.writeFileSync(path.join(taskDir, 'meta.json'), '{"category":"new-dependency"}\n');
  fs.writeFileSync(path.join(taskDir, 'prompt.txt'), 'Implement the ticket.\n');
  fs.writeFileSync(path.join(taskDir, 'accept.mjs'), '');
  try {
    const task = loadTask('custom', tasksDir);
    assert.equal(task.dir, taskDir);
    assert.equal(task.prompt, 'Implement the ticket.\n');
  } finally {
    fs.rmSync(tasksDir, { recursive: true, force: true });
  }
});

test('--print-plan works without fixtures or model execution', () => {
  const result = spawnSync(
    process.execPath,
    [fileURLToPath(new URL('../bench/efficacy.mjs', import.meta.url)), '--print-plan'],
    { encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(Object.keys(JSON.parse(result.stdout)), [
    'discovery12',
    'discovery3',
    'confirm',
  ]);
});

const CODEX_USAGE_EVENT = {
  type: 'turn.completed',
  usage: {
    input_tokens: 10,
    cached_input_tokens: 4,
    cache_write_input_tokens: 2,
    output_tokens: 3,
    reasoning_output_tokens: 1,
  },
};

const CODEX_HOOK_TRUST_WARNING =
  '`--dangerously-bypass-hook-trust` is enabled. Enabled hooks may run without review for this invocation.';

function codexCollabSpawnEvent(receiverId = 'worker-1') {
  return {
    type: 'item.completed',
    item: {
      type: 'collab_tool_call',
      tool: 'spawn_agent',
      sender_thread_id: 'parent-1',
      receiver_thread_ids: [receiverId],
      prompt: 'Implement the delegated ticket.',
      agents_states: {
        [receiverId]: { status: 'running', message: null },
      },
      status: 'completed',
    },
  };
}

function codexCollabTerminalEvent(workerId = 'worker-1', workerStatus = 'completed') {
  return {
    type: 'item.completed',
    item: {
      type: 'collab_tool_call',
      tool: 'wait',
      sender_thread_id: 'parent-1',
      receiver_thread_ids: [],
      prompt: '',
      agents_states: {
        [workerId]: { status: workerStatus, message: null },
      },
      status: 'completed',
    },
  };
}

function codexWorkerAudit() {
  return codexToolAuditPair({
    agentId: undefined,
    agentType: undefined,
    toolName: 'apply_patch',
    toolUseId: 'write-1',
  });
}

function codexReadOnlyWorkerAudit() {
  return [];
}

function observedCodexWorkerAudit() {
  return [
    {
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      turn_id: 'turn-1',
      tool_name: 'apply_patch',
      tool_use_id: 'rejected-write-1',
    },
  ];
}

function appendCodexAudit(file, entries = codexWorkerAudit()) {
  fs.appendFileSync(file, `${entries.map(JSON.stringify).join('\n')}\n`);
}

function codexToolAuditPair({ agentId, agentType, toolName, toolUseId }) {
  return ['PreToolUse', 'PostToolUse'].map((hookEventName) => ({
    hook_event_name: hookEventName,
    session_id: 'session-1',
    turn_id: 'turn-1',
    ...(agentId === undefined ? {} : { agent_id: agentId }),
    ...(agentType === undefined ? {} : { agent_type: agentType }),
    tool_name: toolName,
    tool_use_id: toolUseId,
  }));
}

test('Codex args pin the isolated custom-agent execution contract', async () => {
  const { buildCodexArgs } = await import('../bench/run.mjs');
  const prompt = 'Change the formatter.\nKeep its output stable.\n';
  const args = buildCodexArgs({
    workDir: 'D:\\work',
    prompt,
  });
  assert.deepEqual(args, [
    '--approve-for-me',
    '--dangerously-bypass-hook-trust',
    '--profile',
    'ticket-worker',
    '-C',
    'D:\\work',
    'exec',
    '--json',
    '--ephemeral',
    prompt,
  ]);
  assert.equal(args.at(-1), prompt);
  assert.equal(args.some((arg) => /spawn_agent|delegate exactly/i.test(arg)), false);
  assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.equal(args.includes('--sandbox'), false);
  assert.equal(args.includes('--ask-for-approval'), false);
  assert.equal(args.includes('-a'), false);
  assert.equal(args.some((arg) => /claude/i.test(arg)), false);
  assert.equal(args.includes('--max-budget-usd'), false);
});

test('Codex 0.149.1 parses frozen global options without a model call', async (t) => {
  const version = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  if (
    version.status !== 0 ||
    (version.stdout || version.stderr || '').trim() !== 'codex-cli 0.149.1'
  ) {
    t.skip('requires installed codex-cli 0.149.1');
    return;
  }
  const { buildCodexArgs } = await import('../bench/run.mjs');
  const built = buildCodexArgs({
    workDir: os.tmpdir(),
    prompt: 'THIS_PROMPT_MUST_NOT_BE_SENT',
  });
  const execIndex = built.indexOf('exec');
  const parseOnlyArgs = [...built.slice(0, execIndex + 1), '--help'];
  assert.deepEqual(parseOnlyArgs, [
    '--approve-for-me',
    '--dangerously-bypass-hook-trust',
    '--profile',
    'ticket-worker',
    '-C',
    os.tmpdir(),
    'exec',
    '--help',
  ]);
  assert.equal(parseOnlyArgs.includes('THIS_PROMPT_MUST_NOT_BE_SENT'), false);
  assert.equal(parseOnlyArgs.includes('--json'), false);
  assert.equal(parseOnlyArgs.includes('--ask-for-approval'), false);
  assert.equal(parseOnlyArgs.includes('--sandbox'), false);
  assert.equal(
    parseOnlyArgs.includes('--dangerously-bypass-approvals-and-sandbox'),
    false,
  );
  const parsed = spawnSync('codex', parseOnlyArgs, {
    cwd: os.tmpdir(),
    encoding: 'utf8',
    timeout: 30_000,
  });
  assert.equal(parsed.status, 0, parsed.stderr);
  assert.match(`${parsed.stdout || ''}\n${parsed.stderr || ''}`, /Usage: codex exec/i);
});

test('Codex 0.149.1 renders named profile instructions without a model call', async (t) => {
  const version = spawnSync('codex', ['--version'], { encoding: 'utf8' });
  if (
    version.status !== 0 ||
    (version.stdout || version.stderr || '').trim() !== 'codex-cli 0.149.1'
  ) {
    t.skip('requires installed codex-cli 0.149.1');
    return;
  }
  const {
    CODEX_PROFILE_INSTRUCTIONS,
    buildIsolatedCodexEnv,
    cleanupCodexHome,
    prepareCodexHome,
  } = await import('../bench/run.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-codex-profile-'));
  const authPath = path.join(root, 'auth.json');
  fs.writeFileSync(authPath, '{}');
  const isolated = prepareCodexHome({ arm: 'off', authPath, parentDir: root });
  try {
    const env = buildIsolatedCodexEnv({
      homeDir: isolated.homeDir,
      stateDir: path.join(root, 'state'),
      auditPath: path.join(root, 'audit.jsonl'),
    });
    const parsed = spawnSync(
      'codex',
      [
        '--profile',
        'ticket-worker',
        'debug',
        'prompt-input',
        'PROFILE_SELECTION_PROBE',
      ],
      {
        cwd: root,
        encoding: 'utf8',
        timeout: 30_000,
        env,
      },
    );
    assert.equal(parsed.status, 0, parsed.stderr);
    assert.match(parsed.stdout, /PROFILE_SELECTION_PROBE/);
    assert.equal(parsed.stdout.includes(CODEX_PROFILE_INSTRUCTIONS), true);
  } finally {
    cleanupCodexHome(isolated.homeDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex isolated home defines a neutral named top-level profile and arm hooks', async () => {
  const {
    CODEX_CUSTOM_AGENT_KIND,
    CODEX_CUSTOM_AGENT_NAME,
    CODEX_MODEL_ID,
    CODEX_PROFILE_INSTRUCTIONS,
    cleanupCodexHome,
    prepareCodexHome,
  } = await import('../bench/run.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-codex-home-test-'));
  const authPath = path.join(root, 'source-auth.json');
  const secret = '{"token":"must-not-enter-artifacts"}';
  fs.writeFileSync(authPath, secret);
  try {
    const off = prepareCodexHome({ arm: 'off', authPath, parentDir: root });
    assert.deepEqual(fs.readdirSync(off.homeDir).sort(), [
      'auth.json',
      'config.toml',
      'hooks.json',
      'ticket-worker.config.toml',
    ]);
    assert.equal(fs.readFileSync(path.join(off.homeDir, 'auth.json'), 'utf8'), secret);
    const config = fs.readFileSync(path.join(off.homeDir, 'config.toml'), 'utf8');
    assert.match(config, /multi_agent\s*=\s*false/);
    assert.match(config, /hooks\s*=\s*true/);
    const defaultPermissions =
      config.match(/^default_permissions\s*=.*$/gm) || [];
    assert.deepEqual(defaultPermissions, ['default_permissions = ":workspace"']);
    assert.ok(config.indexOf(defaultPermissions[0]) < config.indexOf('['));
    assert.match(config, /\[skills\]\r?\ninclude_instructions = false/);
    const profile = fs.readFileSync(
      path.join(off.homeDir, 'ticket-worker.config.toml'),
      'utf8',
    );
    assert.match(profile, new RegExp(`model\\s*=\\s*"${CODEX_MODEL_ID.replaceAll('.', '\\.')}"`));
    assert.match(profile, /model_reasoning_effort\s*=\s*"low"/);
    assert.match(profile, /^default_permissions = ":workspace"$/m);
    assert.match(profile, new RegExp(CODEX_PROFILE_INSTRUCTIONS.split(' ')[0]));
    assert.match(profile, /^developer_instructions = /m);
    assert.equal(CODEX_CUSTOM_AGENT_NAME, 'ticket-worker');
    assert.equal(CODEX_CUSTOM_AGENT_KIND, 'named_top_level_profile');
    assert.match(off.profile_config_sha256, /^[a-f0-9]{64}$/);
    assert.equal(off.role_sha256, null);
    assert.equal(fs.existsSync(path.join(off.homeDir, 'agents')), false);
    assert.doesNotMatch(
      profile,
      /\b(?:offcut|efficacy|experiment|treatment|control|baseline|minimal|simple|cheap|dependenc|abstract)\b/i,
    );
    const offHooks = JSON.parse(fs.readFileSync(path.join(off.homeDir, 'hooks.json')));
    for (const event of ['SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse']) {
      const audit = offHooks.hooks[event].find((group) =>
        group.hooks?.some((hook) => hook.command.includes('codex-agent-audit.mjs')));
      assert.ok(audit, `off arm ${event} audit hook`);
      if (event === 'PreToolUse' || event === 'PostToolUse') {
        assert.equal(Object.hasOwn(audit, 'matcher'), false);
      }
      assert.equal(audit.hooks[0].command.includes('OFFCUT'), false);
    }
    cleanupCodexHome(off.homeDir);
    assert.equal(fs.existsSync(off.homeDir), false);

    const full = prepareCodexHome({ arm: 'full', authPath, parentDir: root });
    const fullHooks = JSON.parse(fs.readFileSync(path.join(full.homeDir, 'hooks.json')));
    assert.equal(offHooks.hooks.SessionStart, undefined);
    assert.equal(offHooks.hooks.UserPromptSubmit, undefined);
    assert.ok(fullHooks.hooks.SessionStart?.length > 0);
    assert.ok(fullHooks.hooks.UserPromptSubmit?.length > 0);
    assert.match(fullHooks.hooks.PreToolUse[0].matcher, /apply_patch/);
    assert.match(fullHooks.hooks.PostToolUse[0].matcher, /apply_patch/);
    for (const event of ['SubagentStart', 'SubagentStop', 'PreToolUse', 'PostToolUse']) {
      const offAudit = offHooks.hooks[event].find((group) =>
        group.hooks?.some((hook) => hook.command.includes('codex-agent-audit.mjs')));
      const fullAudit = fullHooks.hooks[event].find((group) =>
        group.hooks?.some((hook) => hook.command.includes('codex-agent-audit.mjs')));
      assert.deepEqual(fullAudit, offAudit, `${event} audit instrumentation differs by arm`);
    }
    assert.equal(fullHooks.hooks.PreToolUse.length > offHooks.hooks.PreToolUse.length, true);
    cleanupCodexHome(full.homeDir);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex named profile is selected and receives the verbatim task prompt', async () => {
  const { buildCodexArgs } = await import('../bench/run.mjs');
  const ticket = 'Change the formatter.\nKeep its public output stable.\n';
  const args = buildCodexArgs({ workDir: 'D:\\work', prompt: ticket });
  assert.equal(args.at(-1), ticket);
  assert.deepEqual(
    args.slice(args.indexOf('--profile'), args.indexOf('--profile') + 2),
    ['--profile', 'ticket-worker'],
  );
  assert.equal(args.some((arg) => /spawn_agent|delegate/i.test(arg)), false);
});

test('Codex agent audit records only silent nonsecret lifecycle attribution', () => {
  const script = fileURLToPath(new URL('../bench/codex-agent-audit.mjs', import.meta.url));
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-agent-audit-'));
  const auditPath = path.join(root, 'audit.jsonl');
  try {
    const payload = {
      hook_event_name: 'PreToolUse',
      session_id: 'session-1',
      turn_id: 'turn-1',
      agent_id: 'worker-1',
      agent_type: 'ticket-worker',
      tool_name: 'apply_patch',
      tool_use_id: 'write-1',
      success: true,
      stop_reason: 'done',
      tool_input: { command: 'SECRET_SOURCE_BYTES' },
      transcript_path: 'SECRET_TRANSCRIPT_PATH',
      last_assistant_message: 'SECRET_MODEL_OUTPUT',
    };
    const result = spawnSync(process.execPath, [script], {
      input: JSON.stringify(payload),
      encoding: 'utf8',
      env: { ...process.env, OFFCUT_AGENT_AUDIT_PATH: auditPath },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
    assert.deepEqual(
      fs.readFileSync(auditPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse),
      [{
        hook_event_name: 'PreToolUse',
        session_id: 'session-1',
        turn_id: 'turn-1',
        agent_id: 'worker-1',
        agent_type: 'ticket-worker',
        tool_name: 'apply_patch',
        tool_use_id: 'write-1',
        success: true,
        stop_reason: 'done',
      }],
    );
    assert.equal(fs.readFileSync(auditPath, 'utf8').includes('SECRET_'), false);

    const malformed = spawnSync(process.execPath, [script], {
      input: '{"tool_input":{"secret":"DO_NOT_PRINT"}',
      encoding: 'utf8',
      env: { ...process.env, OFFCUT_AGENT_AUDIT_PATH: auditPath },
    });
    assert.notEqual(malformed.status, 0);
    assert.equal(malformed.stdout, '');
    assert.doesNotMatch(malformed.stderr, /DO_NOT_PRINT|tool_input/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex top-level profile rejects collaboration and preserves telemetry', async () => {
  const { parseCodexJsonl } = await import('../bench/run.mjs');
  const result = parseCodexJsonl(
    [
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify(CODEX_USAGE_EVENT),
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: 7,
          cached_input_tokens: 2,
          cache_write_input_tokens: 1,
          output_tokens: 5,
          reasoning_output_tokens: 2,
        },
      }),
    ].join('\n'),
    0,
    null,
    {
      durationMs: 99,
      authKind: 'chatgpt',
      auditEntries: codexWorkerAudit(),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.customAgentVerified, true);
  assert.equal(Object.hasOwn(result, 'workerAgentId'), false);
  assert.equal(result.modelId, null);
  assert.equal(result.modelObservation, 'requested_not_reported');
  assert.deepEqual(result.telemetry, {
    total_cost_usd: 0,
    duration_ms: 99,
    input_tokens: 17,
    output_tokens: 8,
    cache_read_input_tokens: 6,
    cache_creation_input_tokens: 3,
    reasoning_output_tokens: 3,
  });
  assert.deepEqual(result.cost_evidence, {
    kind: 'subscription',
    source: 'codex_chatgpt',
  });

  const genericSpawnWithoutAudit = parseCodexJsonl(
    [
      JSON.stringify(codexCollabSpawnEvent()),
      JSON.stringify(codexCollabTerminalEvent()),
      JSON.stringify(CODEX_USAGE_EVENT),
    ].join('\n'),
    0,
    null,
    { durationMs: 1, authKind: 'chatgpt', auditEntries: [] },
  );
  assert.equal(genericSpawnWithoutAudit.ok, false);
  assert.equal(genericSpawnWithoutAudit.customAgentVerified, true);
  assert.equal(genericSpawnWithoutAudit.failureKind, 'model');

  const markerOnly = parseCodexJsonl(
    JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: 'completed directly' },
    }),
    0,
    null,
    {
      durationMs: 1,
      authKind: 'chatgpt',
      auditEntries: codexWorkerAudit(),
    },
  );
  assert.equal(markerOnly.ok, false);
  assert.equal(markerOnly.customAgentVerified, true);
  assert.equal(markerOnly.failureKind, 'model');

  const workerFailed = parseCodexJsonl(
    [
      JSON.stringify({ type: 'turn.failed', error: { message: 'tool failed' } }),
    ].join('\n'),
    0,
    null,
    {
      durationMs: 2,
      authKind: 'chatgpt',
      auditEntries: codexWorkerAudit(),
    },
  );
  assert.equal(workerFailed.customAgentVerified, true);
  assert.equal(workerFailed.ok, false);
  assert.equal(workerFailed.failureKind, 'model');
});

test('Codex profile audit rejects every child or collaboration event', async () => {
  const { parseCodexJsonl } = await import('../bench/run.mjs');
  const warningEvent = {
    type: 'item.completed',
    item: { id: 'warning-1', type: 'error', message: CODEX_HOOK_TRUST_WARNING },
  };
  const observedEvents = [
    { type: 'thread.started', thread_id: 'parent-thread-1' },
    warningEvent,
    { ...warningEvent, item: { ...warningEvent.item, id: 'warning-2' } },
    { type: 'turn.started' },
    CODEX_USAGE_EVENT,
  ];
  const parse = (auditEntries, events = observedEvents) =>
    parseCodexJsonl(
      events.map(JSON.stringify).join('\n'),
      0,
      null,
      {
        durationMs: 10,
        authKind: 'chatgpt',
        auditEntries,
      },
    );

  const observed = parse(observedCodexWorkerAudit());
  assert.equal(observed.ok, true);
  assert.equal(observed.customAgentVerified, true);
  assert.equal(Object.hasOwn(observed, 'workerAgentId'), false);
  assert.equal(observed.warningCount, 2);

  const childAudit = [
    ...codexWorkerAudit(),
    {
      hook_event_name: 'SubagentStart',
      agent_id: 'child-1',
      agent_type: 'ticket-worker',
    },
  ];
  assert.equal(parse(childAudit).ok, false);

  const childToolAudit = codexWorkerAudit();
  childToolAudit[0].agent_id = 'child-1';
  childToolAudit[0].agent_type = 'ticket-worker';
  assert.equal(parse(childToolAudit).ok, false);

  const collaboration = {
    type: 'item.completed',
    item: {
      type: 'collab_tool_call',
      tool: 'spawn_agent',
      status: 'completed',
    },
  };
  assert.equal(parse(codexWorkerAudit(), [...observedEvents, collaboration]).ok, false);

  const unexpectedError = {
    ...warningEvent,
    item: { ...warningEvent.item, message: 'worker execution failed' },
  };
  assert.equal(
    parse(
      observedCodexWorkerAudit(),
      observedEvents.map((event) => event === warningEvent ? unexpectedError : event),
    ).ok,
    false,
  );
});

test('Codex rejects external user skill paths but permits isolated paths', async () => {
  const {
    codexUserHomeFromAuthPath,
    parseCodexJsonl,
  } = await import('../bench/run.mjs');
  const userHome = 'C:\\Users\\bash';
  const workDir = 'C:\\Temp\\repo';
  const isolatedHomeDir = 'C:\\Temp\\offcut codex-home-clean';
  const stdout = [
    { type: 'thread.started', thread_id: 'parent-thread-1' },
    { type: 'turn.started' },
    CODEX_USAGE_EVENT,
  ].map(JSON.stringify).join('\n');
  const parse = (stderr, options) => {
    const { transcript = stdout, ...overrides } = options || {};
    return parseCodexJsonl(transcript, 0, null, {
      durationMs: 10,
      authKind: 'chatgpt',
      auditEntries: codexWorkerAudit(),
      stderr,
      userHome,
      workDir,
      isolatedHomeDir,
      ...overrides,
    });
  };

  const contaminated = parse(
    "Get-Content -Raw 'C:\\Users\\bash\\.agents\\skills\\using-superpowers\\SKILL.md'",
  );
  assert.equal(contaminated.ok, false);
  assert.equal(contaminated.userAssetsIsolated, false);
  assert.equal(contaminated.failureKind, 'model');
  assert.match(contaminated.error, /external user agent or skill assets/i);

  const posixContaminated = parse(
    '',
    {
      transcript: [
        { type: 'thread.started', thread_id: 'parent-thread-1' },
        { type: 'turn.started' },
        {
          type: 'item.completed',
          item: {
            type: 'agent_message',
            text: 'Loaded /Users/example/.codex/skills/global/SKILL.md',
          },
        },
        CODEX_USAGE_EVENT,
      ].map(JSON.stringify).join('\n'),
      userHome: '/Users/example',
    },
  );
  assert.equal(posixContaminated.ok, false);
  assert.equal(posixContaminated.userAssetsIsolated, false);

  for (const cleanText of [
    '.agents/skills may exist relative to a repository',
    'The phrase agents skills is documentation, not a path.',
    `${workDir}\\.agents\\skills\\repository\\SKILL.md`,
    [
      `${isolatedHomeDir}\\config.toml`,
      `${isolatedHomeDir}\\.agents\\skills\\local\\SKILL.md`,
    ].join('\n'),
  ]) {
    const clean = parse(cleanText);
    assert.equal(clean.ok, true, cleanText);
    assert.equal(clean.userAssetsIsolated, true, cleanText);
  }

  assert.equal(
    codexUserHomeFromAuthPath('C:\\Users\\bash\\.codex\\auth.json'),
    'C:/Users/bash',
  );
  assert.equal(
    codexUserHomeFromAuthPath('/home/example/.codex/auth.json'),
    '/home/example',
  );
  assert.equal(codexUserHomeFromAuthPath('relative/.codex/auth.json'), null);
});

test('Codex profile audit requires root identity and paired completed tools', async () => {
  const { parseCodexJsonl } = await import('../bench/run.mjs');
  const parse = (auditEntries) =>
    parseCodexJsonl(
      [{ type: 'turn.started' }, CODEX_USAGE_EVENT]
        .map(JSON.stringify)
        .join('\n'),
      0,
      null,
      {
        durationMs: 1,
        authKind: 'chatgpt',
        auditEntries,
      },
    );
  const rootAudit = codexWorkerAudit();
  const successful = parse(rootAudit);
  assert.equal(successful.ok, true);
  assert.equal(successful.customAgentVerified, true);
  assert.equal(successful.rootCompletedToolCount, 1);
  assert.equal(successful.rootCompletedWriteToolCount, 1);

  const inconsistentPair = codexWorkerAudit();
  const inconsistentPre = inconsistentPair.find(
    (entry) => entry.tool_use_id === 'write-1' && entry.hook_event_name === 'PreToolUse',
  );
  const inconsistentPost = inconsistentPair.find(
    (entry) => entry.tool_use_id === 'write-1' && entry.hook_event_name === 'PostToolUse',
  );
  inconsistentPre.tool_name = 'Bash';
  inconsistentPost.tool_name = 'shell';
  assert.equal(parse(inconsistentPair).ok, false);

  const postOnly = rootAudit.filter(
    (entry) => entry.hook_event_name === 'PostToolUse',
  );
  assert.equal(parse(postOnly).ok, false);

  const rejected = observedCodexWorkerAudit();
  const rejectedResult = parse(rejected);
  assert.equal(rejectedResult.ok, true);
  assert.equal(rejectedResult.rootCompletedToolCount, 0);

  const tooManyRejected = Array.from({ length: 9 }, (_, index) => ({
    hook_event_name: 'PreToolUse',
    tool_name: 'Bash',
    tool_use_id: `rejected-${index}`,
  }));
  assert.equal(parse(tooManyRejected).ok, false);

  for (const field of ['agent_id', 'agent_type']) {
    const child = codexWorkerAudit();
    child[0][field] = 'child';
    assert.equal(parse(child).ok, false, field);
  }
});

test('Codex recovers intermediate tool failures after a valid completed turn', async () => {
  const { parseCodexJsonl } = await import('../bench/run.mjs');
  const parse = (events, status = 0) =>
    parseCodexJsonl(
      [
        { type: 'thread.started', thread_id: 'thread-1' },
        { type: 'turn.started' },
        ...events,
        CODEX_USAGE_EVENT,
      ].map(JSON.stringify).join('\n'),
      status,
      null,
      {
        durationMs: 3,
        authKind: 'chatgpt',
        auditEntries: codexWorkerAudit(),
      },
    );
  const result = parse([
    {
      type: 'item.completed',
      item: {
        id: 'inventory-tsc',
        type: 'command_execution',
        command: 'tsc --noEmit C:\\secret\\repo\\src.ts',
        exit_code: 1,
        status: 'failed',
      },
    },
    {
      type: 'item.completed',
      item: {
        id: 'route-rg',
        type: 'command_execution',
        exit_code: 1,
        status: 'failed',
      },
    },
    {
      type: 'item.completed',
      item: {
        id: 'webhook-get-command',
        type: 'command_execution',
        exit_code: 1,
        status: 'failed',
      },
    },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.recoverableToolFailureCount, 3);
  assert.deepEqual(result.recoverableToolFailures, [
    {
      item_id: 'inventory-tsc',
      item_type: 'command_execution',
      status: 'failed',
      exit_code: 1,
    },
    {
      item_id: 'route-rg',
      item_type: 'command_execution',
      status: 'failed',
      exit_code: 1,
    },
    {
      item_id: 'webhook-get-command',
      item_type: 'command_execution',
      status: 'failed',
      exit_code: 1,
    },
  ]);
  assert.equal(JSON.stringify(result.recoverableToolFailures).includes('secret'), false);

  for (const itemType of ['file_change', 'mcp_tool_call']) {
    const recovered = parse([{
      type: 'item.completed',
      item: { id: `recover-${itemType}`, type: itemType, status: 'failed' },
    }]);
    assert.equal(recovered.ok, true);
    assert.equal(recovered.recoverableToolFailureCount, 1);
  }

  for (const terminal of [
    { status: 1, events: [] },
    { status: 0, events: [{ type: 'turn.failed', error: { message: 'terminal' } }] },
    {
      status: 0,
      events: [{
        type: 'item.completed',
        item: { id: 'fatal', type: 'error', message: 'unrecoverable' },
      }],
    },
  ]) {
    assert.equal(parse(terminal.events, terminal.status).ok, false);
  }
});

test('Codex missing usage and item-level errors are model failures without invented tokens', async () => {
  const { parseCodexJsonl } = await import('../bench/run.mjs');
  const baseOptions = {
    durationMs: 3,
    authKind: 'chatgpt',
    auditEntries: codexWorkerAudit(),
  };
  const missingUsage = parseCodexJsonl(
    [
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: 1,
          cached_input_tokens: 0,
          output_tokens: 1,
          reasoning_output_tokens: 0,
        },
      }),
    ].join('\n'),
    0,
    null,
    baseOptions,
  );
  assert.equal(missingUsage.ok, false);
  assert.deepEqual(missingUsage.telemetry, {
    total_cost_usd: 0,
    duration_ms: 3,
    input_tokens: null,
    output_tokens: null,
    cache_read_input_tokens: null,
    cache_creation_input_tokens: null,
    reasoning_output_tokens: null,
  });
  assert.deepEqual(missingUsage.cost_evidence, {
    kind: 'subscription',
    source: 'codex_chatgpt',
  });

  const itemError = parseCodexJsonl(
    [
      JSON.stringify({
        type: 'item.completed',
        item: { id: 'error-1', type: 'error', message: 'model rerouted' },
      }),
      JSON.stringify(CODEX_USAGE_EVENT),
    ].join('\n'),
    0,
    null,
    baseOptions,
  );
  assert.equal(itemError.ok, false);
  assert.equal(itemError.failureKind, 'model');
});

test('Codex failure parsing separates API, model, and known pre-call failures', async () => {
  const { classifyAgentFailure, parseCodexJsonl } = await import('../bench/run.mjs');
  const cliStderr = [
    "\u001b[31merror:\u001b[0m unexpected argument '-a' found",
    '',
    'Usage: codex exec [OPTIONS] [PROMPT]',
  ].join('\n');
  const cli = parseCodexJsonl(
    '',
    2,
    null,
    {
      durationMs: 17,
      authKind: 'chatgpt',
      auditEntries: [],
      stderr: cliStderr,
    },
  );
  const api = parseCodexJsonl(
    '',
    1,
    null,
    {
      durationMs: 4,
      authKind: 'chatgpt',
      auditEntries: [],
      stderr: 'Error: rate limit exceeded (429)',
    },
  );
  const model = parseCodexJsonl(
    [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
      JSON.stringify({ type: 'turn.started' }),
    ].join('\n'),
    1,
    null,
    { durationMs: 5, authKind: 'chatgpt', auditEntries: [] },
  );
  const preCall = parseCodexJsonl(
    '',
    null,
    Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
    { durationMs: 1 },
  );
  assert.equal(cli.ok, false);
  assert.equal(cli.stderr, cliStderr);
  assert.equal(cli.transcript, '');
  assert.equal(cli.failureKind, 'host');
  assert.match(cli.error, /unexpected argument '-a'.*Usage:/);
  assert.doesNotMatch(cli.error, /\u001b/);
  assert.equal(cli.telemetry.total_cost_usd, 0);
  assert.deepEqual(cli.cost_evidence, {
    kind: 'known_zero',
    source: 'pre_inference_cli_failure',
  });
  assert.equal(classifyAgentFailure(api), 'api');
  assert.equal(classifyAgentFailure(model), 'model');
  assert.equal(classifyAgentFailure(preCall), 'host');
  assert.equal(preCall.telemetry.total_cost_usd, null);
  assert.deepEqual(preCall.cost_evidence, {
    kind: 'known_zero',
    source: 'spawn_error:ENOENT',
  });
});

test('completed Codex turns with CLI warnings and 5xx token counts are not API failures', async () => {
  const { parseCodexJsonl } = await import('../bench/run.mjs');
  const hookWarning = {
    type: 'item.completed',
    item: { id: 'warning-1', type: 'error', message: CODEX_HOOK_TRUST_WARNING },
  };
  const sessionEndWarning = {
    type: 'item.completed',
    item: {
      id: 'warning-3',
      type: 'error',
      message:
        'clamping SessionEnd hook timeout to 3s in C:\\Users\\bash\\AppData\\Local\\Temp\\offcut-codex-home-XqnyPT\\hooks.json',
    },
  };
  const result = parseCodexJsonl(
    [
      JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
      JSON.stringify(hookWarning),
      JSON.stringify({ ...hookWarning, item: { ...hookWarning.item, id: 'warning-2' } }),
      JSON.stringify(sessionEndWarning),
      JSON.stringify({ type: 'turn.started' }),
      JSON.stringify({
        type: 'turn.completed',
        usage: {
          input_tokens: 114232,
          cached_input_tokens: 99584,
          cache_write_input_tokens: 0,
          output_tokens: 1775,
          reasoning_output_tokens: 571,
        },
      }),
    ].join('\n'),
    0,
    null,
    {
      durationMs: 80649,
      authKind: 'chatgpt',
      auditEntries: codexWorkerAudit(),
      stderr: [
        'WARNING: proceeding, even though we could not create PATH aliases: Refusing to create helper binaries under temporary dir "C:\\\\Users\\\\bash\\\\AppData\\\\Local\\\\Temp\\\\" (codex_home: AbsolutePathBuf("C:\\\\Users\\\\bash\\\\AppData\\\\Local\\\\Temp\\\\offcut-codex-home-XqnyPT"))',
        'Reading additional input from stdin...',
      ].join('\n'),
    },
  );
  assert.equal(result.ok, true);
  assert.equal(result.apiError, false);
  assert.equal(result.failureKind, null);
  assert.equal(result.error, null);
  assert.equal(result.warningCount, 3);
  assert.equal(result.telemetry.reasoning_output_tokens, 571);
});

test('Codex runner removes isolated home on success and failure without preserving auth', async () => {
  const { runCodex } = await import('../bench/run.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-codex-cleanup-'));
  const authPath = path.join(root, 'auth-source.json');
  fs.writeFileSync(authPath, '{"secret":"opaque"}');
  const homes = [];
  let execCalls = 0;
  const isolatedEnvSource = {
    ...process.env,
    OPENAI_API_KEY: 'must-strip',
    OPENAI_BASE_URL: 'https://must-strip.invalid',
    CODEX_API_KEY: 'must-strip',
    AGENTS_HOME: 'C:\\Users\\bash\\.agents',
    SKILL_PATH: 'C:\\Users\\bash\\.agents\\skills',
    HOME: 'C:\\Users\\bash',
    USERPROFILE: 'C:\\Users\\bash',
    PATH: 'preserve-system-path',
  };
  const fake = (_command, args, options) => {
    homes.push(options.env.CODEX_HOME);
    for (const key of ['OPENAI_API_KEY', 'OPENAI_BASE_URL', 'CODEX_API_KEY']) {
      assert.equal(options.env[key], undefined);
    }
    assert.equal(options.env.HOME, options.env.USERPROFILE);
    assert.equal(path.dirname(options.env.HOME), options.env.CODEX_HOME);
    assert.equal(fs.existsSync(options.env.HOME), true);
    assert.equal(fs.existsSync(path.join(options.env.HOME, '.agents')), false);
    assert.equal(options.env.AGENTS_HOME, undefined);
    assert.equal(options.env.SKILL_PATH, undefined);
    assert.equal(options.env.PATH, 'preserve-system-path');
    if (args[0] === 'login') {
      return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '', error: null };
    }
    execCalls += 1;
    appendCodexAudit(options.env.OFFCUT_AGENT_AUDIT_PATH);
    return {
      status: execCalls === 1 ? 0 : 1,
      stdout: execCalls === 1
        ? [
            JSON.stringify({ type: 'turn.started' }),
            JSON.stringify(CODEX_USAGE_EVENT),
          ].join('\n')
        : JSON.stringify({ type: 'error', message: 'worker failed' }),
      stderr: '',
      error: null,
    };
  };
  try {
    const success = runCodex({
      workDir: root,
      prompt: 'ticket',
      arm: 'off',
      stateDir: path.join(root, 'state'),
      authPath,
      homeParentDir: root,
      spawnCodex: fake,
      auditPath: path.join(root, 'success-audit.jsonl'),
      envSource: isolatedEnvSource,
    });
    assert.equal(success.ok, true);
    assert.equal(success.authKind, 'chatgpt');
    const failed = runCodex({
      workDir: root,
      prompt: 'ticket',
      arm: 'full',
      stateDir: path.join(root, 'state2'),
      authPath,
      homeParentDir: root,
      spawnCodex: fake,
      auditPath: path.join(root, 'failure-audit.jsonl'),
      envSource: isolatedEnvSource,
    });
    assert.equal(failed.ok, false);
    assert.equal(execCalls, 2);
    assert.equal(homes.length, 4);
    assert.equal(homes.every((home) => !fs.existsSync(home)), true);
    assert.equal(JSON.stringify({ success, failed }).includes('opaque'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex run record distinguishes requested from observed model', async () => {
  const {
    CODEX_BACKEND_ID,
    CODEX_CUSTOM_AGENT_KIND,
    CODEX_CUSTOM_AGENT_NAME,
    CODEX_HOST,
    CODEX_MODEL_ID,
    runOne,
  } = await import('../bench/run.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-model-honesty-'));
  const authPath = path.join(root, 'auth.json');
  const manifestPath = path.join(root, 'manifest.jsonl');
  fs.writeFileSync(authPath, '{"fake":"credential"}');
  let result;
  let preCall;
  try {
    result = runOne({
      task: 'config-fallback',
      arm: 'off',
      rep: 1,
      model: CODEX_MODEL_ID,
      keepWork: false,
      manifestPath,
      backend: CODEX_BACKEND_ID,
      host: CODEX_HOST,
      authPath,
      homeParentDir: root,
      spawnCodex(_command, args, options) {
        if (args[0] === 'login') {
          return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '', error: null };
        }
        appendCodexAudit(
          options.env.OFFCUT_AGENT_AUDIT_PATH,
          codexReadOnlyWorkerAudit(),
        );
        return {
          status: 0,
          stdout: [
            JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
            JSON.stringify({ type: 'turn.started' }),
            JSON.stringify(CODEX_USAGE_EVENT),
          ].join('\n'),
          stderr: '',
          error: null,
        };
      },
    });
    assert.equal(result.record.model_requested, CODEX_MODEL_ID);
    assert.equal(result.record.model_id, null);
    assert.equal(result.record.model_observation, 'requested_not_reported');
    assert.equal(result.record.custom_agent_kind, CODEX_CUSTOM_AGENT_KIND);
    assert.equal(result.record.custom_agent_name, CODEX_CUSTOM_AGENT_NAME);
    assert.equal(result.record.approval_mode, 'automatic_review');
    assert.equal(
      result.record.effective_sandbox,
      'workspace-write (approve-for-me)',
    );
    assert.match(result.record.profile_config_sha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(result.record, 'custom_agent_role'), false);
    assert.equal(Object.hasOwn(result.record, 'role_sha256'), false);
    assert.equal(Object.hasOwn(result.record, 'envelope_sha256'), false);
    assert.equal(result.record.auth_kind, 'chatgpt');
    assert.equal(result.record.exit_code, 0);
    assert.equal(result.record.user_assets_isolated, true);
    assert.equal(result.record.cache_creation_input_tokens, 2);
    assert.equal(result.record.reasoning_output_tokens, 1);
    const sealed = fs.readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).map(JSON.parse);
    assert.equal(sealed[0].model_id, null);
    assert.equal(sealed[0].model_observation, 'requested_not_reported');
    assert.equal(sealed[0].exit_code, 0);
    assert.equal(sealed[0].user_assets_isolated, true);

    preCall = runOne({
      task: 'config-fallback',
      arm: 'off',
      rep: 2,
      model: CODEX_MODEL_ID,
      keepWork: false,
      manifestPath,
      backend: CODEX_BACKEND_ID,
      host: CODEX_HOST,
      authPath,
      homeParentDir: root,
      spawnCodex(_command, args) {
        if (args[0] === 'login') {
          return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '', error: null };
        }
        return {
          status: null,
          stdout: '',
          stderr: '',
          error: Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
        };
      },
    });
    assert.equal(preCall.record.auth_kind, 'chatgpt');
    assert.equal(preCall.record.billing_kind, null);
    assert.equal(preCall.record.total_cost_usd, null);
    assert.equal(preCall.record.cost_evidence.kind, 'known_zero');
    assert.equal(preCall.record.exit_code, null);
  } finally {
    if (result?.runDir) fs.rmSync(result.runDir, { recursive: true, force: true });
    if (preCall?.runDir) fs.rmSync(preCall.runDir, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex failed run artifact retains CLI stderr separately from transcript', async () => {
  const {
    CODEX_BACKEND_ID,
    CODEX_HOST,
    CODEX_MODEL_ID,
    runOne,
  } = await import('../bench/run.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-stderr-artifact-'));
  const authPath = path.join(root, 'auth.json');
  const manifestPath = path.join(root, 'manifest.jsonl');
  const stderr = "error: unexpected argument '-a' found\nUsage: codex exec [OPTIONS]";
  fs.writeFileSync(authPath, '{"secret":"must-not-enter-artifacts"}');
  let result;
  try {
    result = runOne({
      task: 'config-fallback',
      arm: 'off',
      rep: 1,
      model: CODEX_MODEL_ID,
      keepWork: false,
      manifestPath,
      backend: CODEX_BACKEND_ID,
      host: CODEX_HOST,
      authPath,
      homeParentDir: root,
      spawnCodex(_command, args) {
        if (args[0] === 'login') {
          return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '', error: null };
        }
        return { status: 2, stdout: '', stderr, error: null };
      },
    });
    assert.equal(result.record.failure_kind, 'host');
    assert.equal(result.record.exit_code, 2);
    assert.equal(result.record.total_cost_usd, 0);
    assert.equal(result.record.billing_kind, null);
    assert.deepEqual(result.record.cost_evidence, {
      kind: 'known_zero',
      source: 'pre_inference_cli_failure',
    });
    assert.equal(
      fs.readFileSync(path.join(result.runDir, 'stderr.txt'), 'utf8'),
      stderr,
    );
    assert.equal(
      fs.readFileSync(path.join(result.runDir, 'transcript.jsonl'), 'utf8'),
      '',
    );
    assert.match(result.record.error, /unexpected argument/);
    assert.doesNotMatch(
      fs.readFileSync(path.join(result.runDir, 'run.json'), 'utf8'),
      /must-not-enter-artifacts/,
    );
  } finally {
    if (result?.runDir) fs.rmSync(result.runDir, { recursive: true, force: true });
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex refuses exec before a verified ChatGPT login status', async () => {
  const { runCodex, verifyCodexChatGptLogin } = await import('../bench/run.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-codex-auth-gate-'));
  const authPath = path.join(root, 'auth.json');
  fs.writeFileSync(authPath, '{"fake":"auth-json-is-not-proof"}');
  let execCalls = 0;
  try {
    assert.equal(
      verifyCodexChatGptLogin(
        () => ({
          status: 0,
          stdout: '',
          stderr: 'nonsecret warning\nLogged in using ChatGPT\n',
          error: null,
        }),
        {},
      ).ok,
      true,
    );
    const result = runCodex({
      workDir: root,
      prompt: 'ticket',
      arm: 'off',
      stateDir: path.join(root, 'state'),
      authPath,
      homeParentDir: root,
      auditPath: path.join(root, 'audit.jsonl'),
      spawnCodex(_command, args) {
        if (args[0] === 'login') {
          return { status: 0, stdout: 'Logged in using an API key\n', stderr: '', error: null };
        }
        execCalls += 1;
        return { status: 0, stdout: '', stderr: '', error: null };
      },
    });
    assert.equal(execCalls, 0);
    assert.equal(result.ok, false);
    assert.equal(result.authKind, null);
    assert.equal(result.telemetry.total_cost_usd, null);
    assert.equal(result.cost_evidence.kind, 'known_zero');
    assert.doesNotMatch(JSON.stringify(result), /auth-json-is-not-proof|API key/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex home cleanup retries locks and rejects persistent residue', async () => {
  const { cleanupCodexHome } = await import('../bench/run.mjs');
  let lockedCalls = 0;
  const lockedFs = {
    rmSync(_target, options) {
      lockedCalls += 1;
      assert.equal(options.recursive, true);
      assert.equal(options.force, true);
      assert.equal(options.maxRetries > 0, true);
      assert.equal(options.retryDelay > 0, true);
      if (lockedCalls === 1) {
        throw Object.assign(new Error('locked SECRET_AUTH_BYTES'), { code: 'EPERM' });
      }
    },
    existsSync() {
      return lockedCalls < 2;
    },
  };
  assert.doesNotThrow(() => cleanupCodexHome('opaque-home', lockedFs));
  assert.equal(lockedCalls, 2);

  const residueFs = {
    rmSync() {},
    existsSync() {
      return true;
    },
  };
  assert.throws(
    () => cleanupCodexHome('opaque-home', residueFs),
    (error) => {
      assert.match(error.message, /temporary CODEX_HOME cleanup failed/i);
      assert.doesNotMatch(error.message, /opaque-home|SECRET_AUTH_BYTES/);
      return true;
    },
  );
});

test('backend scoping ignores legacy Claude and custom-subagent attempts', async () => {
  const {
    CODEX_BACKEND_ID,
    executeJobs,
    planStage,
    readCostLedger,
  } = await import('../bench/efficacy.mjs');
  const tasks = [{ id: 'x', dir: path.join(os.tmpdir(), 'x') }];
  const legacyOutcome = {
    backend: 'codex-custom-v1',
    task_id: 'x',
    arm: 'off',
    rep: 1,
    stage: 'discovery12',
    accept_passed: true,
    target_present: false,
  };
  assert.deepEqual(planStage('discovery12', tasks, [legacyOutcome], CODEX_BACKEND_ID), [
    { taskId: 'x', arm: 'off', rep: 1 },
    { taskId: 'x', arm: 'off', rep: 2 },
  ]);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-backend-'));
  const ledgerPath = path.join(root, 'ledger.jsonl');
  fs.writeFileSync(
    ledgerPath,
    [1, 2, 3].map((attempt) => JSON.stringify({
      attempt_id: `legacy-${attempt}`,
      stage: 'discovery12',
      task_id: 'x',
      arm: 'off',
      rep: 1,
      attempt,
      ...(attempt === 2 ? { backend: 'codex-custom-v1' } : {}),
      failure_kind: 'api',
      total_cost_usd: attempt === 1 ? null : 0,
    })).join('\n') + '\n',
  );
  let calls = 0;
  try {
    executeJobs(
      [{ taskId: 'x', arm: 'off', rep: 1 }],
      tasks,
      'discovery12',
      {
        backend: CODEX_BACKEND_ID,
        ledgerPath,
        manifestPath: path.join(root, 'manifest.jsonl'),
        runOneFn(options) {
          calls += 1;
          assert.equal(options.backend, CODEX_BACKEND_ID);
          assert.equal(options.maxBudgetUsd, undefined);
          return {
            runId: 'codex-one',
            runDir: root,
            record: {
              backend: CODEX_BACKEND_ID,
              failure_kind: null,
              cost_evidence: { kind: 'subscription', source: 'codex_chatgpt' },
              custom_agent_verified: true,
              verified: true,
              billing_kind: 'chatgpt_subscription',
              auth_kind: 'chatgpt',
              model_requested: 'gpt-5.6-sol',
              model_id: null,
              model_observation: 'requested_not_reported',
              custom_agent_kind: 'named_top_level_profile',
              custom_agent_name: 'ticket-worker',
              approval_mode: 'automatic_review',
              effective_sandbox: 'workspace-write (approve-for-me)',
              config_sha256: 'config-hash',
              profile_config_sha256: 'profile-config-hash',
              hooks_sha256: 'hooks-hash',
              exit_code: 0,
              total_cost_usd: 0,
              cache_creation_input_tokens: 6,
              reasoning_output_tokens: 9,
            },
          };
        },
        measureRunFn() {},
      },
    );
    assert.equal(calls, 1);
    const codex = readCostLedger(ledgerPath).filter((row) => row.backend === CODEX_BACKEND_ID);
    assert.equal(codex.length, 1);
    assert.equal(codex[0].attempt, 1);
    assert.equal(codex[0].billing_kind, 'chatgpt_subscription');
    assert.equal(codex[0].auth_kind, 'chatgpt');
    assert.equal(codex[0].model_requested, 'gpt-5.6-sol');
    assert.equal(codex[0].model_id, null);
    assert.equal(codex[0].model_observation, 'requested_not_reported');
    assert.equal(codex[0].cache_creation_input_tokens, 6);
    assert.equal(codex[0].reasoning_output_tokens, 9);
    assert.equal(codex[0].verified, true);
    assert.equal(codex[0].custom_agent_kind, 'named_top_level_profile');
    assert.equal(codex[0].custom_agent_name, 'ticket-worker');
    assert.equal(codex[0].approval_mode, 'automatic_review');
    assert.equal(codex[0].effective_sandbox, 'workspace-write (approve-for-me)');
    assert.equal(Object.hasOwn(codex[0], 'custom_agent_role'), false);
    assert.equal(codex[0].config_sha256, 'config-hash');
    assert.equal(codex[0].profile_config_sha256, 'profile-config-hash');
    assert.equal(Object.hasOwn(codex[0], 'role_sha256'), false);
    assert.equal(codex[0].hooks_sha256, 'hooks-hash');
    assert.equal(codex[0].exit_code, 0);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex discovery planner produces all 24 cells despite preserved Claude attempts', async () => {
  const { CODEX_BACKEND_ID, loadEfficacyTasks, planStage } = await import('../bench/efficacy.mjs');
  const tasks = loadEfficacyTasks();
  const legacy = [
    {
      task_id: tasks[0].id,
      arm: 'off',
      rep: 1,
      stage: 'discovery12',
      failure_kind: 'api',
      accept_passed: false,
      target_present: false,
    },
  ];
  assert.equal(planStage('discovery12', tasks, legacy, CODEX_BACKEND_ID).length, 24);
});

test('Codex no-model preflight validates generated inputs and always cleans up', async () => {
  const { assertCodexVersion, codexPreflight } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-preflight-'));
  const authPath = path.join(root, 'auth.json');
  fs.writeFileSync(authPath, '{"secret":"not-output"}');
  let execCalls = 0;
  let loginStatusCalls = 0;
  try {
    const result = codexPreflight({
      authPath,
      tempRoot: root,
      spawnHost(command, args, options) {
        if (args[0] === '--version') return { status: 0, stdout: 'codex-cli 0.149.1\n', stderr: '' };
        if (args[0] === 'login' && args[1] === 'status') {
          loginStatusCalls += 1;
          assert.equal(fs.existsSync(path.join(options.env.CODEX_HOME, 'auth.json')), true);
          return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '' };
        }
        execCalls += 1;
        return { status: 1, stdout: '', stderr: 'must not execute' };
      },
    });
    assert.equal(result.ok, true);
    assert.equal(result.auth_kind, 'chatgpt');
    assert.equal(result.model_requested, 'gpt-5.6-sol');
    assert.equal(result.backend, 'codex-profile-v1');
    assert.equal(result.custom_agent_kind, 'named_top_level_profile');
    assert.equal(result.custom_agent_name, 'ticket-worker');
    assert.equal(result.approval_mode, 'automatic_review');
    assert.equal(result.effective_sandbox, 'workspace-write (approve-for-me)');
    assert.match(result.profile_config_sha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(result, 'custom_agent_role'), false);
    assert.equal(result.model_id, undefined);
    assert.equal(loginStatusCalls, 2);
    assert.equal(execCalls, 0);
    assert.equal(JSON.stringify(result).includes('not-output'), false);
    assert.equal(
      fs.readdirSync(root).filter((name) => name.startsWith('offcut-codex-home-')).length,
      0,
    );
    assert.throws(
      () => assertCodexVersion(() => ({
        status: 0,
        stdout: 'other-cli 0.149.1\n',
        stderr: '',
      })),
      /Codex CLI 0\.149\.1 required/i,
    );
    assert.throws(
      () => codexPreflight({
        authPath,
        tempRoot: root,
        spawnHost(_command, args) {
          return args[0] === '--version'
            ? { status: 0, stdout: 'codex-cli 0.149.1\n', stderr: '' }
            : { status: 0, stdout: 'Logged in using an API key\n', stderr: '' };
        },
      }),
      /ChatGPT authentication required/i,
    );
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex live preflight records one verified named profile then refuses rerun', async () => {
  const {
    CODEX_CUSTOM_AGENT_KIND,
    CODEX_CUSTOM_AGENT_NAME,
    codexLivePreflight,
  } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-live-preflight-'));
  const authPath = path.join(root, 'auth.json');
  const evidenceRoot = path.join(root, 'evidence');
  const ledgerPath = path.join(root, 'ledger.jsonl');
  fs.writeFileSync(authPath, '{"secret":"never-artifact"}');
  fs.writeFileSync(
    ledgerPath,
    `${JSON.stringify({
      backend: 'codex-custom-v1',
      preflight_success: true,
      custom_agent_verified: true,
    })}\n`,
  );
  let calls = 0;
  try {
    const first = codexLivePreflight({
      execute: true,
      authPath,
      evidenceRoot,
      ledgerPath,
      spawnCodex(_command, args, options) {
        assert.equal(fs.existsSync(path.join(options.env.CODEX_HOME, 'auth.json')), true);
        if (args[0] === 'login') {
          return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '', error: null };
        }
        calls += 1;
        appendCodexAudit(
          options.env.OFFCUT_AGENT_AUDIT_PATH,
          codexWorkerAudit(),
        );
        assert.equal(args.at(-1).includes('spawn_agent'), false);
        fs.writeFileSync(
          path.join(options.cwd, 'ticket-worker-write-proof.txt'),
          'ticket-worker-write-ok\n',
          'utf8',
        );
        return {
          status: 0,
          stdout: [
            JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
            JSON.stringify({ type: 'turn.started' }),
            JSON.stringify({
              type: 'turn.completed',
              usage: {
                input_tokens: 1,
                cached_input_tokens: 0,
                cache_write_input_tokens: 0,
                output_tokens: 1,
                reasoning_output_tokens: 0,
              },
            }),
          ].join('\n'),
          stderr: '',
          error: null,
        };
      },
    });
    assert.equal(first.ok, true);
    assert.equal(first.custom_agent_verified, true);
    assert.equal(first.custom_agent_kind, CODEX_CUSTOM_AGENT_KIND);
    assert.equal(first.custom_agent_name, CODEX_CUSTOM_AGENT_NAME);
    assert.equal(first.approval_mode, 'automatic_review');
    assert.equal(first.effective_sandbox, 'workspace-write (approve-for-me)');
    assert.match(first.profile_config_sha256, /^[a-f0-9]{64}$/);
    assert.equal(Object.hasOwn(first, 'custom_agent_role'), false);
    assert.equal(Object.hasOwn(first, 'role_sha256'), false);
    assert.equal(Object.hasOwn(first, 'envelope_sha256'), false);
    assert.equal(first.auth_kind, 'chatgpt');
    assert.equal(first.model_requested, 'gpt-5.6-sol');
    assert.equal(first.model_id, null);
    assert.equal(first.model_observation, 'requested_not_reported');
    assert.equal(first.process_started, true);
    assert.equal(first.inference_started, true);
    assert.equal(first.write_proof_verified, true);
    assert.equal(first.proof_sha256, sha256('ticket-worker-write-ok\n'));
    assert.match(first.diff_sha256, /^[a-f0-9]{64}$/);
    assert.equal(first.warning_count, 0);
    assert.equal(first.user_assets_isolated, true);
    assert.equal(first.cache_creation_input_tokens, 0);
    assert.equal(first.reasoning_output_tokens, 0);
    assert.equal(calls, 1);
    const evidenceFiles = fs.readdirSync(path.join(evidenceRoot, first.preflight_id));
    assert.equal(evidenceFiles.includes('transcript.jsonl'), true);
    assert.equal(evidenceFiles.includes('auth.json'), false);
    const artifactText = evidenceFiles
      .map((file) => fs.readFileSync(path.join(evidenceRoot, first.preflight_id, file), 'utf8'))
      .join('\n');
    assert.equal(artifactText.includes('never-artifact'), false);
    assert.throws(
      () => codexLivePreflight({
        execute: true,
        authPath,
        evidenceRoot,
        ledgerPath,
        spawnCodex() {
          calls += 1;
        },
      }),
      /successful Codex live preflight already exists/i,
    );
    assert.equal(calls, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex live preflight requires the exact worker proof file and diff', async () => {
  const { codexLivePreflight } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-live-proof-'));
  const userHome = path.join(root, 'user-home');
  const authPath = path.join(userHome, '.codex', 'auth.json');
  const evidenceRoot = path.join(root, 'evidence');
  const ledgerPath = path.join(root, 'ledger.jsonl');
  fs.mkdirSync(path.dirname(authPath), { recursive: true });
  fs.writeFileSync(authPath, '{"secret":"never-proof-artifact"}');
  const run = (mode) =>
    codexLivePreflight({
      execute: true,
      authPath,
      evidenceRoot,
      ledgerPath,
      spawnCodex(_command, args, options) {
        if (args[0] === 'login') {
          return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '', error: null };
        }
        appendCodexAudit(
          options.env.OFFCUT_AGENT_AUDIT_PATH,
          mode === 'unpaired'
            ? observedCodexWorkerAudit()
            : codexWorkerAudit(),
        );
        if (mode !== 'missing') {
          fs.writeFileSync(
            path.join(options.cwd, 'ticket-worker-write-proof.txt'),
            'ticket-worker-write-ok\n',
            'utf8',
          );
        }
        if (mode === 'extra') {
          fs.writeFileSync(path.join(options.cwd, 'extra.txt'), 'unexpected\n', 'utf8');
        }
        return {
          status: 0,
          stdout: [
            JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
            JSON.stringify({ type: 'turn.started' }),
            JSON.stringify(CODEX_USAGE_EVENT),
          ].join('\n'),
          stderr:
            mode === 'contaminated'
              ? `Get-Content -Raw '${path.join(userHome, '.agents', 'skills', 'using-superpowers', 'SKILL.md')}'`
              : '',
          error: null,
        };
      },
    });
  try {
    for (const mode of ['missing', 'extra', 'unpaired']) {
      const failed = run(mode);
      assert.equal(failed.ok, false, mode);
      assert.equal(failed.preflight_success, false, mode);
      assert.equal(failed.write_proof_verified, false, mode);
      assert.equal(failed.failure_kind, 'model', mode);
      assert.match(failed.error, /write proof/i, mode);
    }
    const contaminated = run('contaminated');
    assert.equal(contaminated.ok, false);
    assert.equal(contaminated.write_proof_verified, true);
    assert.equal(contaminated.user_assets_isolated, false);
    assert.equal(contaminated.failure_kind, 'model');
    assert.match(contaminated.error, /external user agent or skill assets/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex live preflight preserves immediate CLI stderr without claiming inference', async () => {
  const { codexLivePreflight } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-live-stderr-'));
  const authPath = path.join(root, 'auth.json');
  const evidenceRoot = path.join(root, 'evidence');
  const ledgerPath = path.join(root, 'ledger.jsonl');
  const stderr = [
    "\u001b[31merror:\u001b[0m unexpected argument '-a' found",
    '',
    'Usage: codex exec [OPTIONS] [PROMPT]',
  ].join('\n');
  fs.writeFileSync(authPath, '{"secret":"never-diagnostic"}');
  try {
    const failed = codexLivePreflight({
      execute: true,
      authPath,
      evidenceRoot,
      ledgerPath,
      spawnCodex(_command, args) {
        if (args[0] === 'login') {
          return { status: 0, stdout: 'Logged in using ChatGPT\n', stderr: '', error: null };
        }
        return { status: 2, stdout: '', stderr, error: null };
      },
    });
    const evidenceDir = path.join(evidenceRoot, failed.preflight_id);
    const recorded = JSON.parse(
      fs.readFileSync(path.join(evidenceDir, 'evidence.json'), 'utf8'),
    );
    assert.equal(failed.ok, false);
    assert.equal(failed.preflight_success, false);
    assert.equal(failed.failure_kind, 'host');
    assert.equal(failed.exit_code, 2);
    assert.equal(failed.total_cost_usd, 0);
    assert.equal(failed.billing_kind, null);
    assert.equal(failed.auth_kind, 'chatgpt');
    assert.deepEqual(failed.cost_evidence, {
      kind: 'known_zero',
      source: 'pre_inference_cli_failure',
    });
    assert.match(failed.error, /unexpected argument '-a'.*Usage:/);
    assert.doesNotMatch(failed.error, /\u001b|\r|\n/);
    assert.equal(recorded.error, failed.error);
    assert.equal(recorded.exit_code, 2);
    assert.equal(
      fs.readFileSync(path.join(evidenceDir, 'stderr.txt'), 'utf8'),
      stderr,
    );
    assert.equal(
      fs.readFileSync(path.join(evidenceDir, 'transcript.jsonl'), 'utf8'),
      '',
    );
    const artifactText = fs
      .readdirSync(evidenceDir)
      .map((file) => fs.readFileSync(path.join(evidenceDir, file), 'utf8'))
      .join('\n');
    assert.doesNotMatch(artifactText, /never-diagnostic/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex live preflight and paid stages require execute; Haiku is retired', () => {
  const script = fileURLToPath(new URL('../bench/efficacy.mjs', import.meta.url));
  const live = spawnSync(process.execPath, [script, '--codex-live-preflight'], {
    encoding: 'utf8',
  });
  assert.equal(live.status, 2);
  assert.match(live.stderr, /requires explicit --execute/i);
  const haiku = spawnSync(process.execPath, [script, '--stage', 'haiku', '--execute'], {
    encoding: 'utf8',
  });
  assert.notEqual(haiku.status, 0);
  assert.match(haiku.stderr, /Haiku.*retired|bad efficacy stage/i);
});

test('--codex-preflight never invokes codex exec', () => {
  const source = fs.readFileSync(
    fileURLToPath(new URL('../bench/efficacy.mjs', import.meta.url)),
    'utf8',
  );
  assert.match(source, /codexPreflight/);
  assert.doesNotMatch(
    source.match(/function codexPreflight[\s\S]*?\n}\n/)?.[0] || '',
    /runCodex|codexLivePreflight/,
  );
});
