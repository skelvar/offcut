#!/usr/bin/env node
// Non-sealed response-style comparison. Prints a plan unless both paid-run
// confirmation flags are present.

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
import { appendManifest, sha256 } from './lib.mjs';
import {
  parseStyleArgs,
  styleArm,
  styleSchedule,
  finalAnswerFromJsonl,
  turnUsageFromJsonl,
} from './live-style-lib.mjs';
import { writeReceiptArtifacts } from './style-receipt.mjs';

const BENCH = path.dirname(fileURLToPath(import.meta.url));
const LIVE_RUNS = path.join(BENCH, 'live-runs');

export const LIVE_STYLE_PROFILE =
  'Implement the maintenance ticket in the current repository. Inspect the files, make the required changes, and run relevant checks. Do not commit or edit .codex.';

export function resultSummary(task, job, result, extra = {}) {
  const record = result.record;
  const input = record.input_tokens;
  const cacheRead = record.cache_read_input_tokens;
  const transcriptPath = path.join(result.runDir, 'transcript.jsonl');
  const transcript = fs.existsSync(transcriptPath)
    ? fs.readFileSync(transcriptPath, 'utf8')
    : '';
  const turnUsage = turnUsageFromJsonl(transcript);
  return {
    task,
    style_arm: job.arm,
    rep: job.rep,
    run_id: result.runId,
    task_passed: result.metrics.task_passed,
    input_tokens: input,
    cache_read_input_tokens: cacheRead,
    cache_creation_input_tokens: record.cache_creation_input_tokens,
    noncached_input_tokens:
      input == null || cacheRead == null ? null : Math.max(0, input - cacheRead),
    output_tokens: record.output_tokens,
    reasoning_output_tokens: record.reasoning_output_tokens,
    duration_ms: record.duration_ms,
    total_cost_usd: record.total_cost_usd,
    cost_evidence: record.cost_evidence,
    model_turns: record.model_turns,
    completed_tool_calls: record.completed_tool_calls,
    lines_added: result.metrics.lines_added,
    lines_removed: result.metrics.lines_removed,
    files_created: result.metrics.files_created,
    answer_completeness: 'pending',
    reviewer_blinded: false,
    turn_usage: turnUsage,
    failure_kind: record.failure_kind,
    model_id: record.model_id,
    model_requested: record.model_requested,
    model_observation: record.model_observation,
    host: record.host,
    host_version: record.host_version,
    effort: record.effort,
    prompt_sha256: record.prompt_sha256,
    final_answer: finalAnswerFromJsonl(transcript),
    ...extra,
  };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseStyleArgs(argv);
  const schedule = styleSchedule(options.task, options.arms, options.reps);
  const nativeKernel = fs.readFileSync(path.join(BENCH, '..', 'rules', 'offcut.md'), 'utf8').trim();
  const nativeKernelSha256 = sha256(nativeKernel);

  if (!options.execute) {
    console.log(
      JSON.stringify(
        {
          ...options,
          jobs: schedule.map(({ arm, rep }) => ({ arm, rep })),
          native_kernel_sha256: nativeKernelSha256,
          note: 'Plan only; no model calls. Add both paid-run confirmation flags to execute.',
        },
        null,
        2,
      ),
    );
    return [];
  }

  fs.mkdirSync(LIVE_RUNS, { recursive: true });
  const batch = nativeKernelSha256.slice(0, 8);
  const rawManifestPath = path.join(BENCH, `live-style-runs-${options.task}-${batch}.jsonl`);
  const resultsPath = path.join(BENCH, `live-style-${options.task}-${batch}.jsonl`);
  const rows = [];
  for (const job of schedule) {
    const mapping = styleArm(job.arm);
    const profileInstructions = mapping.terseControl
      ? `${LIVE_STYLE_PROFILE} Be terse.`
      : LIVE_STYLE_PROFILE;
    const result = runOne({
      task: options.task,
      arm: 'full',
      rep: job.rep,
      model: CODEX_MODEL_ID,
      tasksDir: path.join(BENCH, 'live-tickets'),
      runRoot: LIVE_RUNS,
      manifestPath: rawManifestPath,
      backend: CODEX_BACKEND_ID,
      host: CODEX_HOST,
      hostVersion: CODEX_HOST_VERSION,
      apiRetries: 0,
      style: mapping.offcutStyle,
      styleArm: job.arm,
      profileInstructions,
      nativeInstructions: nativeKernel,
    });
    const row = resultSummary(options.task, job, result, {
      instruction_source: 'rules/offcut.md',
      instruction_sha256: nativeKernelSha256,
    });
    rows.push(row);
    appendManifest(row, resultsPath);
    console.log(JSON.stringify(row));
  }
  const receiptPrefix = path.join(BENCH, `live-style-${options.task}-${batch}-receipt`);
  const { receipt, jsonPath, markdownPath } = writeReceiptArtifacts(rows, receiptPrefix);
  console.log(
    JSON.stringify({
      receipt_status: receipt.status,
      public_claimable: receipt.public_claimable,
      receipt_sha256: receipt.receipt_sha256,
      results_path: resultsPath,
      raw_manifest_path: rawManifestPath,
      receipt_json_path: jsonPath,
      receipt_markdown_path: markdownPath,
    }),
  );
  return rows;
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);
if (isMain) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 2;
  }
}
