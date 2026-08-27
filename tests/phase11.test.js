import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

import { appendManifest } from '../bench/lib.mjs';

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
                record: { failure_kind: null, total_cost_usd: null },
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
  } finally {
    fs.rmSync(taskDir, { recursive: true, force: true });
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
    'haiku',
  ]);
});
