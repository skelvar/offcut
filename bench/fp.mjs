#!/usr/bin/env node
// Replay signals over the Phase 5 negative corpus (bench/runs) and the
// hand-written positive corpus (bench/corpus/positive).
//
// Every accepted bench run is a labeled negative: any fire is a false positive.
// Positive dirs are labeled true positives: a surviving signal must fire there.
//
//   node bench/fp.mjs
//   node bench/fp.mjs --json

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SIGNALS, runSignals } from '../hooks/signals.js';
import { parseUnifiedDiff } from '../scripts/scan.mjs';
import { RUNS_DIR, BENCH_ROOT, CONTROL_TASK_IDS } from './lib.mjs';

const POSITIVE_DIR = path.join(BENCH_ROOT, 'corpus', 'positive');

// Invite fixtures deliberately tempt signals; their accepted runs are not
// labeled negatives. Elaborate stubs for controls are intentional overbuilds.
const CONTROL_SET = new Set(CONTROL_TASK_IDS);

/**
 * @typedef {{
 *   signalId: string,
 *   runs: number,
 *   runsFired: number,
 *   fileFires: number,
 * }} NegStat
 */

/**
 * Walk text files under a directory into one corpus string.
 * @param {string} dir
 */
function walkText(dir) {
  const parts = [];
  const walk = (d) => {
    if (!fs.existsSync(d)) return;
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(js|mjs|cjs|ts|tsx|jsx|json)$/i.test(ent.name)) {
        parts.push(fs.readFileSync(p, 'utf8'));
      }
    }
  };
  walk(dir);
  return parts.join('\n');
}

/**
 * List completed, accepted runs that have a diff.
 * @returns {Array<{ runId: string, dir: string, arm: string, task: string }>}
 */
export function listNegativeRuns() {
  if (!fs.existsSync(RUNS_DIR)) return [];
  const out = [];
  for (const entry of fs.readdirSync(RUNS_DIR, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const name = entry.name;
    const dir = path.join(RUNS_DIR, name);
    const acceptPath = path.join(dir, 'accept.json');
    const diffPath = path.join(dir, 'diff.patch');
    const runPath = path.join(dir, 'run.json');
    if (!fs.existsSync(acceptPath) || !fs.existsSync(diffPath) || !fs.existsSync(runPath)) {
      continue;
    }
    let accept;
    let run;
    try {
      accept = JSON.parse(fs.readFileSync(acceptPath, 'utf8'));
      run = JSON.parse(fs.readFileSync(runPath, 'utf8'));
    } catch {
      continue;
    }
    // accept.json uses `ok`; metrics.json mirrors as `task_passed`.
    if (!accept || accept.ok !== true) continue;
    const task = run.task_id || 'unknown';
    if (!CONTROL_SET.has(task)) continue;
    const stub = run.stub || null;
    const model = String(run.model_id || '');
    if (stub === 'elaborate' || model.includes('elaborate')) continue;
    out.push({
      runId: name,
      dir,
      arm: run.arm || 'unknown',
      task,
    });
  }
  return out.sort((a, b) => a.runId.localeCompare(b.runId));
}

/**
 * Simulate write-time hooks: each changed file alone, no corpus.
 * This is what PreToolUse / PostToolUse actually see.
 * @param {string} diffText
 * @returns {Map<string, number>} signalId -> fire count (files)
 */
export function scanWriteSim(diffText) {
  const files = parseUnifiedDiff(diffText || '');
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const file of files) {
    const view = {
      path: file.path,
      content: file.content || '',
      addedContent: file.addedContent || '',
      shape: file.shape,
      pathExists: file.pathExists,
      truncated: false,
      context: /** @type {const} */ ('write'),
      corpus: null,
    };
    for (const sig of runSignals(ALL_SIGNALS, view)) {
      counts.set(sig.id, (counts.get(sig.id) || 0) + 1);
    }
  }
  return counts;
}

/**
 * Diff-context scan with a multi-file corpus (review surface).
 * @param {string} diffText
 * @param {string | null} workDir
 */
export function scanDiffWithCorpus(diffText, workDir) {
  const files = parseUnifiedDiff(diffText || '');
  const corpus =
    workDir && fs.existsSync(workDir)
      ? walkText(workDir)
      : files.map((f) => f.content || '').join('\n');
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const file of files) {
    const view = {
      path: file.path,
      content: file.content || '',
      addedContent: file.addedContent || '',
      shape: file.shape,
      pathExists: file.pathExists,
      truncated: false,
      context: /** @type {const} */ ('diff'),
      corpus,
    };
    for (const sig of runSignals(ALL_SIGNALS, view)) {
      counts.set(sig.id, (counts.get(sig.id) || 0) + 1);
    }
  }
  return counts;
}

/**
 * @param {Map<string, NegStat>} stats
 * @param {Map<string, number>} counts
 * @param {number} runTotal
 */
function accumulate(stats, counts, _runTotal) {
  const fired = new Set(counts.keys());
  for (const sig of ALL_SIGNALS) {
    let st = stats.get(sig.id);
    if (!st) {
      st = { signalId: sig.id, runs: 0, runsFired: 0, fileFires: 0 };
      stats.set(sig.id, st);
    }
    st.runs += 1;
    const n = counts.get(sig.id) || 0;
    if (n > 0) st.runsFired += 1;
    st.fileFires += n;
  }
  // Also count ids that fired but were removed from ALL_SIGNALS? skip.
  for (const id of fired) {
    if (!stats.has(id)) {
      stats.set(id, {
        signalId: id,
        runs: 1,
        runsFired: 1,
        fileFires: counts.get(id) || 0,
      });
    }
  }
}

/**
 * Positive corpus: one subdirectory per signal id.
 * @returns {Map<string, { exists: boolean, fired: boolean, findings: string[] }>}
 */
export function scanPositiveCorpus() {
  /** @type {Map<string, { exists: boolean, fired: boolean, findings: string[] }>} */
  const out = new Map();
  for (const sig of ALL_SIGNALS) {
    const dir = path.join(POSITIVE_DIR, sig.id);
    if (!fs.existsSync(dir)) {
      out.set(sig.id, { exists: false, fired: false, findings: [] });
      continue;
    }
    const files = [];
    const walk = (d) => {
      for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, ent.name);
        if (ent.isDirectory()) walk(p);
        else if (/\.(js|mjs|cjs|ts|tsx|jsx|json)$/i.test(ent.name)) files.push(p);
      }
    };
    walk(dir);
    const corpus = files.map((f) => fs.readFileSync(f, 'utf8')).join('\n');
    const findings = [];
    let fired = false;
    for (const fp of files) {
      const content = fs.readFileSync(fp, 'utf8');
      const rel = path.relative(dir, fp).replace(/\\/g, '/');
      // Prefer diff/repo for corpus-backed signals; write for create-time ones.
      const contexts = sig.contexts.includes('repo')
        ? ['repo']
        : sig.contexts.includes('diff')
          ? ['diff']
          : ['write'];
      for (const context of contexts) {
        const view = {
          path: rel,
          content,
          addedContent: content,
          // Change-only dependency detection needs the dependency object in a
          // fragment view; a whole existing package.json cannot prove an add.
          shape: /** @type {const} */ (
            sig.id === 'new-dependency' ? 'fragment' : 'full'
          ),
          pathExists: sig.id === 'large-first-write' ? false : true,
          truncated: false,
          context,
          corpus,
        };
        // new-file / large-first-write need pathExists false; large-first also size.
        if (sig.id === 'large-first-write' || sig.id === 'new-file') {
          view.pathExists = false;
        }
        const hits = runSignals([sig], view);
        if (hits.length) {
          fired = true;
          findings.push(`${rel} (${context})`);
        }
      }
    }
    out.set(sig.id, { exists: true, fired, findings });
  }
  return out;
}

/**
 * @returns {{
 *   runs: number,
 *   write: NegStat[],
 *   diff: NegStat[],
 *   positive: Map<string, { exists: boolean, fired: boolean, findings: string[] }>,
 * }}
 */
export function measure() {
  const runs = listNegativeRuns();
  /** @type {Map<string, NegStat>} */
  const writeStats = new Map();
  /** @type {Map<string, NegStat>} */
  const diffStats = new Map();

  for (const run of runs) {
    const diffText = fs.readFileSync(path.join(run.dir, 'diff.patch'), 'utf8');
    const workDir = path.join(run.dir, 'work');
    accumulate(writeStats, scanWriteSim(diffText), runs.length);
    accumulate(diffStats, scanDiffWithCorpus(diffText, workDir), runs.length);
  }

  const order = new Map(ALL_SIGNALS.map((s, i) => [s.id, i]));
  const sortStats = (m) =>
    [...m.values()].sort((a, b) => (order.get(a.signalId) ?? 99) - (order.get(b.signalId) ?? 99));

  return {
    runs: runs.length,
    write: sortStats(writeStats),
    diff: sortStats(diffStats),
    positive: scanPositiveCorpus(),
  };
}

/**
 * @param {ReturnType<typeof measure>} report
 */
export function formatReport(report) {
  const lines = [];
  lines.push(`# Signal false-positive report`);
  lines.push('');
  lines.push(
    `Negative corpus: ${report.runs} accepted control-task runs (invite fixtures and elaborate stubs excluded; any fire = FP).`,
  );
  lines.push('');
  lines.push('## Write-time simulation (no corpus — matches hooks)');
  lines.push('');
  lines.push('| signal | runs fired | rate | file fires |');
  lines.push('|---|---:|---:|---:|');
  for (const s of report.write) {
    const rate = s.runs ? ((100 * s.runsFired) / s.runs).toFixed(1) + '%' : 'n/a';
    lines.push(`| ${s.signalId} | ${s.runsFired}/${s.runs} | ${rate} | ${s.fileFires} |`);
  }
  lines.push('');
  lines.push('## Diff context (corpus from worktree / change)');
  lines.push('');
  lines.push('| signal | runs fired | rate | file fires |');
  lines.push('|---|---:|---:|---:|');
  for (const s of report.diff) {
    const rate = s.runs ? ((100 * s.runsFired) / s.runs).toFixed(1) + '%' : 'n/a';
    lines.push(`| ${s.signalId} | ${s.runsFired}/${s.runs} | ${rate} | ${s.fileFires} |`);
  }
  lines.push('');
  lines.push('## Positive corpus');
  lines.push('');
  if (![...report.positive.values()].some((p) => p.exists)) {
    lines.push('_No `bench/corpus/positive/<signal-id>/` dirs yet._');
  } else {
    lines.push('| signal | example exists | fires |');
    lines.push('|---|---|---|');
    for (const sig of ALL_SIGNALS) {
      const p = report.positive.get(sig.id);
      if (!p) continue;
      lines.push(
        `| ${sig.id} | ${p.exists ? 'yes' : 'no'} | ${p.exists ? (p.fired ? 'yes' : 'NO') : '—'} |`,
      );
    }
  }
  lines.push('');
  return lines.join('\n');
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const report = measure();
  if (process.argv.includes('--json')) {
    console.log(
      JSON.stringify(
        {
          runs: report.runs,
          write: report.write,
          diff: report.diff,
          positive: Object.fromEntries(report.positive),
        },
        null,
        2,
      ),
    );
  } else {
    process.stdout.write(formatReport(report));
  }
}
