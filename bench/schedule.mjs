#!/usr/bin/env node
// Interleaved schedule runner for Phase 5.
//
//   node bench/schedule.mjs --stub-matrix     # dry-run: lean under off, elaborate under full (harness check)
//   node bench/schedule.mjs --stub lean       # all cells with same stub style
//   node bench/schedule.mjs                  # paid Claude runs (costs money)
//   node bench/schedule.mjs --print          # print schedule only

import fs from 'node:fs';
import path from 'node:path';
import {
  BENCH_ROOT,
  MANIFEST_PATH,
  MODEL_ID,
  RUNS_DIR,
  interleaveSchedule,
  listTaskIds,
} from './lib.mjs';
import { runOne } from './run.mjs';

function parseArgs(argv) {
  const out = {
    stub: null,
    stubMatrix: false,
    print: false,
    model: MODEL_ID,
    limit: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stub') out.stub = argv[++i];
    else if (a === '--stub-matrix') out.stubMatrix = true;
    else if (a === '--print') out.print = true;
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
  }
  return out;
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  const jobs = interleaveSchedule(listTaskIds());
  const slice = opts.limit ? jobs.slice(0, opts.limit) : jobs;

  if (opts.print) {
    for (const j of slice) console.log(`${j.taskId}\t${j.arm}\trep=${j.rep}`);
    console.log(`# ${slice.length} jobs`);
    return;
  }

  fs.mkdirSync(RUNS_DIR, { recursive: true });
  // Fresh manifest for a schedule batch — caller may backup first
  if (fs.existsSync(MANIFEST_PATH)) {
    const bak = `${MANIFEST_PATH}.${Date.now()}.bak`;
    fs.copyFileSync(MANIFEST_PATH, bak);
    fs.unlinkSync(MANIFEST_PATH);
    console.error(`backed up manifest to ${path.basename(bak)}`);
  }

  const results = [];
  for (let i = 0; i < slice.length; i++) {
    const job = slice[i];
    let stub = opts.stub;
    if (opts.stubMatrix) {
      // Harness self-check: off→lean, full→elaborate so size metrics diverge
      stub = job.arm === 'off' ? 'lean' : 'elaborate';
    }
    console.error(`[${i + 1}/${slice.length}] ${job.taskId} arm=${job.arm} rep=${job.rep} stub=${stub || 'claude'}`);
    try {
      const r = runOne({
        task: job.taskId,
        arm: job.arm,
        rep: job.rep,
        stub,
        model: opts.model,
      });
      results.push({
        run_id: r.runId,
        ...job,
        task_passed: r.metrics.task_passed,
        files_created: r.metrics.files_created,
        lines_added: r.metrics.lines_added,
      });
      console.error(
        `  -> ${r.runId} passed=${r.metrics.task_passed} files+${r.metrics.files_created} lines+${r.metrics.lines_added}`,
      );
    } catch (e) {
      console.error(`  !! ${e && e.stack ? e.stack : e}`);
      results.push({ ...job, error: String(e && e.message ? e.message : e) });
    }
  }

  const summaryPath = path.join(BENCH_ROOT, 'schedule-last.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ jobs: results.length, summary: summaryPath }, null, 2));
}

main();
