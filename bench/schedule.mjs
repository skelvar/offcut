#!/usr/bin/env node
// Interleaved schedule runner for Phase 5.
//
//   node bench/schedule.mjs --stub-matrix     # dry-run: lean under off, elaborate under full (harness check)
//   node bench/schedule.mjs --stub lean       # all cells with same stub style
//   node bench/schedule.mjs                  # paid Claude runs (costs money)
//   node bench/schedule.mjs --resume-failed  # re-run cells that errored or failed accept
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
  readManifest,
} from './lib.mjs';
import { runOne } from './run.mjs';

function parseArgs(argv) {
  const out = {
    stub: null,
    stubMatrix: false,
    print: false,
    model: MODEL_ID,
    limit: null,
    resumeFailed: false,
    pauseMs: 5000,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--stub') out.stub = argv[++i];
    else if (a === '--stub-matrix') out.stubMatrix = true;
    else if (a === '--print') out.print = true;
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--limit') out.limit = Number(argv[++i]);
    else if (a === '--resume-failed') out.resumeFailed = true;
    else if (a === '--pause-ms') out.pauseMs = Number(argv[++i]);
  }
  return out;
}

function sleepSync(ms) {
  if (ms <= 0) return;
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function cellKey(taskId, arm, rep) {
  return `${taskId}|${arm}|${rep}`;
}

/** Keep passed runs; drop failed run dirs and rewrite manifest. Return jobs to redo. */
function prepareResume(allJobs) {
  const manifest = readManifest();
  const keep = [];
  const redo = new Set();
  const passedCells = new Set();

  for (const entry of manifest) {
    const metricsPath = path.join(RUNS_DIR, entry.run_id, 'metrics.json');
    const transcriptPath = path.join(RUNS_DIR, entry.run_id, 'transcript.txt');
    let passed = false;
    let apiError = Boolean(entry.error);
    if (fs.existsSync(metricsPath)) {
      const m = JSON.parse(fs.readFileSync(metricsPath, 'utf8'));
      passed = Boolean(m.task_passed);
    }
    if (fs.existsSync(transcriptPath)) {
      const t = fs.readFileSync(transcriptPath, 'utf8');
      // Do not match "api_error_status":null — that appears on successful JSON too.
      if (
        /"terminal_reason"\s*:\s*"api_error"/i.test(t) ||
        /"api_error_status"\s*:\s*[1-9]/i.test(t) ||
        /session limit|hit your.*limit|rate limit|overloaded/i.test(t)
      ) {
        apiError = true;
      }
    }
    const key = cellKey(entry.task_id, entry.arm, entry.rep);
    if (passed && !apiError) {
      keep.push(entry);
      passedCells.add(key);
    } else {
      redo.add(key);
      fs.rmSync(path.join(RUNS_DIR, entry.run_id), { recursive: true, force: true });
    }
  }

  for (const job of allJobs) {
    const key = cellKey(job.taskId, job.arm, job.rep);
    if (!passedCells.has(key)) redo.add(key);
  }

  if (fs.existsSync(MANIFEST_PATH)) {
    const bak = `${MANIFEST_PATH}.${Date.now()}.bak`;
    fs.copyFileSync(MANIFEST_PATH, bak);
    console.error(`backed up manifest to ${path.basename(bak)}`);
  }
  fs.writeFileSync(
    MANIFEST_PATH,
    keep.map((e) => JSON.stringify(e)).join('\n') + (keep.length ? '\n' : ''),
  );
  console.error(`resume: keeping ${keep.length} passed runs; redo ${redo.size} cells`);

  return allJobs.filter((j) => redo.has(cellKey(j.taskId, j.arm, j.rep)));
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  let jobs = interleaveSchedule(listTaskIds());

  if (opts.resumeFailed) {
    fs.mkdirSync(RUNS_DIR, { recursive: true });
    jobs = prepareResume(jobs);
  }

  const slice = opts.limit ? jobs.slice(0, opts.limit) : jobs;

  if (opts.print) {
    for (const j of slice) console.log(`${j.taskId}\t${j.arm}\trep=${j.rep}`);
    console.log(`# ${slice.length} jobs`);
    return;
  }

  fs.mkdirSync(RUNS_DIR, { recursive: true });
  if (!opts.resumeFailed && fs.existsSync(MANIFEST_PATH)) {
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
        error: r.record.error,
        retried: r.record.retried,
      });
      console.error(
        `  -> ${r.runId} passed=${r.metrics.task_passed} files+${r.metrics.files_created} lines+${r.metrics.lines_added}`,
      );
    } catch (e) {
      console.error(`  !! ${e && e.stack ? e.stack : e}`);
      results.push({ ...job, error: String(e && e.message ? e.message : e) });
    }
    if (i < slice.length - 1 && !stub) sleepSync(opts.pauseMs);
  }

  const summaryPath = path.join(BENCH_ROOT, 'schedule-last.json');
  fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2) + '\n');
  console.log(JSON.stringify({ jobs: results.length, summary: summaryPath }, null, 2));
}

main();
