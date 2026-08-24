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
import {
  measure,
  scanWriteSim,
  listNegativeRuns,
} from '../bench/fp.mjs';

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

// --- regressions that fail against the unfixed Phase 5 detectors ---

test('new-file is deleted', () => {
  assert.equal(
    ALL_SIGNALS.find((s) => s.id === 'new-file'),
    undefined,
  );
});

test('speculative-abstraction does not fire on createCache + new Map', () => {
  const sig = PRE_SIGNALS.find((s) => s.id === 'speculative-abstraction');
  const ttl = `
export function createCache({ defaultTtlMs = 1000 } = {}) {
  const store = new Map();
  function isExpired(entry) {
    return entry.expiresAt <= Date.now();
  }
  return {
    set(key, value, ttlMs = defaultTtlMs) {
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
    },
    get(key) {
      const entry = store.get(key);
      if (!entry) return undefined;
      if (isExpired(entry)) {
        store.delete(key);
        return undefined;
      }
      return entry.value;
    },
  };
}
`;
  assert.equal(sig.check(view({ content: ttl, addedContent: ttl })), false);
});

test('exported-unused silent on write; silent without multi-module corpus', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'exported-unused');
  assert.ok(!sig.contexts.includes('write'));
  const file = 'export function isValidEmail(email) { return true }\n';
  assert.equal(sig.check(view({ content: file, context: 'write' })), false);
  // Lone module — public API, not dead.
  assert.equal(
    sig.check(view({ content: file, context: 'repo', corpus: file })),
    false,
  );
});

test('exported-unused fires when a sibling imports something else', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'exported-unused');
  const file =
    'export function used() { return 1 }\nexport function orphanHelper() { return 2 }\n';
  const corpus = `${file}\nimport { used } from "./lib.js";\nused();\n`;
  assert.equal(
    sig.check(view({ content: file, context: 'repo', corpus })),
    true,
  );
});

test('new-config-surface does not fire on process.env alone', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'new-config-surface');
  assert.equal(
    sig.check(
      view({
        addedContent:
          'if (process.env.APP_PORT !== undefined) envConfig.port = Number(process.env.APP_PORT);\n',
      }),
    ),
    false,
  );
});

test('unused-default-param silent when defaulted name is read in the body', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'unused-default-param');
  const retry = `
export async function retry(fn, { retries = 3, delayMs = 10 } = {}) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (attempt > retries) throw err;
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt));
    }
  }
}
`;
  assert.equal(sig.check(view({ content: retry })), false);
});

// --- corpus metrics ---

test('negative corpus: every surviving signal at 0 write-time FP', () => {
  const report = measure();
  assert.ok(report.runs >= 40, `expected >=40 runs, got ${report.runs}`);
  for (const s of report.write) {
    assert.equal(
      s.runsFired,
      0,
      `${s.signalId} still fires on ${s.runsFired}/${s.runs} negative runs`,
    );
  }
});

test('positive corpus: every surviving signal fires', () => {
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

test('shared-validate diff no longer trips new-file or exported-unused at write', () => {
  const runs = listNegativeRuns().filter((r) => r.task === 'shared-validate');
  assert.ok(runs.length >= 1);
  const diff = fs.readFileSync(path.join(runs[0].dir, 'diff.patch'), 'utf8');
  const counts = scanWriteSim(diff);
  assert.equal(counts.get('new-file') || 0, 0);
  assert.equal(counts.get('exported-unused') || 0, 0);
});

test('ttl-cache diff no longer trips speculative-abstraction at write', () => {
  const runs = listNegativeRuns().filter((r) => r.task === 'ttl-cache');
  assert.ok(runs.length >= 1);
  const diff = fs.readFileSync(path.join(runs[0].dir, 'diff.patch'), 'utf8');
  const counts = scanWriteSim(diff);
  assert.equal(counts.get('speculative-abstraction') || 0, 0);
  assert.equal(counts.get('unused-default-param') || 0, 0);
});
