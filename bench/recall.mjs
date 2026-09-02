#!/usr/bin/env node
// Scanner recall on labeled real-world diffs. Zero deps. Reads only.
//   node bench/recall.mjs [manifest.jsonl] [diffsDir]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { scanDiff } from '../scripts/scan.mjs';

export function measureRecall(manifestPath, diffsDir) {
  const lines = fs.readFileSync(manifestPath, 'utf8').split(/\r?\n/).filter(Boolean);
  const rows = [];
  const perSignal = {};
  let overbuilt = 0;
  let clean = 0;
  let hitsOverbuilt = 0;
  let hitsClean = 0;
  for (const line of lines) {
    const m = JSON.parse(line);
    const text = fs.readFileSync(path.join(diffsDir, `${m.id}.diff`), 'utf8');
    const fired = [...new Set(scanDiff(text).map((f) => f.signalId))];
    for (const id of fired) perSignal[id] = (perSignal[id] || 0) + 1;
    if (m.label === 'overbuilt') {
      overbuilt += 1;
      if (fired.length) hitsOverbuilt += 1;
    } else {
      clean += 1;
      if (fired.length) hitsClean += 1;
    }
    rows.push({ id: m.id, label: m.label, fired });
  }
  return {
    overbuilt,
    clean,
    hitsOverbuilt,
    hitsClean,
    recall: overbuilt ? hitsOverbuilt / overbuilt : 0,
    fp: clean ? hitsClean / clean : 0,
    perSignal,
    rows,
  };
}

const isMain =
  process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const manifest = process.argv[2] || path.join(here, 'recall', 'manifest.jsonl');
  const diffs = process.argv[3] || path.join(here, 'recall', 'diffs');
  const r = measureRecall(manifest, diffs);
  const out = [];
  out.push('| id | label | fired |', '|---|---|---|');
  for (const row of r.rows) out.push(`| ${row.id} | ${row.label} | ${row.fired.join(', ') || '-'} |`);
  out.push('');
  out.push(`overbuilt: ${r.hitsOverbuilt}/${r.overbuilt} caught (recall ${(r.recall * 100).toFixed(1)}%)`);
  out.push(`clean: ${r.hitsClean}/${r.clean} flagged (fp ${(r.fp * 100).toFixed(1)}%)`);
  out.push('');
  out.push('| signal | diffs fired |', '|---|---:|');
  for (const [id, n] of Object.entries(r.perSignal).sort()) out.push(`| ${id} | ${n} |`);
  out.push('');
  process.stdout.write(out.join('\n'));
}
