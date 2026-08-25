#!/usr/bin/env node
// Descriptive helpers for Phase 10 hand judgment. Not the verdict.
// Reads opaque run dirs + sealed manifest. Does not decide lean/over-built.
//
//   node bench/judge-describe.mjs

import fs from 'node:fs';
import path from 'node:path';
import { RUNS_DIR, readManifest, JUSTIFY_TASK_IDS } from './lib.mjs';

function publicMethodsAdded(diffText, fileHint) {
  // Methods on returned object literals: has(, delete(, clear(, etc.
  const methods = new Set();
  const re = /^\+\s*(?:async\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*\(/gm;
  let m;
  while ((m = re.exec(diffText || ''))) {
    const name = m[1];
    if (['if', 'for', 'while', 'switch', 'catch', 'function', 'return'].includes(name)) continue;
    methods.add(name);
  }
  return [...methods].sort();
}

function structureHits(diffText) {
  const text = diffText || '';
  const hits = [];
  if (/\binterface\s+[A-Z]/.test(text) || /\babstract\s+class\b/.test(text)) hits.push('interface');
  if (/^\+\s*(?:export\s+)?class\s+/m.test(text)) hits.push('class');
  if (/\bcreate[A-Z][A-Za-z]*Factory\b/.test(text) || /\b[A-Z][A-Za-z]*Factory\b/.test(text)) {
    hits.push('factory');
  }
  if (/\b(Manager|Facade|Dispatcher|Repository|Provider)\b/.test(text)) hits.push('wrapper');
  if (/\.config\.(json|js|ts)\b/.test(text) || /config\.json/.test(text)) hits.push('config');
  // New directory-ish paths in diff headers
  if (/^diff --git a\/[^/]+\/.+/m.test(text)) hits.push('layer');
  return [...new Set(hits)];
}

function rationaleFlags(transcriptText) {
  const t = String(transcriptText || '');
  // Claude JSON result field if present
  let result = t;
  try {
    const parsed = JSON.parse(t);
    if (parsed && typeof parsed.result === 'string') result = parsed.result;
  } catch {
    // raw
  }
  const rationale_present =
    /\b(because|since|instead of|rather than|justif|needed|not needed|skipped|rejected|alternative)\b/i.test(
      result,
    );
  const cites_concrete =
    /\b(prompt|accept\.mjs|cache\.js|claim\.js|mail\.js|package\.json|line \d+|caller|requirement)\b/i.test(
      result,
    );
  return { rationale_present, cites_concrete, result_excerpt: result.slice(0, 240) };
}

function openCacheSurface(diffText) {
  const hasHas = /^\+\s*has\s*\(/m.test(diffText || '');
  const hasDelete = /^\+\s*delete\s*\(/m.test(diffText || '');
  return { has_method: hasHas, delete_method: hasDelete };
}

const manifest = readManifest().filter((e) => JUSTIFY_TASK_IDS.includes(e.task_id) && !e.stub);
const rows = [];

for (const entry of manifest) {
  const dir = path.join(RUNS_DIR, entry.run_id);
  if (!fs.existsSync(dir)) continue;
  const diff = fs.existsSync(path.join(dir, 'diff.patch'))
    ? fs.readFileSync(path.join(dir, 'diff.patch'), 'utf8')
    : '';
  const transcript = fs.existsSync(path.join(dir, 'transcript.txt'))
    ? fs.readFileSync(path.join(dir, 'transcript.txt'), 'utf8')
    : '';
  const metrics = fs.existsSync(path.join(dir, 'metrics.json'))
    ? JSON.parse(fs.readFileSync(path.join(dir, 'metrics.json'), 'utf8'))
    : {};
  const surface = publicMethodsAdded(diff);
  const structure = structureHits(diff);
  const rationale = rationaleFlags(transcript);
  const cache = entry.task_id === 'open-cache' ? openCacheSurface(diff) : null;
  rows.push({
    run_id: entry.run_id,
    task_id: entry.task_id,
    arm: entry.arm,
    rep: entry.rep,
    task_passed: metrics.task_passed ?? null,
    lines_added: metrics.lines_added ?? null,
    methods_added: surface,
    structure_hits: structure,
    open_cache: cache,
    ...rationale,
    // description only — Offcut signals never decide the verdict
    signals_fired: metrics.signals_fired || [],
  });
}

const outPath = path.join(path.dirname(RUNS_DIR), 'justify-describe.json');
fs.writeFileSync(outPath, JSON.stringify(rows, null, 2) + '\n');
console.log(JSON.stringify({ n: rows.length, out: outPath }, null, 2));
