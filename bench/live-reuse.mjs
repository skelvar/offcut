#!/usr/bin/env node
// Qualitative Sol demo. Not Phase 11.
//   node bench/live-reuse.mjs [task-id] [off|full ...] [--reps N]
// Writes per-task ledgers and keeps live artifacts outside sealed efficacy runs.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  CODEX_BACKEND_ID,
  CODEX_HOST,
  CODEX_HOST_VERSION,
  CODEX_MODEL_ID,
  runOne,
} from './run.mjs';
import { classifyDiff, liveSchedule, parseLiveArgs } from './live-reuse-lib.mjs';

const BENCH = path.dirname(fileURLToPath(import.meta.url));
const LIVE_RUNS = path.join(BENCH, 'live-runs');

export function main(argv = process.argv.slice(2)) {
  const { task, arms, reps } = parseLiveArgs(argv);
  for (const job of liveSchedule(task, arms, reps)) {
    const result = runOne({
      task,
      arm: job.arm,
      rep: job.rep,
      model: CODEX_MODEL_ID,
      tasksDir: path.join(BENCH, 'live-tickets'),
      runRoot: LIVE_RUNS,
      manifestPath: path.join(BENCH, `live-reuse-${task}.jsonl`),
      backend: CODEX_BACKEND_ID,
      host: CODEX_HOST,
      hostVersion: CODEX_HOST_VERSION,
      apiRetries: 0,
    });
    const diffPath = path.join(result.runDir, 'diff.patch');
    const diff = fs.existsSync(diffPath) ? fs.readFileSync(diffPath, 'utf8') : '';
    console.log(
      JSON.stringify(
        {
          task,
          arm: job.arm,
          rep: job.rep,
          run_id: result.runId,
          task_passed: result.metrics.task_passed,
          files_created: result.metrics.files_created,
          files_created_paths: result.metrics.files_created_paths,
          lines_added: result.metrics.lines_added,
          lines_removed: result.metrics.lines_removed,
          model_turns: result.record.model_turns,
          completed_tool_calls: result.record.completed_tool_calls,
          failure_kind: result.record.failure_kind,
          ...classifyDiff(diff),
        },
        null,
        2,
      ),
    );
  }
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) main();
