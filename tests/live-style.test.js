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
  try {
    baseline = prepareCodexHome({ arm: 'full', authPath, parentDir: root });
    neutral = prepareCodexHome({
      arm: 'full',
      authPath,
      parentDir: root,
      profileInstructions: 'Neutral maintenance instructions.',
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
  } finally {
    if (baseline?.homeDir) cleanupCodexHome(baseline.homeDir);
    if (neutral?.homeDir) cleanupCodexHome(neutral.homeDir);
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
