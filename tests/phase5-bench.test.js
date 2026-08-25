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
  const { scoreDiff, extractFiredSignals, normalizeSignalId } = await import(
    '../bench/score.mjs'
  );
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
  assert.ok(Array.isArray(m.signals_in_diff));
  assert.deepEqual(extractFiredSignals({
    'fired-abc': '["post:unused-default-param","speculative-abstraction"]\n',
  }), ['speculative-abstraction', 'unused-default-param']);
  assert.equal(normalizeSignalId('post:exported-unused'), 'exported-unused');
});

test('invite elaborate stubs put target signals in the diff; control leans stay quiet', async () => {
  const { listTaskIds, INVITE_TASK_IDS, CONTROL_TASK_IDS } = await import('../bench/lib.mjs');
  const { detectSignalsInDiff } = await import('../bench/score.mjs');
  const { captureDiff, copyTree, initGitRepo, loadTask, tmpName } = await import(
    '../bench/lib.mjs'
  );

  // id-hex invited single-call-wrapper; that signal was deleted after Phase 7.5
  // paid runs showed it firing on the accepted lean solution.
  const expected = {
    'one-impl-store': 'speculative-abstraction',
    'slug-ascii': 'new-dependency',
    'greet-opts': 'unused-default-param',
  };

  for (const [id, signalId] of Object.entries(expected)) {
    const task = loadTask(id);
    const parent = tmpName(`p75-inv-${id}-`);
    const work = path.join(parent, 'repo');
    copyTree(task.repoDir, work);
    initGitRepo(work);
    const stub = spawnSync(
      process.execPath,
      [path.join(ROOT, 'bench', 'stub-agent.mjs'), '--task', id, '--style', 'elaborate', '--cwd', work],
      { encoding: 'utf8' },
    );
    assert.equal(stub.status, 0, stub.stderr || stub.stdout);
    const diff = captureDiff(work);
    const hits = detectSignalsInDiff(diff, work);
    assert.ok(
      hits.includes(signalId),
      `${id} elaborate should include ${signalId}, got ${hits.join(',')}`,
    );
    fs.rmSync(parent, { recursive: true, force: true });
  }

  // Discrimination target: invite signals the new fixtures are built to tempt.
  // exported-unused can still fire on a lone ESM module that imports node:* —
  // that is a known corpus soft spot, not what these controls are for.
  const inviteSignals = new Set(Object.values(expected));
  for (const id of CONTROL_TASK_IDS) {
    if (!listTaskIds().includes(id)) continue;
    const task = loadTask(id);
    const parent = tmpName(`p75-ctl-${id}-`);
    const work = path.join(parent, 'repo');
    copyTree(task.repoDir, work);
    initGitRepo(work);
    const stub = spawnSync(
      process.execPath,
      [path.join(ROOT, 'bench', 'stub-agent.mjs'), '--task', id, '--style', 'lean', '--cwd', work],
      { encoding: 'utf8' },
    );
    assert.equal(stub.status, 0, stub.stderr || stub.stdout);
    const diff = captureDiff(work);
    const hits = detectSignalsInDiff(diff, work);
    const leaked = hits.filter((h) => inviteSignals.has(h));
    assert.deepEqual(
      leaked,
      [],
      `${id} lean control should be silent on invite signals, got ${hits.join(',')}`,
    );
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('premise schedule is one arm, three reps, four tasks', async () => {
  const {
    PREMISE_ARMS,
    PREMISE_REPS,
    PREMISE_TASK_IDS,
    interleaveSchedule,
  } = await import('../bench/lib.mjs');
  assert.deepEqual(PREMISE_ARMS, ['off']);
  assert.equal(PREMISE_REPS, 3);
  assert.equal(PREMISE_TASK_IDS.length, 4);
  const jobs = interleaveSchedule(PREMISE_TASK_IDS, PREMISE_REPS, PREMISE_ARMS);
  assert.equal(jobs.length, 12);
  assert.ok(jobs.every((j) => j.arm === 'off'));
});

test('stub lean solutions pass accept for every task', async () => {
  const { listTaskIds, PREMISE_TASK_IDS } = await import('../bench/lib.mjs');
  const tasks = [...listTaskIds(), ...PREMISE_TASK_IDS];
  assert.ok(listTaskIds().length >= 6, `expected extended fixture set, got ${listTaskIds().length}`);
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

test('stub elaborate solutions also pass accept', async () => {
  const { listTaskIds, PREMISE_TASK_IDS } = await import('../bench/lib.mjs');
  const tasks = [...listTaskIds(), ...PREMISE_TASK_IDS];
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
