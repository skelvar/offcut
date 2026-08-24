import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import {
  PRE_SIGNALS,
  POST_SIGNALS,
  ALL_SIGNALS,
  runSignals,
} from '../hooks/signals.js';
import { measure } from '../bench/fp.mjs';
import {
  buildProjects,
  scanRealCode,
  defaultProjectInputs,
} from '../bench/realcode.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSITIVE = path.join(ROOT, 'bench', 'corpus', 'positive');

function view(partial) {
  return {
    path: null,
    content: '',
    addedContent: '',
    shape: 'full',
    pathExists: true,
    truncated: false,
    context: 'write',
    corpus: null,
    ...partial,
  };
}

// --- config-for-constant ---

test('config-for-constant is deleted', () => {
  assert.equal(
    ALL_SIGNALS.find((s) => s.id === 'config-for-constant'),
    undefined,
  );
  assert.equal(
    PRE_SIGNALS.find((s) => s.id === 'config-for-constant'),
    undefined,
  );
});

test('config-for-constant positive corpus dir is gone', () => {
  assert.equal(
    fs.existsSync(path.join(POSITIVE, 'config-for-constant')),
    false,
  );
});

// --- file-type applicability ---

test('every signal declares extensions; runner filters on them', () => {
  for (const signal of ALL_SIGNALS) {
    assert.ok(
      Array.isArray(signal.extensions) || signal.extensions === '*',
      `${signal.id} missing extensions`,
    );
    if (Array.isArray(signal.extensions)) {
      assert.ok(signal.extensions.length > 0, `${signal.id} empty extensions`);
      for (const ext of signal.extensions) {
        assert.ok(
          typeof ext === 'string' && (ext.startsWith('.') || ext === '*'),
          `${signal.id} bad extension ${ext}`,
        );
      }
    }
  }
});

test('JS-shaped signals do not run on JSON or Markdown', () => {
  const jsShaped = [
    'speculative-abstraction',
    'exported-unused',
    'new-config-surface',
    'unused-default-param',
  ];
  for (const id of jsShaped) {
    const sig = ALL_SIGNALS.find((s) => s.id === id);
    assert.ok(sig, id);
    assert.ok(Array.isArray(sig.extensions), `${id} should list extensions`);
    assert.ok(!sig.extensions.includes('.json'), `${id} must not include .json`);
    assert.ok(!sig.extensions.includes('.md'), `${id} must not include .md`);
  }

  // Markdown example block that previously tripped config-for-constant and
  // can look like wrappers / env config to text matchers.
  const md = [
    '# Setup',
    '```',
    'NODE_ENV=production',
    'PORT=3000',
    'DATABASE_URL=postgres://localhost/db',
    'const getUser = (id) => db.getUser(id)',
    '```',
  ].join('\n');
  const mdHits = runSignals(
    ALL_SIGNALS,
    view({
      path: 'README.md',
      content: md,
      addedContent: md,
      context: 'repo',
      corpus: md + '\nimport x from "./x.js"\n',
    }),
  );
  assert.deepEqual(
    mdHits.map((h) => h.id),
    [],
    `markdown fired: ${mdHits.map((h) => h.id).join(',')}`,
  );

  const json = '{\n  "MAX_RETRIES": 3,\n  "PORT": 3000\n}\n';
  const jsonHits = runSignals(
    ALL_SIGNALS,
    view({
      path: 'config.json',
      content: json,
      addedContent: json,
      context: 'repo',
      corpus: json,
    }),
  );
  assert.deepEqual(
    jsonHits.map((h) => h.id),
    [],
    `json fired: ${jsonHits.map((h) => h.id).join(',')}`,
  );
});

test('extension filter is enforced by runSignals, not only by check()', () => {
  // Regression: a signal whose check() would match must still be suppressed
  // on the wrong file type. Fails if gating lives only inside individual checks.
  const text = 'export interface Store { get(k: string): string }\nexport class MemoryStore implements Store { get(k: string) { return k; } }\n';
  const hits = runSignals(ALL_SIGNALS, view({
    path: 'notes.md',
    content: text,
    addedContent: text,
    context: 'repo',
  }));
  assert.ok(
    !hits.find((h) => h.id === 'speculative-abstraction'),
    'speculative-abstraction must not fire on .md even when content matches',
  );
});

test('single-call-wrapper is deleted', () => {
  assert.equal(
    ALL_SIGNALS.find((s) => s.id === 'single-call-wrapper'),
    undefined,
  );
  assert.equal(
    fs.existsSync(path.join(POSITIVE, 'single-call-wrapper')),
    false,
  );
});

// --- surviving positives still fire ---

test('every surviving signal still fires on its positive example', () => {
  for (const sig of ALL_SIGNALS) {
    const dir = path.join(POSITIVE, sig.id);
    assert.ok(fs.existsSync(dir), `missing positive example for ${sig.id}`);
  }
  const report = measure();
  for (const sig of ALL_SIGNALS) {
    const p = report.positive.get(sig.id);
    assert.ok(p?.exists && p.fired, `${sig.id} must fire on its positive example`);
  }
});

test('negative corpus still 0/40 write-time for every survivor', () => {
  const report = measure();
  assert.ok(report.runs >= 40);
  for (const s of report.write) {
    assert.equal(
      s.runsFired,
      0,
      `${s.signalId} fires on ${s.runsFired}/${s.runs} negatives`,
    );
  }
});

// --- realcode per-project corpus ---

test('buildProjects groups dirs into named projects with file lists', () => {
  const projects = buildProjects([
    { name: 'offcut', dirs: [path.join(ROOT, 'hooks'), path.join(ROOT, 'scripts')] },
  ]);
  assert.ok(Array.isArray(projects));
  assert.ok(projects.length >= 1);
  assert.equal(projects[0].name, 'offcut');
  assert.ok(projects[0].files.length > 0);
  const report = scanRealCode(projects);
  assert.ok(typeof report.exportedUnusedRate === 'number');
  // exported-unused must be exercised (corpus non-null), not stuck at "unrun".
  assert.equal(report.exportedUnusedExercised, true);
});

test('scanRealCode builds per-project corpus so exported-unused can fire', () => {
  const tmp = path.join(ROOT, 'tests', 'fixtures', 'corpus-project');
  fs.mkdirSync(tmp, { recursive: true });
  const lib = path.join(tmp, 'lib.js');
  const main = path.join(tmp, 'main.js');
  fs.writeFileSync(
    lib,
    'export function used() { return 1 }\nexport function orphanHelper() { return 2 }\n',
  );
  fs.writeFileSync(main, 'import { used } from "./lib.js";\nused();\n');
  try {
    const projects = [{ name: 'fixture', files: [lib, main] }];
    const report = scanRealCode(projects);
    assert.equal(report.exportedUnusedExercised, true);
    assert.ok(
      (report.bySignal.get('exported-unused') || 0) >= 1,
      'exported-unused should fire on orphanHelper with per-project corpus',
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('gating: non-JS files get no write-time challenge (documented cliff)', () => {
  // Extension gating is correct — ungated these checks were 65% noise on .py.
  // But it silently removes the write-time challenge for non-JS projects, so
  // the boundary is pinned here and documented in README/SIGNALS.md.
  const src = [
    'from abc import ABC, abstractmethod',
    'class Store(ABC):',
    '    @abstractmethod',
    '    def get(self, k): ...',
    'class MemStore(Store):',
    '    def get(self, k): return k',
  ].join('\n');
  const mk = (p) => ({
    path: p, content: src, addedContent: src, shape: 'full',
    pathExists: false, truncated: false, context: 'write',
  });
  assert.equal(runSignals(ALL_SIGNALS, mk('store.py')).length, 0, 'python should be silent');

  const ts = 'export interface Store { get(k: string): string }\n'
    + 'export class MemStore implements Store { get(k) { return k } }\n';
  const hits = runSignals(ALL_SIGNALS, {
    path: 'store.ts', content: ts, addedContent: ts, shape: 'full',
    pathExists: false, truncated: false, context: 'write',
  });
  assert.ok(hits.length > 0, 'typescript must still fire — gating went too far');
});

test('corpus: git internals are not treated as projects', () => {
  const inputs = defaultProjectInputs();
  const bad = inputs.filter((i) => /(^|@)\.git$/.test(i.name) || i.name.endsWith('@.git'));
  assert.deepEqual(bad, [], 'a .git dir was scanned as a project');
});
