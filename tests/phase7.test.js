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
  independence,
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

test('corpus independence: a fire in our own code cannot enter the published rate', () => {
  // Measured 2026-08-27: 810 of 918 eligible files (88%) were Offcut's own
  // source, counted twice because the working tree and the installed plugin
  // copy are both in the cache, and 43 more belonged to the tool Offcut is to
  // be benchmarked against. The blended "8.5%" was mostly Offcut scoring
  // itself, so every project is classified and only the independent group is
  // publishable.
  assert.equal(independence('offcut'), 'self');
  assert.equal(independence('offcut@offcut'), 'self');
  assert.equal(independence('offcut-root-measure@offcut-root-measure'), 'self');
  assert.equal(independence('ponytail@ponytail'), 'subject');
  assert.equal(independence('claude-plugins-official@superpowers'), 'independent');
  // A longer name that merely starts with the same letters is a third party.
  assert.equal(independence('offcutter@tool'), 'independent');
  assert.equal(independence('ponytailor@tool'), 'independent');

  const tmp = path.join(ROOT, 'tests', 'fixtures', 'independence');
  fs.mkdirSync(tmp, { recursive: true });
  // exported-unused needs a multi-module corpus to be decidable at all, so the
  // firing project carries a caller alongside the orphan.
  const lib = path.join(tmp, 'lib.js');
  const main = path.join(tmp, 'main.js');
  const quiet = path.join(tmp, 'quiet.js');
  const quiet2 = path.join(tmp, 'quiet2.js');
  fs.writeFileSync(
    lib,
    'export function used() { return 1 }\nexport function orphanHelper() { return 2 }\n',
  );
  fs.writeFileSync(main, 'import { used } from "./lib.js";\nused();\n');
  fs.writeFileSync(quiet, 'const x = 1;\nconsole.log(x);\n');
  fs.writeFileSync(quiet2, 'const y = 2;\nconsole.log(y);\n');
  try {
    const report = scanRealCode([
      { name: 'offcut-fixture', files: [lib, main] },
      { name: 'ponytail@fixture', files: [quiet] },
      { name: 'vendor@fixture', files: [quiet2] },
    ]);
    assert.equal(report.byGroup.self.eligible, 2);
    assert.equal(report.byGroup.subject.eligible, 1);
    assert.equal(report.byGroup.independent.eligible, 1);
    assert.equal(report.byGroup.self.fired, 1, 'the orphan export should fire');
    assert.equal(report.byGroup.subject.fired, 0);
    // The point of the exercise: the aggregate counts the fire, the independent
    // group does not, so the publishable rate stays 0 of 1.
    assert.equal(report.eligibleWithFindings, 1);
    assert.equal(report.byGroup.independent.fired, 0);
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

test('real-code self corpus excludes generated benchmark run artifacts', () => {
  const offcut = buildProjects(defaultProjectInputs()).find((project) => project.name === 'offcut');
  assert.ok(offcut);
  const normalized = offcut.files.map((file) => file.replace(/\\/g, '/'));
  assert.equal(normalized.some((file) => file.includes('/bench/runs/')), false);
  assert.equal(normalized.some((file) => file.includes('/bench/live-runs/')), false);
  assert.ok(normalized.some((file) => file.endsWith('/bench/realcode.mjs')));
});

test('real-code default corpus does not rescan cached Offcut copies', () => {
  const selfInputs = defaultProjectInputs().filter((input) => independence(input.name) === 'self');
  assert.deepEqual(selfInputs.map((input) => input.name), ['offcut']);
});

test('exported-unused is repo-only: a new export in a diff is not dead code', () => {
  // Measured 2026-08-25: in diff context this fired on 27.4% of ACCEPTED
  // solutions — a newly added export has no caller inside the diff, which is
  // true of every new public function. Same root cause as the write-time
  // 20/20 bug, one context over.
  const sig = ALL_SIGNALS.find((s) => s.id === 'exported-unused');
  assert.deepEqual(sig.contexts, ['repo'], 'exported-unused must not run on write or diff');

  const added = 'export function brandNew() { return 1 }\n';
  const mk = (ctx) => ({
    path: 'a.js', content: added, addedContent: added, shape: 'full',
    pathExists: false, truncated: false, context: ctx, corpus: added,
  });
  for (const ctx of ['write', 'diff']) {
    assert.equal(
      runSignals(ALL_SIGNALS, mk(ctx)).some((h) => h.id === 'exported-unused'),
      false,
      `exported-unused fired in ${ctx} context`,
    );
  }
});

test('concise style commands are documented without an efficacy claim', () => {
  const help = fs.readFileSync(path.join(ROOT, 'skills', 'offcut-help', 'SKILL.md'), 'utf8');
  const readme = fs.readFileSync(path.join(ROOT, 'README.md'), 'utf8');

  for (const text of [help, readme]) {
    assert.match(text, /\/offcut concise on/);
    assert.match(text, /\/offcut concise off/);
  }
  assert.match(help, /construction (?:mode|rules)\s+remain active/i);
  assert.match(readme, /concise.*default.*Offcut.*active/is);
  assert.doesNotMatch(readme, /saves? \d+%|token savings? (?:are )?proven/i);
});

test('style benchmark documents cache and completeness claim gates', () => {
  const benchmark = fs.readFileSync(
    path.join(ROOT, 'docs', 'development', 'STYLE-BENCHMARK.md'),
    'utf8',
  );

  assert.match(benchmark, /normal.*terse.*concise/is);
  assert.match(benchmark, /cold.*warm/is);
  assert.match(benchmark, /blind.*answer-completeness/is);
  assert.match(benchmark, /not.*comparable|not claimable/i);
  assert.match(benchmark, /Caveman/);
  assert.match(benchmark, /Ponytail/);
  assert.doesNotMatch(benchmark, /Offcut (?:beats|saves) \d+%/i);
});
