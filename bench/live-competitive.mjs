#!/usr/bin/env node
// Non-sealed five-arm comparison. Plan-only unless both paid-run flags are set.

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
import { appendManifest, interleaveSchedule, sha256 } from './lib.mjs';
import { stripFrontmatter } from '../hooks/rules.js';
import { LIVE_STYLE_PROFILE, resultSummary } from './live-style.mjs';
import { writeCompetitiveReceiptArtifacts } from './competitive-receipt.mjs';

const BENCH = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(BENCH, '..');
const LIVE_RUNS = path.join(BENCH, 'live-runs');
export const COMPETITIVE_ARMS = Object.freeze([
  'baseline',
  'terse',
  'caveman',
  'ponytail',
  'offcut',
]);

export function parseCompetitiveArgs(argv) {
  const positional = [];
  let reps = 1;
  let executeFlag = false;
  let confirmationFlag = false;
  let cavemanPath = null;
  let ponytailPath = null;
  let only = null;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--reps') reps = Number(argv[++index]);
    else if (arg === '--execute') executeFlag = true;
    else if (arg === '--i-understand-this-runs-models') confirmationFlag = true;
    else if (arg === '--caveman') cavemanPath = argv[++index] || null;
    else if (arg === '--ponytail') ponytailPath = argv[++index] || null;
    else if (arg === '--only') {
      const match = String(argv[++index] || '').match(/^([a-z]+):(\d+)$/);
      if (!match || !COMPETITIVE_ARMS.includes(match[1])) throw new Error('bad --only value; expected arm:rep');
      only = { arm: match[1], rep: Number(match[2]) };
    }
    else if (arg.startsWith('--')) throw new Error(`unknown option: ${arg}`);
    else positional.push(arg);
  }

  if (!Number.isInteger(reps) || reps < 1) throw new Error('bad reps: expected a positive integer');
  if (executeFlag !== confirmationFlag) {
    throw new Error('Paid live runs require both --execute and --i-understand-this-runs-models.');
  }
  const execute = executeFlag && confirmationFlag;
  if (execute && (!cavemanPath || !ponytailPath)) {
    throw new Error('Execution requires --caveman <SKILL.md> and --ponytail <SKILL.md>.');
  }
  if (only && (only.rep < 1 || only.rep > reps)) throw new Error('--only rep is outside --reps');
  const task = positional[0] || 'busy-helper';
  if (positional.length > 1 || !/^[a-z0-9][a-z0-9-]*$/.test(task)) {
    throw new Error(`bad task id: ${positional.join(' ') || task}`);
  }
  return {
    task,
    arms: [...COMPETITIVE_ARMS],
    reps,
    execute,
    cavemanPath,
    ponytailPath,
    only,
  };
}

export function competitiveSchedule(task, arms, reps, only = null) {
  const schedule = interleaveSchedule([task], reps, arms);
  return only
    ? schedule.filter((job) => job.arm === only.arm && job.rep === only.rep)
    : schedule;
}

function sourceFor(arm, options) {
  if (arm === 'baseline') return { source: 'none', text: '', hash: sha256('') };
  if (arm === 'terse') {
    const text = 'Be terse.';
    return { source: 'literal:Be terse.', text, hash: sha256(text) };
  }
  if (arm === 'offcut') {
    const file = path.join(ROOT, 'rules', 'offcut.md');
    const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim();
    return { source: 'rules/offcut.md', text, hash: sha256(text) };
  }
  const file = path.resolve(arm === 'caveman' ? options.cavemanPath : options.ponytailPath);
  const text = stripFrontmatter(fs.readFileSync(file, 'utf8'));
  if (!text) throw new Error(`${arm} source is empty: ${file}`);
  return { source: file.replace(/\\/g, '/'), text, hash: sha256(text) };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseCompetitiveArgs(argv);
  const schedule = competitiveSchedule(options.task, options.arms, options.reps, options.only);
  const offcutSource = sourceFor('offcut', options);
  if (!options.execute) {
    console.log(JSON.stringify({
      task: options.task,
      arms: options.arms,
      reps: options.reps,
      execute: false,
      jobs: schedule,
      offcut_kernel_sha256: offcutSource.hash,
      note: 'Plan only; no model calls. Add both paid-run flags and competitor source paths to execute.',
    }, null, 2));
    return [];
  }

  for (const file of [options.cavemanPath, options.ponytailPath]) {
    if (!fs.existsSync(file)) throw new Error(`competitor source not found: ${file}`);
  }
  fs.mkdirSync(LIVE_RUNS, { recursive: true });
  const suffix = options.only
    ? `-retry-${options.only.arm}-${options.only.rep}`
    : `-${offcutSource.hash.slice(0, 8)}`;
  const rawManifestPath = path.join(BENCH, `live-competitive-runs-${options.task}${suffix}.jsonl`);
  const resultsPath = path.join(BENCH, `live-competitive-${options.task}${suffix}.jsonl`);
  const rows = [];
  for (const job of schedule) {
    const source = sourceFor(job.arm, options);
    const useOffcut = job.arm === 'offcut';
    const profileInstructions =
      !useOffcut && source.text
        ? `${LIVE_STYLE_PROFILE}\n\n${source.text}`
        : LIVE_STYLE_PROFILE;
    const result = runOne({
      task: options.task,
      arm: useOffcut ? 'full' : 'off',
      rep: job.rep,
      model: CODEX_MODEL_ID,
      tasksDir: path.join(BENCH, 'live-tickets'),
      runRoot: LIVE_RUNS,
      manifestPath: rawManifestPath,
      backend: CODEX_BACKEND_ID,
      host: CODEX_HOST,
      hostVersion: CODEX_HOST_VERSION,
      apiRetries: 0,
      style: useOffcut ? 'concise' : 'normal',
      styleArm: job.arm,
      profileInstructions,
      nativeInstructions: useOffcut ? source.text : null,
    });
    const row = resultSummary(options.task, job, result, {
      instruction_source: source.source,
      instruction_sha256: source.hash,
    });
    rows.push(row);
    appendManifest(row, resultsPath);
    console.log(JSON.stringify(row));
  }

  const receiptPrefix = path.join(BENCH, `live-competitive-${options.task}${suffix}-receipt`);
  const artifacts = writeCompetitiveReceiptArtifacts(rows, receiptPrefix);
  console.log(JSON.stringify({
    receipt_status: artifacts.receipt.status,
    public_claimable: artifacts.receipt.public_claimable,
    receipt_sha256: artifacts.receipt.receipt_sha256,
    results_path: resultsPath,
    raw_manifest_path: rawManifestPath,
    receipt_json_path: artifacts.jsonPath,
    receipt_markdown_path: artifacts.markdownPath,
  }));
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
