import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { appendManifest } from '../bench/lib.mjs';

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
    assert.throws(
      () =>
        executeJobs([job], [{ id: 'x', dir: path.join(dir, 'x') }], 'discovery12', {
          ledgerPath,
          manifestPath: path.join(dir, 'manifest.jsonl'),
          runOneFn(options) {
            seen.push(options);
            return {
              runId: 'three',
              runDir: dir,
              record: { failure_kind: 'api', total_cost_usd: 0.1 },
            };
          },
        }),
      /retries exhausted/i,
    );
    assert.equal(seen.length, 1);
    assert.equal(seen[0].attempt, 3);
    assert.equal(seen[0].apiRetries, 0);

    let freshCalls = 0;
    assert.throws(
      () =>
        executeJobs([job], [{ id: 'x', dir: path.join(dir, 'x') }], 'discovery12', {
          ledgerPath,
          runOneFn() {
            freshCalls += 1;
          },
        }),
      /retries exhausted/i,
    );
    assert.equal(freshCalls, 0);
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
  const { assertRawGateCommitted } = await import('../bench/efficacy.mjs');
  assert.equal(typeof assertRawGateCommitted, 'function');
  const tracked = { status: 0, stdout: 'tracked\n', stderr: '' };
  const dirtyGit = (_command, args) =>
    args[0] === 'status'
      ? { status: 0, stdout: '?? bench/efficacy-cost.jsonl\n', stderr: '' }
      : tracked;
  assert.throws(
    () => assertRawGateCommitted({ spawnGit: dirtyGit, repoRoot: 'repo' }),
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
    assertRawGateCommitted({ spawnGit: cleanGit, repoRoot: 'repo' }),
  );
  assert.equal(calls.filter((call) => call.args[0] === 'ls-files').length, 2);
  assert.equal(calls.at(-1).args[0], 'status');
  assert.equal(calls.every((call) => call.cwd === 'repo'), true);
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

test('Codex args pin the isolated custom-agent execution contract', async () => {
  const { buildCodexArgs } = await import('../bench/run.mjs');
  const args = buildCodexArgs({
    workDir: 'D:\\work',
    envelope: 'delegate exactly',
  });
  assert.deepEqual(args, [
    'exec',
    '--json',
    '--ephemeral',
    '-s',
    'workspace-write',
    '-a',
    'never',
    '--dangerously-bypass-hook-trust',
    '-C',
    'D:\\work',
    'delegate exactly',
  ]);
  assert.equal(args.includes('--dangerously-bypass-approvals-and-sandbox'), false);
  assert.equal(args.some((arg) => /claude/i.test(arg)), false);
  assert.equal(args.includes('--max-budget-usd'), false);
});

test('Codex isolated home contains only auth, neutral config, role, and arm hooks', async () => {
  const {
    CODEX_CUSTOM_ROLE,
    CODEX_MODEL_ID,
    CODEX_ROLE_INSTRUCTIONS,
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
      'agents',
      'auth.json',
      'config.toml',
      'hooks.json',
    ]);
    assert.equal(fs.readFileSync(path.join(off.homeDir, 'auth.json'), 'utf8'), secret);
    const config = fs.readFileSync(path.join(off.homeDir, 'config.toml'), 'utf8');
    assert.match(config, /multi_agent\s*=\s*true/);
    assert.match(config, /hooks\s*=\s*true/);
    assert.match(config, new RegExp(`model\\s*=\\s*"${CODEX_MODEL_ID.replaceAll('.', '\\.')}"`));
    const role = fs.readFileSync(
      path.join(off.homeDir, 'agents', `${CODEX_CUSTOM_ROLE}.toml`),
      'utf8',
    );
    assert.match(role, new RegExp(`name\\s*=\\s*"${CODEX_CUSTOM_ROLE}"`));
    assert.match(role, /model_reasoning_effort\s*=\s*"low"/);
    assert.match(role, /sandbox_mode\s*=\s*"workspace-write"/);
    assert.match(role, new RegExp(CODEX_ROLE_INSTRUCTIONS.split(' ')[0]));
    assert.match(role, /description = "Executes one delegated maintenance ticket"/);
    assert.doesNotMatch(
      CODEX_ROLE_INSTRUCTIONS,
      /\b(?:minimal|simple|cheap|dependenc|abstract)/i,
    );
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(off.homeDir, 'hooks.json'))), {
      hooks: {},
    });
    cleanupCodexHome(off.homeDir);
    assert.equal(fs.existsSync(off.homeDir), false);

    const full = prepareCodexHome({ arm: 'full', authPath, parentDir: root });
    const fullHooks = JSON.parse(fs.readFileSync(path.join(full.homeDir, 'hooks.json')));
    assert.match(fullHooks.hooks.PreToolUse[0].matcher, /apply_patch/);
    assert.match(fullHooks.hooks.PostToolUse[0].matcher, /apply_patch/);
    assert.notDeepEqual(fullHooks, { hooks: {} });
    cleanupCodexHome(full.homeDir);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex envelope is arm-neutral, delegates verbatim ticket, and is hashable', async () => {
  const { CODEX_CUSTOM_ROLE, buildCodexEnvelope } = await import('../bench/run.mjs');
  const ticket = 'Change the formatter.\nKeep its public output stable.\n';
  const first = buildCodexEnvelope(ticket);
  const second = buildCodexEnvelope(ticket);
  assert.equal(first, second);
  assert.match(first, new RegExp(CODEX_CUSTOM_ROLE));
  assert.match(first, /spawn_agent/);
  assert.match(first, /wait/i);
  assert.equal(first.includes(ticket), true);
  assert.doesNotMatch(first, /\b(?:treatment|control arm)\b/i);
});

test('Codex JSONL aggregates completed-turn usage and requires exact role spawn proof', async () => {
  const { CODEX_CUSTOM_ROLE, parseCodexJsonl } = await import('../bench/run.mjs');
  const spawn = {
    type: 'item.completed',
    item: {
      type: 'collaboration',
      tool: 'spawn_agent',
      agent_type: CODEX_CUSTOM_ROLE,
    },
  };
  const result = parseCodexJsonl(
    [
      JSON.stringify(spawn),
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 10, cached_input_tokens: 4, output_tokens: 3 },
      }),
      JSON.stringify({
        type: 'turn.completed',
        usage: { input_tokens: 7, cached_input_tokens: 2, output_tokens: 5 },
      }),
    ].join('\n'),
    0,
    null,
    { durationMs: 99 },
  );
  assert.equal(result.ok, true);
  assert.equal(result.customAgentVerified, true);
  assert.deepEqual(result.telemetry, {
    total_cost_usd: 0,
    duration_ms: 99,
    input_tokens: 17,
    output_tokens: 8,
    cache_read_input_tokens: 6,
    cache_creation_input_tokens: null,
  });
  assert.deepEqual(result.cost_evidence, {
    kind: 'subscription',
    source: 'codex_chatgpt',
  });

  const markerOnly = parseCodexJsonl(
    JSON.stringify({
      type: 'item.completed',
      item: { type: 'agent_message', text: `spawned ${CODEX_CUSTOM_ROLE}` },
    }),
    0,
    null,
    { durationMs: 1 },
  );
  assert.equal(markerOnly.ok, false);
  assert.equal(markerOnly.customAgentVerified, false);
  assert.equal(markerOnly.failureKind, 'model');

  const workerFailed = parseCodexJsonl(
    [
      JSON.stringify(spawn),
      JSON.stringify({ type: 'turn.failed', error: { message: 'tool failed' } }),
    ].join('\n'),
    0,
    null,
    { durationMs: 2 },
  );
  assert.equal(workerFailed.customAgentVerified, true);
  assert.equal(workerFailed.ok, false);
  assert.equal(workerFailed.failureKind, 'model');
});

test('Codex failure parsing separates API, model, and known pre-call failures', async () => {
  const { classifyAgentFailure, parseCodexJsonl } = await import('../bench/run.mjs');
  const api = parseCodexJsonl(
    JSON.stringify({ type: 'error', message: 'rate limit exceeded (429)' }),
    1,
    null,
    { durationMs: 4 },
  );
  const model = parseCodexJsonl(
    JSON.stringify({ type: 'error', message: 'worker could not finish ticket' }),
    1,
    null,
    { durationMs: 5 },
  );
  const preCall = parseCodexJsonl(
    '',
    null,
    Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }),
    { durationMs: 1 },
  );
  assert.equal(classifyAgentFailure(api), 'api');
  assert.equal(classifyAgentFailure(model), 'model');
  assert.equal(classifyAgentFailure(preCall), 'host');
  assert.equal(preCall.telemetry.total_cost_usd, null);
  assert.deepEqual(preCall.cost_evidence, {
    kind: 'known_zero',
    source: 'spawn_error:ENOENT',
  });
});

test('Codex runner removes isolated home on success and failure without preserving auth', async () => {
  const { CODEX_CUSTOM_ROLE, runCodex } = await import('../bench/run.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-codex-cleanup-'));
  const authPath = path.join(root, 'auth-source.json');
  fs.writeFileSync(authPath, '{"secret":"opaque"}');
  const homes = [];
  const fake = (_command, _args, options) => {
    homes.push(options.env.CODEX_HOME);
    return {
      status: homes.length === 1 ? 0 : 1,
      stdout: homes.length === 1
        ? [
            JSON.stringify({
              type: 'item.completed',
              item: {
                type: 'collaboration',
                tool: 'spawn_agent',
                agent_type: CODEX_CUSTOM_ROLE,
              },
            }),
            JSON.stringify({ type: 'turn.completed', usage: {} }),
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
    });
    assert.equal(success.ok, true);
    const failed = runCodex({
      workDir: root,
      prompt: 'ticket',
      arm: 'full',
      stateDir: path.join(root, 'state2'),
      authPath,
      homeParentDir: root,
      spawnCodex: fake,
    });
    assert.equal(failed.ok, false);
    assert.equal(homes.length, 2);
    assert.equal(homes.every((home) => !fs.existsSync(home)), true);
    assert.equal(JSON.stringify({ success, failed }).includes('opaque'), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('backend scoping ignores legacy Claude attempts and outcomes', async () => {
  const {
    CODEX_BACKEND_ID,
    executeJobs,
    planStage,
    readCostLedger,
  } = await import('../bench/efficacy.mjs');
  const tasks = [{ id: 'x', dir: path.join(os.tmpdir(), 'x') }];
  const legacyOutcome = {
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
              envelope_sha256: 'envelope-hash',
              config_sha256: 'config-hash',
              role_sha256: 'role-hash',
              hooks_sha256: 'hooks-hash',
              total_cost_usd: 0,
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
    assert.equal(codex[0].verified, true);
    assert.equal(codex[0].envelope_sha256, 'envelope-hash');
    assert.equal(codex[0].config_sha256, 'config-hash');
    assert.equal(codex[0].role_sha256, 'role-hash');
    assert.equal(codex[0].hooks_sha256, 'hooks-hash');
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
  const homes = [];
  try {
    const result = codexPreflight({
      authPath,
      tempRoot: root,
      spawnHost(command, args, options) {
        if (args[0] === '--version') return { status: 0, stdout: 'codex-cli 0.149.1\n', stderr: '' };
        execCalls += 1;
        homes.push(options?.env?.CODEX_HOME);
        return { status: 1, stdout: '', stderr: 'must not execute' };
      },
    });
    assert.equal(result.ok, true);
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
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('Codex live preflight records one verified custom-role spawn then refuses rerun', async () => {
  const {
    CODEX_CUSTOM_ROLE,
    codexLivePreflight,
  } = await import('../bench/efficacy.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p11-live-preflight-'));
  const authPath = path.join(root, 'auth.json');
  const evidenceRoot = path.join(root, 'evidence');
  const ledgerPath = path.join(root, 'ledger.jsonl');
  fs.writeFileSync(authPath, '{"secret":"never-artifact"}');
  let calls = 0;
  try {
    const first = codexLivePreflight({
      execute: true,
      authPath,
      evidenceRoot,
      ledgerPath,
      spawnCodex(_command, _args, options) {
        calls += 1;
        assert.equal(fs.existsSync(path.join(options.env.CODEX_HOME, 'auth.json')), true);
        return {
          status: 0,
          stdout: [
            JSON.stringify({
              type: 'item.completed',
              item: {
                type: 'collaboration',
                tool: 'spawn_agent',
                agent_type: CODEX_CUSTOM_ROLE,
              },
            }),
            JSON.stringify({ type: 'turn.completed', usage: { input_tokens: 1, output_tokens: 1 } }),
          ].join('\n'),
          stderr: '',
          error: null,
        };
      },
    });
    assert.equal(first.ok, true);
    assert.equal(first.custom_agent_verified, true);
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
