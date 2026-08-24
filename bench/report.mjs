#!/usr/bin/env node
// Join blind metrics with sealed manifest; write bench/RESULTS.md.
//
//   node bench/report.mjs

import fs from 'node:fs';
import path from 'node:path';
import {
  BENCH_ROOT,
  CONTROL_TASK_IDS,
  INVITE_TASK_IDS,
  RUNS_DIR,
  median,
  readManifest,
  sha256,
} from './lib.mjs';

const SIZE_KEYS = [
  'files_created',
  'dependencies_added',
  'exported_unused',
  'abstraction_layers',
  'config_keys_added',
  'lines_added',
  'lines_removed',
];

function loadJoined() {
  // Only sealed manifest entries count. Leftover run dirs from prior phases
  // must not leak into a new RESULTS.md without arm/task labels.
  const manifest = readManifest();
  const runs = [];
  for (const meta of manifest) {
    const id = meta.run_id;
    if (!id) continue;
    const metricsPath = path.join(RUNS_DIR, id, 'metrics.json');
    if (!fs.existsSync(metricsPath)) continue;
    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    const promptPath = path.join(RUNS_DIR, id, 'prompt.txt');
    const promptSha = fs.existsSync(promptPath)
      ? sha256(fs.readFileSync(promptPath, 'utf8'))
      : meta.prompt_sha256;
    runs.push({
      ...metrics,
      arm: meta.arm ?? null,
      task_id: meta.task_id ?? null,
      rep: meta.rep ?? null,
      model_id: meta.model_id ?? null,
      host_version: meta.host_version ?? null,
      date: meta.date ?? null,
      prompt_sha256: promptSha,
      stub: meta.stub ?? null,
      error: meta.error ?? null,
    });
  }
  return runs;
}

function fmtDist(vals) {
  if (!vals.length) return '—';
  return `[${vals.join(', ')}] median=${median(vals)}`;
}

function fmtList(arr) {
  if (!arr || !arr.length) return '—';
  return arr.join(',');
}

function buildMarkdown(runs) {
  const lines = [];
  lines.push('# Phase 7.5 results');
  lines.push('');
  lines.push(
    'Re-benchmark against the corrected detector. Phase 5 numbers measured a',
  );
  lines.push(
    'broken signal set and are archived in `bench/RESULTS-phase5.md` — not evidence',
  );
  lines.push('about the current build.');
  lines.push('');
  lines.push(
    'Every run is listed. Failed acceptance checks are excluded from size',
  );
  lines.push('medians and reported separately.');
  lines.push('');

  if (!runs.length) {
    lines.push('_No runs yet._');
    lines.push('');
    return lines.join('\n');
  }

  const byTask = new Map();
  for (const r of runs) {
    if (!byTask.has(r.task_id)) byTask.set(r.task_id, []);
    byTask.get(r.task_id).push(r);
  }

  lines.push('## Run metadata');
  lines.push('');
  const models = [...new Set(runs.map((r) => r.model_id).filter(Boolean))];
  const hosts = [...new Set(runs.map((r) => r.host_version).filter(Boolean))];
  const dates = [...new Set(runs.map((r) => r.date).filter(Boolean))];
  lines.push(`- Host versions: ${hosts.join('; ') || '—'}`);
  lines.push(`- Model IDs: ${models.join('; ') || '—'}`);
  lines.push(`- Dates: ${dates.join(', ') || '—'}`);
  lines.push(`- Total runs: ${runs.length}`);
  lines.push(
    `- Controls: ${CONTROL_TASK_IDS.filter((id) => byTask.has(id)).join(', ') || '—'}`,
  );
  lines.push(
    `- Invite tasks: ${INVITE_TASK_IDS.filter((id) => byTask.has(id)).join(', ') || '—'}`,
  );
  lines.push('');

  lines.push('## Prompt integrity');
  lines.push('');
  for (const [taskId, rs] of [...byTask.entries()].sort()) {
    const shas = [...new Set(rs.map((r) => r.prompt_sha256))];
    const arms = [...new Set(rs.map((r) => r.arm))];
    lines.push(
      `- **${taskId}**: ${shas.length === 1 ? 'identical prompt sha256 across arms' : 'PROMPT MISMATCH'} (\`${shas.join('`, `')}\`); arms=${arms.join(',')}`,
    );
  }
  lines.push('');

  lines.push('## All runs');
  lines.push('');
  lines.push(
    '| run_id | task | arm | rep | passed | sig_fired | survived | files+ | deps+ | exp_unused | abstr | cfg+ | +lines | -lines | model |',
  );
  lines.push('|---|---|---|---:|---|---|---|---:|---:|---:|---:|---:|---:|---:|---|');
  const sorted = [...runs].sort((a, b) => {
    const ka = `${a.task_id}|${a.rep}|${a.arm}|${a.run_id}`;
    const kb = `${b.task_id}|${b.rep}|${b.arm}|${b.run_id}`;
    return ka.localeCompare(kb);
  });
  for (const r of sorted) {
    const fired = fmtList(r.signals_fired);
    const survived =
      r.flagged_pattern_survived == null
        ? 'n/a'
        : r.flagged_pattern_survived
          ? `yes (${fmtList(r.flagged_survived)})`
          : 'no';
    lines.push(
      `| ${r.run_id} | ${r.task_id} | ${r.arm} | ${r.rep} | ${r.task_passed ? 'yes' : 'NO'} | ${fired} | ${survived} | ${r.files_created} | ${r.dependencies_added} | ${r.exported_unused} | ${r.abstraction_layers} | ${r.config_keys_added} | ${r.lines_added} | ${r.lines_removed} | ${r.model_id || ''} |`,
    );
  }
  lines.push('');

  const failed = runs.filter((r) => !r.task_passed);
  lines.push('## Failures (excluded from size comparison)');
  lines.push('');
  if (!failed.length) lines.push('_None._');
  else {
    for (const r of failed) {
      lines.push(
        `- \`${r.run_id}\` task=${r.task_id} arm=${r.arm} rep=${r.rep}: ${r.accept_error || r.error || 'accept failed'}`,
      );
    }
  }
  lines.push('');

  lines.push('## Signals fired and pattern survival (product columns)');
  lines.push('');
  lines.push(
    'For each task/arm: how often hooks challenged, and whether the flagged pattern remained in the final diff.',
  );
  lines.push(
    '`signals_in_diff` is a blind rescan of the final work (useful for stub runs where hooks do not execute).',
  );
  lines.push('');

  for (const [taskId, rs] of [...byTask.entries()].sort()) {
    const role = INVITE_TASK_IDS.includes(taskId)
      ? 'invite'
      : CONTROL_TASK_IDS.includes(taskId)
        ? 'control'
        : 'task';
    lines.push(`### ${taskId} (${role})`);
    lines.push('');
    for (const arm of ['off', 'full']) {
      const cell = rs.filter((r) => r.arm === arm);
      const firedCounts = cell.map((r) => r.signals_fired_count ?? 0);
      const inDiffCounts = cell.map((r) => r.signals_in_diff_count ?? 0);
      const withFire = cell.filter((r) => (r.signals_fired_count ?? 0) > 0);
      const survivedN = withFire.filter((r) => r.flagged_pattern_survived).length;
      const clearedN = withFire.filter((r) => r.flagged_pattern_survived === false).length;
      const fireUnion = [...new Set(cell.flatMap((r) => r.signals_fired || []))].sort();
      const inDiffUnion = [...new Set(cell.flatMap((r) => r.signals_in_diff || []))].sort();
      lines.push(`**arm=${arm}** n=${cell.length}`);
      lines.push(`- signals_fired_count: ${fmtDist(firedCounts)}`);
      lines.push(`- signals_fired union: ${fireUnion.join(', ') || '—'}`);
      lines.push(`- signals_in_diff_count: ${fmtDist(inDiffCounts)}`);
      lines.push(`- signals_in_diff union: ${inDiffUnion.join(', ') || '—'}`);
      lines.push(
        `- challenges with pattern still present: ${survivedN}/${withFire.length}; cleared after challenge: ${clearedN}/${withFire.length}`,
      );
      lines.push('');
    }
  }

  lines.push('## Size metrics (passed runs only) — medians and full distributions');
  lines.push('');

  for (const [taskId, rs] of [...byTask.entries()].sort()) {
    lines.push(`### ${taskId}`);
    lines.push('');
    for (const arm of ['off', 'full']) {
      const passed = rs.filter((r) => r.arm === arm && r.task_passed);
      const failN = rs.filter((r) => r.arm === arm && !r.task_passed).length;
      lines.push(`**arm=${arm}** passed=${passed.length} failed=${failN}`);
      lines.push('');
      if (!passed.length) {
        lines.push('_No passed runs._');
        lines.push('');
        continue;
      }
      for (const key of SIZE_KEYS) {
        const vals = passed.map((r) => r[key]);
        lines.push(`- ${key}: ${fmtDist(vals)}`);
      }
      lines.push('');
    }
  }

  lines.push('## Aggregate (all tasks, passed runs)');
  lines.push('');
  for (const arm of ['off', 'full']) {
    const passed = runs.filter((r) => r.arm === arm && r.task_passed);
    lines.push(`**arm=${arm}** n=${passed.length}`);
    for (const key of SIZE_KEYS) {
      lines.push(`- ${key}: ${fmtDist(passed.map((r) => r[key]))}`);
    }
    lines.push('');
  }

  const offPass = runs.filter((r) => r.arm === 'off' && r.task_passed);
  const fullPass = runs.filter((r) => r.arm === 'full' && r.task_passed);
  const offFail = runs.filter((r) => r.arm === 'off' && !r.task_passed).length;
  const fullFail = runs.filter((r) => r.arm === 'full' && !r.task_passed).length;

  lines.push('## Conclusion');
  lines.push('');
  lines.push(conclusionText({ offPass, fullPass, offFail, fullFail, runs }));
  lines.push('');

  lines.push('## single-call-wrapper verdict');
  lines.push('');
  lines.push(wrapperVerdict(runs));
  lines.push('');

  lines.push('## Findings (process)');
  lines.push('');
  lines.push(
    '- Real `~/.offcut/` can accumulate many `fired-*` / `turn-*` files; this bench always uses a fresh `OFFCUT_STATE_DIR` and never touches the real state dir. Pruning is owned by Phase 8 (`tasks/PHASE-8-TASK.md` §5).',
  );
  lines.push(
    '- Phase 5 undercounted challenges by keeping only the first per phase in analysis; this report records the full fired set per run as a column.',
  );
  lines.push('');

  return lines.join('\n');
}

function wrapperVerdict(runs) {
  const idHex = runs.filter((r) => r.task_id === 'id-hex' && r.task_passed);
  if (!idHex.length) {
    return '_No id-hex runs yet._';
  }
  const leanHits = idHex.filter(
    (r) => (r.signals_in_diff || []).includes('single-call-wrapper'),
  ).length;
  const fullFired = idHex.filter(
    (r) => r.arm === 'full' && (r.signals_fired || []).includes('single-call-wrapper'),
  ).length;
  const fullN = idHex.filter((r) => r.arm === 'full').length;
  const parts = [
    `On id-hex (the conventional crypto.randomBytes→hex wrapper), single-call-wrapper appears in the final diff on ${leanHits}/${idHex.length} passed runs.`,
    `Hooks challenged it on ${fullFired}/${fullN} full-arm runs.`,
  ];
  if (leanHits >= idHex.length * 0.8) {
    parts.push(
      '**Verdict: delete `single-call-wrapper`.** It fires on the accepted lean solution; the pattern is conventional, not a defect. No text-level tune separates keep-worthy helpers from inline-worthy ones.',
    );
  } else if (fullFired > 0 && leanHits < idHex.length * 0.5) {
    parts.push(
      '**Verdict: keep for now**, but watch — fires were not dominated by accepted lean solutions in this sample.',
    );
  } else {
    parts.push(
      '**Verdict: inconclusive in this sample** — record and revisit if it dominates real-code noise.',
    );
  }
  return parts.join(' ');
}

function conclusionText({ offPass, fullPass, offFail, fullFail, runs }) {
  const isStub = runs.every((r) => String(r.model_id || '').startsWith('stub:'));
  if (isStub) {
    return [
      '**Dry-run / stub only.** These numbers validate the harness (isolation, blind scoring,',
      'signal columns, failure gating, control-vs-invite discrimination on `signals_in_diff`).',
      'They are not evidence about whether a correct challenge changes what the agent builds.',
      'Paid Claude Code runs replace this section when executed.',
    ].join(' ');
  }

  if (offPass.length < 3 || fullPass.length < 3) {
    return [
      '**Sample too small / too many failures to claim a direction.**',
      `off passed=${offPass.length} failed=${offFail}; full passed=${fullPass.length} failed=${fullFail}.`,
      'Five runs per cell can reveal a large effect; this sample does not support a small-effect claim.',
    ].join(' ');
  }

  const fullWithFire = runs.filter(
    (r) => r.arm === 'full' && (r.signals_fired_count ?? 0) > 0 && r.task_passed,
  );
  const survived = fullWithFire.filter((r) => r.flagged_pattern_survived).length;
  const cleared = fullWithFire.filter((r) => r.flagged_pattern_survived === false).length;

  const inviteFull = runs.filter(
    (r) => r.arm === 'full' && INVITE_TASK_IDS.includes(r.task_id) && r.task_passed,
  );
  const controlFull = runs.filter(
    (r) => r.arm === 'full' && CONTROL_TASK_IDS.includes(r.task_id) && r.task_passed,
  );
  const inviteFireRate =
    inviteFull.length === 0
      ? null
      : inviteFull.filter((r) => (r.signals_fired_count ?? 0) > 0).length / inviteFull.length;
  const controlFireRate =
    controlFull.length === 0
      ? null
      : controlFull.filter((r) => (r.signals_fired_count ?? 0) > 0).length / controlFull.length;

  const keys = ['files_created', 'lines_added', 'abstraction_layers', 'exported_unused'];
  let leaner = 0;
  let heavier = 0;
  const parts = [];
  for (const key of keys) {
    const mo = median(offPass.map((r) => r[key]));
    const mf = median(fullPass.map((r) => r[key]));
    parts.push(`${key}: off median=${mo}, full median=${mf}`);
    if (mf < mo) leaner += 1;
    else if (mf > mo) heavier += 1;
  }

  // Product question: does a correct challenge change what the agent builds?
  let product;
  if (fullWithFire.length === 0) {
    product =
      '**Product answer: unanswered — the corrected detector issued no challenges in this paid sample.** Check whether invite tasks still fail to fire live (write-time gating vs diff-only signals).';
  } else if (cleared > survived && cleared >= Math.ceil(fullWithFire.length * 0.6)) {
    product =
      '**Product answer: yes — when challenges fired, the flagged pattern was usually absent from the final diff.** That is the first evidence in this project that a correct challenge can change output.';
  } else if (survived > cleared && survived >= Math.ceil(fullWithFire.length * 0.6)) {
    product =
      '**Product answer: no — challenges fired and the flagged patterns still shipped.** Offcut detects over-engineering accurately enough to challenge and still does not prevent it. The honest product on this evidence is a review/audit tool, not a persistent mode that changes builds.';
  } else {
    product =
      '**Product answer: mixed / no clear behavioral change.** Challenges sometimes cleared the pattern and sometimes did not; size medians should be read with that split in mind.';
  }

  let sizeHeadline;
  if (fullFail > offFail + 1) {
    sizeHeadline =
      'Offcut arm failed acceptance more often. Smaller diffs among survivors would not count as a win.';
  } else if (leaner >= 3 && heavier === 0) {
    sizeHeadline =
      'Offcut associated with leaner passed diffs on multiple size metrics in this sample.';
  } else if (heavier >= 3 && leaner === 0) {
    sizeHeadline = 'Offcut associated with heavier passed diffs in this sample.';
  } else {
    sizeHeadline =
      'No consistent size-metric shift across arms (or movements are within run-to-run noise).';
  }

  const disc =
    inviteFireRate != null && controlFireRate != null
      ? `Detector discrimination on full arm: invite fire rate ${(inviteFireRate * 100).toFixed(0)}%, control fire rate ${(controlFireRate * 100).toFixed(0)}%.`
      : '';

  return [
    product,
    sizeHeadline,
    `Challenges on passed full runs: ${fullWithFire.length}; pattern survived ${survived}; cleared ${cleared}.`,
    disc,
    `Fail counts: off=${offFail}, full=${fullFail}.`,
    parts.join('; ') + '.',
    'Five runs per cell is enough to notice a large effect and not enough to claim a small one.',
  ]
    .filter(Boolean)
    .join(' ');
}

function main() {
  const runs = loadJoined();
  const md = buildMarkdown(runs);
  const out = path.join(BENCH_ROOT, 'RESULTS.md');
  fs.writeFileSync(out, md);
  console.log(`wrote ${out} (${runs.length} runs)`);
}

main();
