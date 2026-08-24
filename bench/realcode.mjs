#!/usr/bin/env node
// Real-code negative corpus: fire rates over published, reviewed projects.
//
//   node bench/realcode.mjs                 # scan the default corpus
//   node bench/realcode.mjs <dir> [dir...]  # scan specific trees
//
// Why this exists: the 40-run bench corpus (bench/fp.mjs) scores every signal
// at 0/40, but those solutions are 10-30 lines, single-module, comment-free.
// Measured 2026-08-25, the same signals fire on 70% of files in ordinary
// third-party code. A signal that is silent on toy inputs and loud on real
// ones is not a working signal.
//
// Treat every fire here as suspect. This corpus is unlabeled — the code is
// merely published and reviewed, not certified free of over-engineering — so
// the number to watch is the RATE and its trend, not any single finding.
//
// Zero deps. Read-only. No network.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ALL_SIGNALS, runSignals } from '../hooks/signals.js';
import { collectFiles, readTextFile } from '../scripts/scan.mjs';

// Default corpus: whatever real code is on this machine. Offcut's own source is
// always included — it is free, in-repo, and already caught one false positive
// the bench corpus could not.
function defaultRoots() {
  const here = path.resolve(import.meta.dirname, '..');
  const roots = [path.join(here, 'hooks'), path.join(here, 'scripts'), path.join(here, 'bench')];
  const plugins = path.join(os.homedir(), '.claude', 'plugins', 'cache');
  if (fs.existsSync(plugins)) roots.push(plugins);
  return roots.filter((r) => fs.existsSync(r));
}

const roots = process.argv.slice(2).filter((a) => !a.startsWith('-'));
const targets = roots.length ? roots : defaultRoots();

const files = collectFiles(targets);
const byExt = new Map();
const bySignal = new Map();
const filesWithFindings = new Set();

for (const file of files) {
  const content = readTextFile(file);
  if (content == null) continue;
  const ext = path.extname(file).toLowerCase() || '(none)';
  const view = {
    path: file,
    content,
    addedContent: content,
    shape: 'full',
    pathExists: true,
    truncated: false,
    context: 'repo',
    corpus: null,
  };
  const hits = runSignals(ALL_SIGNALS, view);
  if (!byExt.has(ext)) byExt.set(ext, { files: 0, fires: 0 });
  byExt.get(ext).files += 1;
  if (hits.length) {
    filesWithFindings.add(file);
    byExt.get(ext).fires += 1;
    for (const h of hits) bySignal.set(h.id, (bySignal.get(h.id) || 0) + 1);
  }
}

const total = files.length;
const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : '0.0');

console.log('# Real-code corpus\n');
console.log(`roots:\n${targets.map((t) => '  ' + t).join('\n')}\n`);
console.log(`files scanned: ${total}`);
console.log(`files with >=1 finding: ${filesWithFindings.size} (${pct(filesWithFindings.size)}%)\n`);

console.log('## Fire rate per signal\n');
console.log('| signal | files fired | rate |');
console.log('|---|---:|---:|');
for (const s of ALL_SIGNALS) {
  const n = bySignal.get(s.id) || 0;
  console.log(`| ${s.id} | ${n} | ${pct(n)}% |`);
}

console.log('\n## By file type\n');
console.log('| ext | files | files fired | rate |');
console.log('|---|---:|---:|---:|');
for (const [ext, v] of [...byExt].sort((a, b) => b[1].fires - a[1].fires).slice(0, 12)) {
  const r = v.files ? ((v.fires / v.files) * 100).toFixed(1) : '0.0';
  console.log(`| ${ext} | ${v.files} | ${v.fires} | ${r}% |`);
}

// A signal firing on most files carries no information regardless of wording.
const noisy = [...bySignal].filter(([, n]) => n / Math.max(total, 1) > 0.2);
if (noisy.length) {
  console.log('\n## Over threshold (>20% of files)\n');
  for (const [id, n] of noisy.sort((a, b) => b[1] - a[1])) {
    console.log(`- **${id}** — ${n} files (${pct(n)}%). A signal this loud cannot be acted on.`);
  }
}
