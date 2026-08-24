import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('interleaveSchedule alternates arms across reps', async () => {
  const { interleaveSchedule } = await import('../bench/lib.mjs');
  const jobs = interleaveSchedule(['a', 'b'], 2, ['off', 'full']);
  assert.equal(jobs.length, 8);
  // rep 1: off then full per task
  assert.deepEqual(
    jobs.filter((j) => j.rep === 1).map((j) => j.arm),
    ['off', 'full', 'off', 'full'],
  );
  // rep 2: reversed
  assert.deepEqual(
    jobs.filter((j) => j.rep === 2).map((j) => j.arm),
    ['full', 'off', 'full', 'off'],
  );
});

test('scoreDiff counts new files and does not require arm', async () => {
  const { scoreDiff } = await import('../bench/score.mjs');
  const diff = `diff --git a/x.js b/x.js
new file mode 100644
--- /dev/null
+++ b/x.js
@@ -0,0 +1,3 @@
+export function foo() {}
+export function unusedOnly() {}
+console.log(foo());
`;
  const m = scoreDiff(diff, null);
  assert.equal(m.files_created, 1);
  assert.ok(m.lines_added >= 3);
  assert.equal('arm' in m, false);
});

test('stub lean solutions pass accept for every task', () => {
  const tasks = ['config-fallback', 'retry-backoff', 'ttl-cache', 'shared-validate'];
  for (const id of tasks) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `p5-${id}-`));
    const repo = path.join(ROOT, 'bench', 'tasks', id, 'repo');
    // copy
    const copy = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, ent.name);
        const d = path.join(dest, ent.name);
        if (ent.isDirectory()) copy(s, d);
        else fs.copyFileSync(s, d);
      }
    };
    copy(repo, tmp);
    const stub = spawnSync(
      process.execPath,
      [
        path.join(ROOT, 'bench', 'stub-agent.mjs'),
        '--task',
        id,
        '--style',
        'lean',
        '--cwd',
        tmp,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(stub.status, 0, stub.stderr || stub.stdout);
    const accept = spawnSync(
      process.execPath,
      [path.join(ROOT, 'bench', 'tasks', id, 'accept.mjs'), tmp],
      { encoding: 'utf8', cwd: tmp },
    );
    assert.equal(accept.status, 0, `${id}: ${accept.stderr || accept.stdout}`);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('stub elaborate solutions also pass accept', () => {
  const tasks = ['config-fallback', 'retry-backoff', 'ttl-cache', 'shared-validate'];
  for (const id of tasks) {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `p5e-${id}-`));
    const repo = path.join(ROOT, 'bench', 'tasks', id, 'repo');
    const copy = (src, dest) => {
      fs.mkdirSync(dest, { recursive: true });
      for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, ent.name);
        const d = path.join(dest, ent.name);
        if (ent.isDirectory()) copy(s, d);
        else fs.copyFileSync(s, d);
      }
    };
    copy(repo, tmp);
    const stub = spawnSync(
      process.execPath,
      [
        path.join(ROOT, 'bench', 'stub-agent.mjs'),
        '--task',
        id,
        '--style',
        'elaborate',
        '--cwd',
        tmp,
      ],
      { encoding: 'utf8' },
    );
    assert.equal(stub.status, 0, stub.stderr || stub.stdout);
    const accept = spawnSync(
      process.execPath,
      [path.join(ROOT, 'bench', 'tasks', id, 'accept.mjs'), tmp],
      { encoding: 'utf8', cwd: tmp },
    );
    assert.equal(accept.status, 0, `${id}: ${accept.stderr || accept.stdout}`);
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
