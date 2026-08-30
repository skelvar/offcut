import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('live style schedule counterbalances normal, terse, and concise', async () => {
  const modulePath = path.join(ROOT, 'bench', 'live-style-lib.mjs');
  assert.equal(fs.existsSync(modulePath), true, 'bench/live-style-lib.mjs is required');
  const { parseStyleArgs, styleSchedule, styleArm } = await import('../bench/live-style-lib.mjs');

  assert.deepEqual(parseStyleArgs(['busy-helper', '--reps', '2']), {
    task: 'busy-helper',
    arms: ['normal', 'terse', 'concise'],
    reps: 2,
    execute: false,
  });
  assert.deepEqual(styleArm('normal'), { offcutStyle: 'normal', terseControl: false });
  assert.deepEqual(styleArm('terse'), { offcutStyle: 'normal', terseControl: true });
  assert.deepEqual(styleArm('concise'), { offcutStyle: 'concise', terseControl: false });
  assert.throws(() => parseStyleArgs(['busy-helper', '--execute']), /paid live runs require/i);
  assert.throws(() => parseStyleArgs(['../outside']), /bad task id/i);
  assert.throws(
    () => parseStyleArgs(['busy-helper', '--i-understand-this-runs-models']),
    /paid live runs require/i,
  );
  assert.equal(
    parseStyleArgs([
      'busy-helper',
      '--execute',
      '--i-understand-this-runs-models',
    ]).execute,
    true,
  );
  assert.equal(styleSchedule('busy-helper', ['normal', 'terse', 'concise'], 2).length, 6);
});

test('live style driver prints a plan without starting a paid run', () => {
  const driver = path.join(ROOT, 'bench', 'live-style.mjs');
  assert.equal(fs.existsSync(driver), true, 'bench/live-style.mjs is required');
  const result = spawnSync(process.execPath, [driver, 'busy-helper'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /"execute"\s*:\s*false/);
  assert.match(result.stdout, /no model calls/i);
});

test('live style profile override changes only the isolated profile hash', async () => {
  const {
    CODEX_PROFILE_INSTRUCTIONS,
    cleanupCodexHome,
    prepareCodexHome,
  } = await import('../bench/run.mjs');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-style-profile-'));
  const authPath = path.join(root, 'auth.json');
  fs.writeFileSync(authPath, '{}\n', 'utf8');
  let baseline;
  let neutral;
  let native;
  try {
    baseline = prepareCodexHome({ arm: 'full', authPath, parentDir: root });
    neutral = prepareCodexHome({
      arm: 'full',
      authPath,
      parentDir: root,
      profileInstructions: 'Neutral maintenance instructions.',
    });
    native = prepareCodexHome({
      arm: 'full',
      authPath,
      parentDir: root,
      nativeInstructions: '# Native kernel',
    });
    assert.notEqual(baseline.profile_config_sha256, neutral.profile_config_sha256);
    const baselineText = fs.readFileSync(
      path.join(baseline.homeDir, 'ticket-worker.config.toml'),
      'utf8',
    );
    const neutralText = fs.readFileSync(
      path.join(neutral.homeDir, 'ticket-worker.config.toml'),
      'utf8',
    );
    assert.match(baselineText, new RegExp(CODEX_PROFILE_INSTRUCTIONS.split(' ')[0]));
    assert.match(neutralText, /Neutral maintenance instructions/);
    const nativeText = fs.readFileSync(path.join(native.homeDir, 'AGENTS.md'), 'utf8');
    assert.match(nativeText, /<!-- offcut:managed:start -->/);
    assert.match(nativeText, /# Native kernel/);
    assert.match(native.native_instructions_sha256, /^[a-f0-9]{64}$/);
  } finally {
    if (baseline?.homeDir) cleanupCodexHome(baseline.homeDir);
    if (neutral?.homeDir) cleanupCodexHome(neutral.homeDir);
    if (native?.homeDir) cleanupCodexHome(native.homeDir);
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('warm-session usage keeps cold and later cached turns separate', async () => {
  const styleLib = await import('../bench/live-style-lib.mjs');
  assert.equal(typeof styleLib.turnUsageFromJsonl, 'function');
  const transcript = [
    JSON.stringify({ type: 'thread.started', thread_id: 'thread-1' }),
    JSON.stringify({
      type: 'turn.completed',
      usage: {
        input_tokens: 1000,
        cached_input_tokens: 0,
        cache_write_input_tokens: 800,
        output_tokens: 100,
        reasoning_output_tokens: 20,
      },
    }),
    JSON.stringify({
      type: 'turn.completed',
      usage: {
        input_tokens: 1200,
        cached_input_tokens: 900,
        cache_write_input_tokens: 0,
        output_tokens: 60,
        reasoning_output_tokens: 10,
      },
    }),
  ].join('\n');

  assert.deepEqual(styleLib.turnUsageFromJsonl(transcript), [
    {
      turn: 1,
      cache_phase: 'cold',
      input_tokens: 1000,
      cache_read_input_tokens: 0,
      cache_creation_input_tokens: 800,
      noncached_input_tokens: 1000,
      output_tokens: 100,
      reasoning_output_tokens: 20,
    },
    {
      turn: 2,
      cache_phase: 'warm',
      input_tokens: 1200,
      cache_read_input_tokens: 900,
      cache_creation_input_tokens: 0,
      noncached_input_tokens: 300,
      output_tokens: 60,
      reasoning_output_tokens: 10,
    },
  ]);
  assert.equal(
    styleLib.finalAnswerFromJsonl([
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'first' } }),
      JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'final' } }),
      JSON.stringify({ type: 'turn.completed', usage: {} }),
    ].join('\n')),
    'final',
  );
});

function receiptRows({ failed = false, reviewed = false } = {}) {
  const values = {
    normal: [200, 220],
    terse: [150, 160],
    concise: [120, 130],
  };
  return Object.entries(values).flatMap(([arm, outputs]) =>
    outputs.map((output, index) => ({
      task: 'busy-helper',
      style_arm: arm,
      rep: index + 1,
      run_id: `${arm}-${index + 1}`,
      task_passed: !(failed && arm === 'concise' && index === 1),
      input_tokens: 1000 + index * 100,
      cache_read_input_tokens: 600,
      cache_creation_input_tokens: index === 0 ? 300 : 0,
      noncached_input_tokens: 400 + index * 100,
      output_tokens: output,
      reasoning_output_tokens: 20,
      duration_ms: 1000 + output,
      model_turns: 2,
      completed_tool_calls: 3,
      lines_added: arm === 'concise' ? 8 : 12,
      lines_removed: 2,
      files_created: 0,
      answer_completeness: reviewed ? 'pass' : 'pending',
      reviewer_blinded: reviewed,
      turn_usage: [
        {
          turn: 1,
          cache_phase: 'cold',
          input_tokens: 700,
          cache_read_input_tokens: 0,
          cache_creation_input_tokens: 300,
          noncached_input_tokens: 700,
          output_tokens: Math.round(output * 0.6),
          reasoning_output_tokens: 12,
        },
        {
          turn: 2,
          cache_phase: 'warm',
          input_tokens: 300,
          cache_read_input_tokens: 250,
          cache_creation_input_tokens: 0,
          noncached_input_tokens: 50,
          output_tokens: Math.round(output * 0.4),
          reasoning_output_tokens: 8,
        },
      ],
    })),
  );
}

test('receipt reports dimensions without inventing a composite score', async () => {
  const styleLib = await import('../bench/live-style-lib.mjs');
  assert.equal(typeof styleLib.buildStyleReceipt, 'function');
  assert.equal(typeof styleLib.renderStyleReceipt, 'function');

  const pending = styleLib.buildStyleReceipt(receiptRows());
  assert.equal(pending.automated_comparable, true);
  assert.equal(pending.public_claimable, false);
  assert.equal(pending.status, 'review_pending');
  assert.equal(pending.arms.concise.medians.output_tokens, 125);
  assert.equal(pending.arms.concise.warm_cache.median_noncached_input_tokens, 50);
  assert.equal(pending.comparisons.concise_vs_normal.output_tokens_pct, -40.476);
  assert.equal(Object.hasOwn(pending, 'efficiency_score'), false);
  assert.match(pending.receipt_sha256, /^[a-f0-9]{64}$/);
  assert.match(styleLib.renderStyleReceipt(pending), /NOT CLAIMABLE/);

  const reviewed = styleLib.buildStyleReceipt(receiptRows({ reviewed: true }));
  assert.equal(reviewed.public_claimable, true);
  assert.equal(reviewed.status, 'claimable');

  const failed = styleLib.buildStyleReceipt(receiptRows({ failed: true, reviewed: true }));
  assert.equal(failed.automated_comparable, false);
  assert.equal(failed.public_claimable, false);
  assert.equal(failed.status, 'not_comparable');
  assert.deepEqual(failed.comparisons, {});

  const mixedTask = receiptRows({ reviewed: true });
  mixedTask[0].task = 'different-ticket';
  assert.equal(styleLib.buildStyleReceipt(mixedTask).automated_comparable, false);

  const duplicateRun = receiptRows({ reviewed: true });
  duplicateRun[1].run_id = duplicateRun[0].run_id;
  assert.equal(styleLib.buildStyleReceipt(duplicateRun).automated_comparable, false);

  const duplicateRep = receiptRows({ reviewed: true });
  duplicateRep[1].rep = duplicateRep[0].rep;
  assert.equal(styleLib.buildStyleReceipt(duplicateRep).automated_comparable, false);
});

test('receipt CLI applies explicit blind reviews without running a model', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-style-receipt-'));
  try {
    const rows = receiptRows();
    const resultsPath = path.join(root, 'results.jsonl');
    const reviewsPath = path.join(root, 'reviews.jsonl');
    const out = path.join(root, 'receipt');
    fs.writeFileSync(resultsPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
    fs.writeFileSync(
      reviewsPath,
      rows
        .map((row) =>
          JSON.stringify({
            run_id: row.run_id,
            answer_completeness: 'pass',
            reviewer_blinded: true,
          }),
        )
        .join('\n') + '\n',
    );

    const result = spawnSync(
      process.execPath,
      [
        path.join(ROOT, 'bench', 'style-receipt.mjs'),
        resultsPath,
        '--reviews',
        reviewsPath,
        '--out',
        out,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const receipt = JSON.parse(fs.readFileSync(`${out}.json`, 'utf8'));
    assert.equal(receipt.public_claimable, true);
    assert.match(fs.readFileSync(`${out}.md`, 'utf8'), /CLAIMABLE/);
    assert.match(result.stdout, /receipt_sha256/);

    fs.appendFileSync(
      reviewsPath,
      `${JSON.stringify({
        run_id: 'not-in-results',
        answer_completeness: 'pass',
        reviewer_blinded: true,
      })}\n`,
    );
    const unknownReview = spawnSync(
      process.execPath,
      [
        path.join(ROOT, 'bench', 'style-receipt.mjs'),
        resultsPath,
        '--reviews',
        reviewsPath,
        '--out',
        `${out}-invalid`,
      ],
      { cwd: ROOT, encoding: 'utf8' },
    );
    assert.notEqual(unknownReview.status, 0);
    assert.match(unknownReview.stderr, /unknown review run_id/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

function competitiveRows({ reviewed = true } = {}) {
  const sourceHashes = { baseline: '0', terse: '1', caveman: '2', ponytail: '3', offcut: '4' };
  const outputs = {
    baseline: [220, 210],
    terse: [160, 150],
    caveman: [140, 130],
    ponytail: [180, 170],
    offcut: [120, 110],
  };
  return Object.entries(outputs).flatMap(([arm, values]) =>
    values.map((output, index) => ({
      ...receiptRows({ reviewed })[index],
      task: 'busy-helper',
      style_arm: arm,
      rep: index + 1,
      run_id: `${arm}-${index + 1}`,
      output_tokens: output,
      model_id: 'gpt-5.6-sol',
      model_requested: 'gpt-5.6-sol',
      host: 'codex',
      host_version: '1.0',
      effort: 'medium',
      prompt_sha256: 'a'.repeat(64),
      instruction_source: arm === 'baseline' ? 'none' : `${arm}.md`,
      instruction_sha256: sourceHashes[arm].repeat(64),
      final_answer: `${arm} result`,
    })),
  );
}

test('competitive benchmark schedules five isolated, source-pinned arms', async () => {
  const competitive = await import('../bench/live-competitive.mjs');
  const parsed = competitive.parseCompetitiveArgs(['busy-helper', '--reps', '2']);
  assert.deepEqual(parsed.arms, ['baseline', 'terse', 'caveman', 'ponytail', 'offcut']);
  assert.equal(parsed.execute, false);
  assert.equal(competitive.competitiveSchedule(parsed.task, parsed.arms, parsed.reps).length, 10);
  assert.throws(
    () => competitive.parseCompetitiveArgs([
      'busy-helper',
      '--execute',
      '--i-understand-this-runs-models',
    ]),
    /--caveman.*--ponytail/i,
  );
  const retry = competitive.parseCompetitiveArgs(['busy-helper', '--reps', '2', '--only', 'baseline:2']);
  assert.deepEqual(retry.only, { arm: 'baseline', rep: 2 });
  assert.equal(competitive.competitiveSchedule(retry.task, retry.arms, retry.reps, retry.only).length, 1);

  const plan = spawnSync(
    process.execPath,
    [path.join(ROOT, 'bench', 'live-competitive.mjs'), 'busy-helper', '--reps', '2'],
    { cwd: ROOT, encoding: 'utf8' },
  );
  assert.equal(plan.status, 0, plan.stderr);
  assert.match(plan.stdout, /"caveman"/);
  assert.match(plan.stdout, /no model calls/i);
});

test('competitive receipt fails closed on mixed controls and compares Offcut to every arm', async () => {
  const styleLib = await import('../bench/live-style-lib.mjs');
  const receipt = styleLib.buildCompetitiveReceipt(competitiveRows());
  assert.equal(receipt.public_claimable, true);
  assert.equal(receipt.arms.offcut.medians.output_tokens, 115);
  assert.equal(receipt.comparisons.offcut_vs_baseline.output_tokens_pct, -46.512);
  assert.ok(receipt.comparisons.offcut_vs_caveman);
  assert.ok(receipt.comparisons.offcut_vs_ponytail);
  assert.deepEqual(receipt.instruction_sources.offcut, {
    source: 'offcut.md',
    sha256: '4'.repeat(64),
  });
  assert.match(styleLib.renderCompetitiveReceipt(receipt), /Offcut competitive receipt/);

  const mixed = competitiveRows();
  mixed[0].model_requested = 'different-model';
  const failed = styleLib.buildCompetitiveReceipt(mixed);
  assert.equal(failed.public_claimable, false);
  assert.equal(failed.automated_comparable, false);
  assert.match(failed.warnings.join(' '), /model.*control|controlled fields/i);

  const missingTelemetry = competitiveRows();
  missingTelemetry[0].output_tokens = null;
  missingTelemetry[0].failure_kind = 'model';
  const missing = styleLib.buildCompetitiveReceipt(missingTelemetry);
  assert.equal(missing.automated_comparable, false);
  assert.match(missing.warnings.join(' '), /provider telemetry/i);
});

test('blind review bundle exposes answers and opaque ids, never arm labels', async () => {
  const { buildBlindBundle } = await import('../bench/blind-review.mjs');
  const bundle = buildBlindBundle(competitiveRows({ reviewed: false }));
  assert.equal(bundle.length, 10);
  assert.match(bundle[0].review_id, /^[a-f0-9]{16}$/);
  assert.equal(typeof bundle[0].run_id, 'string');
  assert.equal(typeof bundle[0].answer, 'string');
  const serialized = JSON.stringify(bundle);
  assert.doesNotMatch(serialized, /style_arm|instruction_source|instruction_sha256/);
});

test('competitive composer replaces only the matching cell with the latest retry', async () => {
  const { composeCompetitiveRows } = await import('../bench/competitive-compose.mjs');
  const base = competitiveRows({ reviewed: false });
  const retryA = { ...base[0], run_id: 'retry-old', output_tokens: 130 };
  const retryB = { ...base[0], run_id: 'retry-new', output_tokens: 120 };
  const composed = composeCompetitiveRows(base, [[retryA, retryB]]);
  assert.equal(composed.length, base.length);
  assert.equal(composed.find((row) => row.style_arm === 'baseline' && row.rep === 1).run_id, 'retry-new');
  assert.equal(composed.filter((row) => row.run_id === base[1].run_id).length, 1);
  assert.throws(
    () => composeCompetitiveRows(base, [[{ ...retryB, task: 'different' }]]),
    /does not match base cell/i,
  );
});
