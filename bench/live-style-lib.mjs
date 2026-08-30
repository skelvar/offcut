import { interleaveSchedule, median, sha256 } from './lib.mjs';

const STYLE_ARMS = new Set(['normal', 'terse', 'concise']);

export function styleArm(arm) {
  if (!STYLE_ARMS.has(arm)) throw new Error(`bad style arm: ${arm}`);
  return {
    offcutStyle: arm === 'concise' ? 'concise' : 'normal',
    terseControl: arm === 'terse',
  };
}

export function parseStyleArgs(argv) {
  const positional = [];
  let reps = 1;
  let executeFlag = false;
  let confirmationFlag = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--reps') {
      reps = Number(argv[++index]);
    } else if (arg === '--execute') {
      executeFlag = true;
    } else if (arg === '--i-understand-this-runs-models') {
      confirmationFlag = true;
    } else if (arg.startsWith('--')) {
      throw new Error(`unknown option: ${arg}`);
    } else {
      positional.push(arg);
    }
  }

  if (!Number.isInteger(reps) || reps < 1) {
    throw new Error('bad reps: expected a positive integer');
  }
  if (executeFlag !== confirmationFlag) {
    throw new Error(
      'Paid live runs require both --execute and --i-understand-this-runs-models.',
    );
  }

  const task = positional[0] || 'busy-helper';
  if (!/^[a-z0-9][a-z0-9-]*$/.test(task)) {
    throw new Error(`bad task id: ${task}`);
  }
  const arms = positional.length > 1 ? positional.slice(1) : ['normal', 'terse', 'concise'];
  for (const arm of arms) styleArm(arm);

  return {
    task,
    arms: [...new Set(arms)],
    reps,
    execute: executeFlag && confirmationFlag,
  };
}

export function styleSchedule(task, arms, reps) {
  return interleaveSchedule([task], reps, arms);
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0
    ? value
    : null;
}

export function turnUsageFromJsonl(text) {
  const turns = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    if (!line.trim()) continue;
    let event;
    try {
      event = JSON.parse(line);
    } catch {
      continue;
    }
    if (event?.type !== 'turn.completed' || !event.usage) continue;
    const input = finiteOrNull(event.usage.input_tokens);
    const cacheRead = finiteOrNull(event.usage.cached_input_tokens);
    turns.push({
      turn: turns.length + 1,
      cache_phase: turns.length === 0 ? 'cold' : 'warm',
      input_tokens: input,
      cache_read_input_tokens: cacheRead,
      cache_creation_input_tokens: finiteOrNull(event.usage.cache_write_input_tokens),
      noncached_input_tokens:
        input == null || cacheRead == null ? null : Math.max(0, input - cacheRead),
      output_tokens: finiteOrNull(event.usage.output_tokens),
      reasoning_output_tokens: finiteOrNull(event.usage.reasoning_output_tokens),
    });
  }
  return turns;
}

const RECEIPT_METRICS = [
  'input_tokens',
  'cache_read_input_tokens',
  'cache_creation_input_tokens',
  'noncached_input_tokens',
  'output_tokens',
  'reasoning_output_tokens',
  'duration_ms',
  'model_turns',
  'completed_tool_calls',
  'lines_added',
  'lines_removed',
  'files_created',
];

function metricMedians(rows) {
  return Object.fromEntries(
    RECEIPT_METRICS.map((metric) => [
      metric,
      median(rows.map((row) => row[metric])),
    ]),
  );
}

function cacheSummary(rows, phase) {
  const turns = rows.flatMap((row) =>
    Array.isArray(row.turn_usage)
      ? row.turn_usage.filter((turn) => turn.cache_phase === phase)
      : [],
  );
  return {
    turns: turns.length,
    median_input_tokens: median(turns.map((turn) => turn.input_tokens)),
    median_cache_read_input_tokens: median(
      turns.map((turn) => turn.cache_read_input_tokens),
    ),
    median_cache_creation_input_tokens: median(
      turns.map((turn) => turn.cache_creation_input_tokens),
    ),
    median_noncached_input_tokens: median(
      turns.map((turn) => turn.noncached_input_tokens),
    ),
  };
}

function pctChange(candidate, baseline) {
  if (
    typeof candidate !== 'number' ||
    typeof baseline !== 'number' ||
    !Number.isFinite(candidate) ||
    !Number.isFinite(baseline) ||
    baseline === 0
  ) {
    return null;
  }
  return Math.round(((candidate - baseline) / baseline) * 100_000) / 1_000;
}

function compareArms(candidate, baseline) {
  return Object.fromEntries(
    RECEIPT_METRICS.map((metric) => [
      `${metric}_pct`,
      pctChange(candidate.medians[metric], baseline.medians[metric]),
    ]),
  );
}

export function buildStyleReceipt(rows) {
  const cleanRows = Array.isArray(rows) ? rows.filter(Boolean) : [];
  const armNames = ['normal', 'terse', 'concise'];
  const byArm = Object.fromEntries(
    armNames.map((arm) => [arm, cleanRows.filter((row) => row.style_arm === arm)]),
  );
  const counts = armNames.map((arm) => byArm[arm].length);
  const tasks = new Set(cleanRows.map((row) => row.task));
  const runIds = cleanRows.map((row) => row.run_id);
  const repSets = armNames.map((arm) =>
    byArm[arm]
      .map((row) => row.rep)
      .filter((rep) => Number.isInteger(rep) && rep > 0)
      .sort((left, right) => left - right),
  );
  const expectedReps = JSON.stringify(repSets[0]);
  const scheduleComplete =
    cleanRows.length > 0 &&
    cleanRows.every((row) => armNames.includes(row.style_arm)) &&
    tasks.size === 1 &&
    !tasks.has(null) &&
    !tasks.has(undefined) &&
    runIds.every((runId) => typeof runId === 'string' && runId.length > 0) &&
    new Set(runIds).size === runIds.length &&
    counts.every((count) => count > 0) &&
    new Set(counts).size === 1 &&
    repSets.every(
      (reps, index) =>
        reps.length === byArm[armNames[index]].length &&
        new Set(reps).size === reps.length &&
        JSON.stringify(reps) === expectedReps,
    );
  const allAccepted = scheduleComplete && cleanRows.every((row) => row.task_passed === true);
  const reviewComplete =
    scheduleComplete &&
    cleanRows.every(
      (row) => row.answer_completeness === 'pass' && row.reviewer_blinded === true,
    );
  const automatedComparable = scheduleComplete && allAccepted;
  const publicClaimable = automatedComparable && reviewComplete;

  const arms = Object.fromEntries(
    armNames.map((arm) => [
      arm,
      {
        runs: byArm[arm].length,
        passed: byArm[arm].filter((row) => row.task_passed === true).length,
        medians: metricMedians(byArm[arm]),
        cold_cache: cacheSummary(byArm[arm], 'cold'),
        warm_cache: cacheSummary(byArm[arm], 'warm'),
      },
    ]),
  );

  const receipt = {
    schema_version: 1,
    task: cleanRows[0]?.task ?? null,
    status: !automatedComparable
      ? 'not_comparable'
      : publicClaimable
        ? 'claimable'
        : 'review_pending',
    automated_comparable: automatedComparable,
    public_claimable: publicClaimable,
    acceptance_gate: allAccepted ? 'pass' : 'fail',
    completeness_gate: reviewComplete ? 'pass' : 'pending_or_failed',
    source_run_ids: cleanRows.map((row) => row.run_id).filter(Boolean).sort(),
    arms,
    comparisons: automatedComparable
      ? {
          concise_vs_normal: compareArms(arms.concise, arms.normal),
          concise_vs_terse: compareArms(arms.concise, arms.terse),
        }
      : {},
    warnings: [
      ...(scheduleComplete ? [] : ['The three-arm schedule is incomplete or unbalanced.']),
      ...(allAccepted ? [] : ['At least one arm failed task acceptance.']),
      ...(reviewComplete ? [] : ['Blind answer-completeness review is incomplete or failed.']),
      ...(armNames.every((arm) => arms[arm].warm_cache.turns > 0)
        ? []
        : ['Warm cache metrics are unavailable for at least one arm.']),
    ],
  };
  return {
    ...receipt,
    receipt_sha256: sha256(JSON.stringify(receipt)),
  };
}

function display(value) {
  return typeof value === 'number' ? String(value) : 'unavailable';
}

export function renderStyleReceipt(receipt) {
  const claim = receipt.public_claimable ? 'CLAIMABLE' : 'NOT CLAIMABLE';
  const lines = [
    '# Offcut style receipt',
    '',
    `Status: **${claim}** (${receipt.status})`,
    '',
    `Acceptance gate: **${receipt.acceptance_gate}**`,
    `Completeness gate: **${receipt.completeness_gate}**`,
    '',
    '| Arm | Runs passed | Output tokens | Noncached input | Lines added |',
    '|---|---:|---:|---:|---:|',
  ];
  for (const arm of ['normal', 'terse', 'concise']) {
    const summary = receipt.arms[arm];
    lines.push(
      `| ${arm} | ${summary.passed}/${summary.runs} | ${display(summary.medians.output_tokens)} | ${display(summary.medians.noncached_input_tokens)} | ${display(summary.medians.lines_added)} |`,
    );
  }
  lines.push(
    '',
    '## Cache',
    '',
    '| Arm | Cold cache write | Warm cache read | Warm noncached input |',
    '|---|---:|---:|---:|',
  );
  for (const arm of ['normal', 'terse', 'concise']) {
    const summary = receipt.arms[arm];
    lines.push(
      `| ${arm} | ${display(summary.cold_cache.median_cache_creation_input_tokens)} | ${display(summary.warm_cache.median_cache_read_input_tokens)} | ${display(summary.warm_cache.median_noncached_input_tokens)} |`,
    );
  }
  if (receipt.warnings.length) {
    lines.push('', '## Warnings', '');
    for (const warning of receipt.warnings) lines.push(`- ${warning}`);
  }
  lines.push('', `Receipt SHA-256: \`${receipt.receipt_sha256}\``, '');
  return lines.join('\n');
}
