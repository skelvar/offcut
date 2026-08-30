#!/usr/bin/env node
// Blind scorer: metrics from diff + accept.json (+ optional state-after for fired signals).
// Does not read arm labels.
//
//   node bench/score.mjs <run-dir>
//   node bench/score.mjs --all

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RUNS_DIR, sha256 } from './lib.mjs';
import { parseUnifiedDiff } from '../scripts/scan.mjs';
import { ALL_SIGNALS, runSignals } from '../hooks/signals.js';

/**
 * Normalize fired keys from state (`post:exported-unused` / `speculative-abstraction`)
 * to bare signal ids.
 * @param {string} raw
 */
export function normalizeSignalId(raw) {
  const s = String(raw || '').trim();
  if (s.startsWith('post:')) return s.slice(5);
  if (s.startsWith('pre:')) return s.slice(4);
  return s;
}

/**
 * Collect every signal id recorded in state-after.json fired-* files.
 * @param {Record<string, string|null>|null|undefined} stateAfter
 * @returns {string[]} sorted unique bare ids
 */
export function extractFiredSignals(stateAfter) {
  if (!stateAfter || typeof stateAfter !== 'object') return [];
  const ids = new Set();
  for (const [key, val] of Object.entries(stateAfter)) {
    if (!key.startsWith('fired-') && key !== 'fired') continue;
    let list = [];
    try {
      const raw = String(val ?? '').replace(/^\uFEFF/, '').trim();
      if (!raw) continue;
      const parsed = JSON.parse(raw);
      // Legacy: bare array. Phase 8+: { confirmed, pending }.
      if (Array.isArray(parsed)) list = parsed;
      else if (parsed && typeof parsed === 'object') {
        list = [
          ...(Array.isArray(parsed.confirmed) ? parsed.confirmed : []),
          ...(Array.isArray(parsed.pending) ? parsed.pending : []),
        ];
      }
    } catch {
      continue;
    }
    for (const item of list) ids.add(normalizeSignalId(item));
  }
  return [...ids].filter(Boolean).sort();
}

/**
 * Re-run surviving signals against the final worktree (preferred) or diff hunks.
 * Worktree full-file views are required for "pattern survived": a unified diff
 * fragment often omits unchanged function headers, which silently drops matches.
 * @param {string} diffText
 * @param {string|null} workDir
 */
export function detectSignalsInDiff(diffText, workDir) {
  const files = parseUnifiedDiff(diffText || '');
  let corpus = '';
  if (workDir && fs.existsSync(workDir)) {
    corpus = walkText(workDir);
  } else {
    corpus = files.map((f) => f.addedContent || f.content || '').join('\n');
  }

  const ids = new Set();

  if (workDir && fs.existsSync(workDir) && files.length) {
    for (const f of files) {
      const abs = path.join(workDir, f.path);
      if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
      const content = fs.readFileSync(abs, 'utf8');
      const view = {
        path: f.path,
        content,
        addedContent: f.addedContent,
        removedContent: f.removedContent || '',
        shape: f.shape,
        pathExists: f.pathExists,
        truncated: false,
        context: 'diff',
        corpus,
      };
      for (const sig of runSignals(ALL_SIGNALS, view)) {
        ids.add(sig.id);
      }
    }
    return [...ids].sort();
  }

  for (const f of files) {
    const view = {
      path: f.path,
      content: f.content || f.addedContent || '',
      addedContent: f.addedContent || '',
      removedContent: f.removedContent || '',
      shape: f.pathExists === false ? 'full' : 'fragment',
      pathExists: f.pathExists,
      truncated: false,
      context: 'diff',
      corpus,
    };
    for (const sig of runSignals(ALL_SIGNALS, view)) {
      ids.add(sig.id);
    }
  }
  return [...ids].sort();
}

/**
 * @param {string} diffText
 * @param {string} workDir
 */
export function scoreDiff(diffText, workDir) {
  const files = parseUnifiedDiff(diffText || '');
  let linesAdded = 0;
  let linesRemoved = 0;

  for (const line of String(diffText || '').split(/\r?\n/)) {
    if (line.startsWith('+') && !line.startsWith('+++')) linesAdded += 1;
    else if (line.startsWith('-') && !line.startsWith('---')) linesRemoved += 1;
  }

  const filesCreated = new Set(files.filter((f) => f.pathExists === false).map((f) => f.path));

  // Dependencies: look for package.json dependency key additions
  let depsAdded = 0;
  for (const f of files) {
    const base = path.basename(f.path || '');
    if (base !== 'package.json') continue;
    const added = f.addedContent || '';
    const depBlock = /"dependencies"\s*:\s*\{([^}]*)\}/.exec(added);
    if (depBlock) {
      depsAdded += [...depBlock[1].matchAll(/"[^"]+"\s*:/g)].length;
    }
    // also count any +    "foo": lines under deps in the raw diff hunk
    for (const line of (f.addedContent || '').split(/\r?\n/)) {
      if (/^\s*"[^"]+"\s*:\s*"/.test(line) && !/"(name|private|type|engines|version)"/.test(line)) {
        // already counted via block when possible; if no block, count lines
        if (!depBlock) depsAdded += 1;
      }
    }
  }

  // Build corpus of all added + remaining worktree JS for export checks
  let corpus = '';
  if (workDir && fs.existsSync(workDir)) {
    corpus = walkText(workDir);
  } else {
    corpus = files.map((f) => f.addedContent || f.content || '').join('\n');
  }

  let exportedUnused = 0;
  let abstractionLayers = 0;
  let configKeys = 0;

  for (const f of files) {
    const view = {
      path: f.path,
      content: f.content || f.addedContent || '',
      addedContent: f.addedContent || '',
      shape: f.pathExists === false ? 'full' : 'fragment',
      pathExists: f.pathExists,
      truncated: false,
      context: 'diff',
      corpus,
    };
    const findings = runSignals(ALL_SIGNALS, view);
    for (const sig of findings) {
      if (sig.id === 'exported-unused') exportedUnused += 1;
      if (sig.id === 'speculative-abstraction') abstractionLayers += 1;
      if (sig.id === 'new-config-surface') configKeys += 1;
    }

    // Extra abstraction heuristic: new *Factory / *Provider / *Strategy / abstract class files
    const base = path.basename(f.path || '');
    if (
      f.pathExists === false &&
      /(Factory|Provider|Strategy|Abstract|Interface|Validator)\.[cm]?js$/.test(base)
    ) {
      abstractionLayers += 1;
    }

    // Config keys added in *.json config-ish files
    if (/\.json$/i.test(f.path || '') && /config|settings/i.test(f.path || '')) {
      const keys = [...(f.addedContent || '').matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]);
      configKeys += keys.filter((k) => !['name', 'private', 'type', 'engines'].includes(k)).length;
    }
  }

  const signalsInDiff = detectSignalsInDiff(diffText, workDir);

  return {
    files_created: filesCreated.size,
    files_created_paths: [...filesCreated].sort(),
    dependencies_added: depsAdded,
    exported_unused: exportedUnused,
    abstraction_layers: abstractionLayers,
    config_keys_added: configKeys,
    lines_added: linesAdded,
    lines_removed: linesRemoved,
    diff_sha256: sha256(diffText || ''),
    signals_in_diff: signalsInDiff,
    signals_in_diff_count: signalsInDiff.length,
  };
}

function walkText(dir) {
  const parts = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(js|mjs|cjs|json|ts|tsx|jsx)$/i.test(ent.name)) {
        parts.push(fs.readFileSync(p, 'utf8'));
      }
    }
  };
  walk(dir);
  return parts.join('\n');
}

/**
 * Score one opaque run directory. Writes metrics.json and signals.json.
 * @param {string} runDir
 */
export function scoreRun(runDir) {
  const diffPath = path.join(runDir, 'diff.patch');
  const acceptPath = path.join(runDir, 'accept.json');
  const workDir = path.join(runDir, 'work');
  const statePath = path.join(runDir, 'state-after.json');

  if (!fs.existsSync(diffPath) || !fs.existsSync(acceptPath)) {
    throw new Error(`run dir incomplete: ${runDir}`);
  }

  const diffText = fs.readFileSync(diffPath, 'utf8');
  const accept = JSON.parse(fs.readFileSync(acceptPath, 'utf8'));
  const metrics = scoreDiff(diffText, fs.existsSync(workDir) ? workDir : null);

  let stateAfter = null;
  if (fs.existsSync(statePath)) {
    try {
      stateAfter = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    } catch {
      stateAfter = null;
    }
  }

  const signalsFired = extractFiredSignals(stateAfter);
  const inDiff = new Set(metrics.signals_in_diff || []);
  // Of the signals the hooks actually challenged, which patterns remain in the final diff?
  const survived = signalsFired.filter((id) => inDiff.has(id));
  const cleared = signalsFired.filter((id) => !inDiff.has(id));
  // null when nothing fired — "survived" is not meaningful without a challenge.
  const flaggedPatternSurvived =
    signalsFired.length === 0 ? null : survived.length > 0;

  const signals = {
    signals_fired: signalsFired,
    signals_fired_count: signalsFired.length,
    signals_in_diff: metrics.signals_in_diff,
    signals_in_diff_count: metrics.signals_in_diff_count,
    flagged_survived: survived,
    flagged_cleared: cleared,
    flagged_pattern_survived: flaggedPatternSurvived,
  };

  fs.writeFileSync(path.join(runDir, 'signals.json'), JSON.stringify(signals, null, 2) + '\n');

  const out = {
    run_id: path.basename(runDir),
    task_passed: Boolean(accept.ok),
    accept_exit: accept.exitCode ?? null,
    accept_error: accept.error ?? null,
    ...metrics,
    ...signals,
    // no arm field — blind
  };

  fs.writeFileSync(path.join(runDir, 'metrics.json'), JSON.stringify(out, null, 2) + '\n');
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv[0] === '--all') {
    if (!fs.existsSync(RUNS_DIR)) {
      console.log('[]');
      return;
    }
    const ids = fs.readdirSync(RUNS_DIR).filter((n) => fs.existsSync(path.join(RUNS_DIR, n, 'diff.patch')));
    const all = ids.map((id) => scoreRun(path.join(RUNS_DIR, id)));
    console.log(JSON.stringify(all, null, 2));
    return;
  }
  const runDir = argv[0];
  if (!runDir) {
    console.error('usage: score.mjs <run-dir> | --all');
    process.exit(2);
  }
  const m = scoreRun(path.resolve(runDir));
  console.log(JSON.stringify(m, null, 2));
}

const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) main();
