#!/usr/bin/env node
// Blind scorer: metrics from diff + accept.json only. Does not read arm labels.
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
      if (sig.id === 'config-for-constant' || sig.id === 'new-config-surface') configKeys += 1;
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
  };
}

function walkText(dir) {
  const parts = [];
  const walk = (d) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === '.git' || ent.name === 'node_modules') continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(js|mjs|cjs|json|ts)$/i.test(ent.name)) {
        parts.push(fs.readFileSync(p, 'utf8'));
      }
    }
  };
  walk(dir);
  return parts.join('\n');
}

/**
 * Score one opaque run directory. Writes metrics.json.
 * @param {string} runDir
 */
export function scoreRun(runDir) {
  const diffPath = path.join(runDir, 'diff.patch');
  const acceptPath = path.join(runDir, 'accept.json');
  const workDir = path.join(runDir, 'work');

  if (!fs.existsSync(diffPath) || !fs.existsSync(acceptPath)) {
    throw new Error(`run dir incomplete: ${runDir}`);
  }

  const diffText = fs.readFileSync(diffPath, 'utf8');
  const accept = JSON.parse(fs.readFileSync(acceptPath, 'utf8'));
  const metrics = scoreDiff(diffText, fs.existsSync(workDir) ? workDir : null);

  const out = {
    run_id: path.basename(runDir),
    task_passed: Boolean(accept.ok),
    accept_exit: accept.exitCode ?? null,
    accept_error: accept.error ?? null,
    ...metrics,
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
