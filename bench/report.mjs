#!/usr/bin/env node
// Join blind metrics with sealed manifest; write bench/RESULTS.md.
//
//   node bench/report.mjs

import fs from 'node:fs';
import path from 'node:path';
import {
  BENCH_ROOT,
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
  const manifest = readManifest();
  const byId = new Map(manifest.map((m) => [m.run_id, m]));
  const runs = [];
  if (!fs.existsSync(RUNS_DIR)) return runs;
  for (const id of fs.readdirSync(RUNS_DIR)) {
    const metricsPath = path.join(RUNS_DIR, id, 'metrics.json');
    if (!fs.existsSync(metricsPath)) continue;
    const metrics = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
    const meta = byId.get(id) || {};
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

function buildMarkdown(runs) {
  const lines = [];
  lines.push('# Phase 5 results');
  lines.push('');
  lines.push('Every run is listed. Failed acceptance checks are excluded from size');
  lines.push('medians and reported separately.');
  lines.push('');

  if (!runs.length) {
    lines.push('_No runs yet._');
    lines.push('');
    return lines.join('\n');
  }

  // Prompt identity check across arms
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
    '| run_id | task | arm | rep | passed | files+ | deps+ | exp_unused | abstr | cfg+ | +lines | -lines | model |',
  );
  lines.push('|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|');
  const sorted = [...runs].sort((a, b) => {
    const ka = `${a.task_id}|${a.rep}|${a.arm}|${a.run_id}`;
    const kb = `${b.task_id}|${b.rep}|${b.arm}|${b.run_id}`;
    return ka.localeCompare(kb);
  });
  for (const r of sorted) {
    lines.push(
      `| ${r.run_id} | ${r.task_id} | ${r.arm} | ${r.rep} | ${r.task_passed ? 'yes' : 'NO'} | ${r.files_created} | ${r.dependencies_added} | ${r.exported_unused} | ${r.abstraction_layers} | ${r.config_keys_added} | ${r.lines_added} | ${r.lines_removed} | ${r.model_id || ''} |`,
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

  // Aggregate direction (descriptive only)
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

  lines.push('## Findings (process)');
  lines.push('');
  lines.push(
    '- Real `~/.offcut/` can accumulate many `fired-*` / `turn-*` files; this bench always uses a fresh `OFFCUT_STATE_DIR` and never touches the real state dir. Pruning remains the upgrade path named by the `offcut:` marker in `hooks/state.js`.',
  );
  lines.push('');

  return lines.join('\n');
}

function conclusionText({ offPass, fullPass, offFail, fullFail, runs }) {
  const isStub = runs.every((r) => String(r.model_id || '').startsWith('stub:'));
  if (isStub) {
    return [
      '**Dry-run / stub only.** These numbers validate the harness (isolation, blind scoring,',
      'failure gating). They are not evidence about Offcut. Paid Claude Code runs replace this',
      'section when executed.',
    ].join(' ');
  }

  if (offPass.length < 3 || fullPass.length < 3) {
    return [
      '**Sample too small / too many failures to claim a direction.**',
      `off passed=${offPass.length} failed=${offFail}; full passed=${fullPass.length} failed=${fullFail}.`,
      'Five runs per cell can reveal a large effect; this sample does not support a small-effect claim.',
    ].join(' ');
  }

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

  let headline;
  if (fullFail > offFail + 1) {
    headline =
      '**Offcut arm failed acceptance more often.** Smaller diffs among survivors would not count as a win.';
  } else if (leaner >= 3 && heavier === 0) {
    headline =
      '**Offcut associated with leaner passed diffs on multiple size metrics** in this sample. Effect size and variance still limit how far this generalizes.';
  } else if (heavier >= 3 && leaner === 0) {
    headline =
      '**Offcut associated with heavier passed diffs** in this sample — not a win for the mode.';
  } else {
    headline =
      '**No detectable effect** in this sample: medians do not move consistently across size metrics, or movements are within run-to-run noise.';
  }

  return [
    headline,
    `Fail counts: off=${offFail}, full=${fullFail}.`,
    parts.join('; ') + '.',
    'Five runs per cell is enough to notice a large effect and not enough to claim a small one.',
  ].join(' ');
}

function main() {
  const runs = loadJoined();
  const md = buildMarkdown(runs);
  const out = path.join(BENCH_ROOT, 'RESULTS.md');
  fs.writeFileSync(out, md);
  console.log(`wrote ${out} (${runs.length} runs)`);
}

main();
