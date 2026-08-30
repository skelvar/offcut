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

test('dependency scoring distinguishes a new package from metadata and version changes', async () => {
  const { detectSignalsInDiff } = await import('../bench/score.mjs');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-dep-score-'));
  try {
    const manifest = path.join(parent, 'package.json');
    const cases = [
      {
        name: 'new package',
        content: {
          name: 'demo',
          dependencies: { react: '19.0.0', 'left-pad': '1.0.0' },
        },
        diff: [
          'diff --git a/package.json b/package.json',
          '--- a/package.json',
          '+++ b/package.json',
          '@@ -3,5 +3,6 @@',
          '   "dependencies": {',
          '+    "left-pad": "1.0.0",',
          '     "react": "19.0.0"',
          '   }',
        ].join('\n'),
        expected: true,
      },
      {
        name: 'version change',
        content: { name: 'demo', dependencies: { react: '19.1.0' } },
        diff: [
          'diff --git a/package.json b/package.json',
          '--- a/package.json',
          '+++ b/package.json',
          '@@ -3,5 +3,5 @@',
          '   "dependencies": {',
          '-    "react": "19.0.0"',
          '+    "react": "19.1.0"',
          '   }',
        ].join('\n'),
        expected: false,
      },
      {
        name: 'metadata addition',
        content: {
          name: 'demo',
          homepage: 'https://example.test',
          dependencies: { react: '19.0.0' },
        },
        diff: [
          'diff --git a/package.json b/package.json',
          '--- a/package.json',
          '+++ b/package.json',
          '@@ -1,4 +1,5 @@',
          ' {',
          '   "name": "demo",',
          '+  "homepage": "https://example.test",',
          '   "dependencies": {',
        ].join('\n'),
        expected: false,
      },
    ];

    for (const item of cases) {
      fs.writeFileSync(manifest, JSON.stringify(item.content, null, 2) + '\n');
      const found = detectSignalsInDiff(item.diff, parent).includes('new-dependency');
      assert.equal(found, item.expected, item.name);
    }
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});

test('runOne honors a caller-owned run root', async () => {
  const { runOne } = await import('../bench/run.mjs');
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-run-root-'));
  const runRoot = path.join(parent, 'live-runs');
  let result;
  try {
    result = runOne({
      task: 'config-fallback',
      arm: 'off',
      rep: 1,
      stub: 'lean',
      model: 'stub',
      runRoot,
      manifestPath: path.join(parent, 'manifest.jsonl'),
      style: 'normal',
      styleArm: 'normal',
    });
    assert.equal(path.dirname(result.runDir), runRoot);
    assert.equal(fs.existsSync(result.runDir), true);
    assert.equal(result.record.offcut_style, 'normal');
    assert.equal(result.record.style_arm, 'normal');
    const stateAfter = JSON.parse(
      fs.readFileSync(path.join(result.runDir, 'state-after.json'), 'utf8'),
    );
    assert.equal(stateAfter.style.trim(), 'normal');
  } finally {
    if (result?.runDir && path.dirname(result.runDir) !== runRoot) {
      fs.rmSync(result.runDir, { recursive: true, force: true });
    }
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

test('justify schedule is three arms, five reps, tier A+B tasks', async () => {
  const {
    JUSTIFY_ARMS,
    JUSTIFY_REPS,
    JUSTIFY_TASK_IDS,
    JUSTIFY_TIER_A_TASK_IDS,
    JUSTIFY_TIER_B_TASK_IDS,
    justifyArmConfig,
    interleaveSchedule,
  } = await import('../bench/lib.mjs');
  assert.deepEqual(JUSTIFY_ARMS, ['off', 'cheap', 'justify']);
  assert.equal(JUSTIFY_REPS, 5);
  assert.equal(JUSTIFY_TIER_A_TASK_IDS.length, 1);
  assert.equal(JUSTIFY_TIER_B_TASK_IDS.length, 5);
  assert.equal(JUSTIFY_TASK_IDS.length, 6);
  const jobs = interleaveSchedule(JUSTIFY_TASK_IDS, JUSTIFY_REPS, JUSTIFY_ARMS);
  assert.equal(jobs.length, 90);
  assert.equal(justifyArmConfig('off').mode, 'off');
  assert.equal(justifyArmConfig('cheap').mode, 'full');
  assert.equal(justifyArmConfig('cheap').rulesetPath, null);
  assert.equal(justifyArmConfig('justify').mode, 'full');
  assert.match(justifyArmConfig('justify').rulesetPath, /offcut-justify/);
});

test('OFFCUT_RULESET_PATH loads justify variant; reminder override works', async () => {
  const path = await import('node:path');
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  // Ask the bench for the variant's location instead of rebuilding the path, so
  // moving it cannot leave this test asserting against a stale copy.
  const { justifyArmConfig } = await import('../bench/lib.mjs');
  const justifySkill = justifyArmConfig('justify').rulesetPath;
  const prevPath = process.env.OFFCUT_RULESET_PATH;
  const prevRem = process.env.OFFCUT_REMINDER;
  try {
    process.env.OFFCUT_RULESET_PATH = justifySkill;
    process.env.OFFCUT_REMINDER = 'JUSTIFY_REMINDER_PROBE';
    const { loadRuleset, reminderText, stripFrontmatter } = await import('../hooks/rules.js');
    const { text, source } = loadRuleset(root);
    assert.equal(source, 'env');
    assert.match(text, /Is this change justified/);
    assert.doesNotMatch(text, /What is the cheapest thing that actually works — and where does it belong\?/);
    assert.equal(reminderText(), 'JUSTIFY_REMINDER_PROBE');
    const cheap = stripFrontmatter(
      await import('node:fs').then((fs) => fs.readFileSync(path.join(root, 'skills', 'offcut', 'SKILL.md'), 'utf8')),
    );
    const just = stripFrontmatter(
      await import('node:fs').then((fs) => fs.readFileSync(justifySkill, 'utf8')),
    );
    assert.match(cheap, /## Response style/);
    assert.doesNotMatch(
      just,
      /## Response style/,
      'the frozen Phase 10 framing ruleset must not be rewritten with later product behavior',
    );
  } finally {
    if (prevPath === undefined) delete process.env.OFFCUT_RULESET_PATH;
    else process.env.OFFCUT_RULESET_PATH = prevPath;
    if (prevRem === undefined) delete process.env.OFFCUT_REMINDER;
    else process.env.OFFCUT_REMINDER = prevRem;
  }
});

test('stub lean solutions pass accept for every task', async () => {
  const { listTaskIds, PREMISE_TASK_IDS, JUSTIFY_TASK_IDS } = await import('../bench/lib.mjs');
  const tasks = [...new Set([...listTaskIds(), ...PREMISE_TASK_IDS, ...JUSTIFY_TASK_IDS])];
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
  const { listTaskIds, PREMISE_TASK_IDS, JUSTIFY_TASK_IDS } = await import('../bench/lib.mjs');
  const tasks = [...new Set([...listTaskIds(), ...PREMISE_TASK_IDS, ...JUSTIFY_TASK_IDS])];
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
