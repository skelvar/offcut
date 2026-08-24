import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { PRE_SIGNALS, POST_SIGNALS, ALL_SIGNALS, runSignals } from '../hooks/signals.js';
import { parseModeCommand } from '../hooks/prompt.js';
import {
  parseUnifiedDiff,
  scanDiff,
  scanFiles,
  collectFiles,
  formatFindings,
  runScanCli,
} from '../scripts/scan.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function view(partial) {
  return {
    path: null,
    content: '',
    addedContent: '',
    shape: 'full',
    pathExists: true,
    truncated: false,
    context: 'write',
    ...partial,
  };
}

function withTempDir(fn) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-p4-'));
  return Promise.resolve()
    .then(() => fn(dir))
    .finally(() => {
      fs.rmSync(dir, { recursive: true, force: true });
    });
}

function snapshotDir(dir) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!fs.existsSync(dir)) return map;
  const walk = (d, prefix = '') => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const rel = prefix ? `${prefix}/${ent.name}` : ent.name;
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) walk(full, rel);
      else map.set(rel.replace(/\\/g, '/'), fs.readFileSync(full, 'utf8'));
    }
  };
  walk(dir);
  return map;
}

function mapsEqual(a, b) {
  if (a.size !== b.size) return false;
  for (const [k, v] of a) {
    if (b.get(k) !== v) return false;
  }
  return true;
}

// --- contexts dimension ---

test('every signal declares contexts; runner filters on them', () => {
  for (const signal of ALL_SIGNALS) {
    assert.ok(Array.isArray(signal.contexts), `${signal.id} missing contexts`);
    assert.ok(signal.contexts.length > 0, `${signal.id} empty contexts`);
    for (const c of signal.contexts) {
      assert.ok(['write', 'diff', 'repo'].includes(c), `${signal.id} bad context ${c}`);
    }
  }
});

test('new-file and large-first-write cannot fire in a repo audit', () => {
  const newFile = PRE_SIGNALS.find((s) => s.id === 'new-file');
  const large = PRE_SIGNALS.find((s) => s.id === 'large-first-write');
  assert.ok(!newFile.contexts.includes('repo'));
  assert.ok(!large.contexts.includes('repo'));

  const big = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n');
  // Even if pathExists is wrongly false, context filter must suppress them.
  const hits = runSignals(PRE_SIGNALS, view({
    context: 'repo',
    pathExists: false,
    path: 'brand-new.js',
    content: big,
    addedContent: big,
    shape: 'full',
  }));
  assert.ok(!hits.find((h) => h.id === 'new-file'));
  assert.ok(!hits.find((h) => h.id === 'large-first-write'));
});

test('new-file still fires in write and diff contexts', () => {
  for (const context of ['write', 'diff']) {
    const hits = runSignals(PRE_SIGNALS, view({
      context,
      pathExists: false,
      path: 'x.js',
      shape: 'full',
      needsContent: false,
    }));
    assert.ok(hits.find((h) => h.id === 'new-file'), `missing new-file in ${context}`);
  }
});

test('exported-unused is stronger with a cross-file corpus', () => {
  const sig = POST_SIGNALS.find((s) => s.id === 'exported-unused');
  const file = 'export function orphan() { return 1 }\n';
  assert.equal(sig.check(view({ content: file, addedContent: file })), true);
  assert.equal(
    sig.check(view({
      content: file,
      addedContent: file,
      corpus: `${file}\norphan();\n`,
    })),
    false,
  );
  // Repo context still selects the signal.
  const hits = runSignals(POST_SIGNALS, view({
    context: 'repo',
    content: file,
    addedContent: file,
    corpus: file,
  }));
  assert.ok(hits.find((h) => h.id === 'exported-unused'));
});

// --- scan.mjs ---

test('parseUnifiedDiff: new file vs edit', () => {
  const diff = [
    'diff --git a/old.js b/old.js',
    '--- a/old.js',
    '+++ b/old.js',
    '@@ -1,1 +1,2 @@',
    ' keep',
    '+export function added() {}',
    'diff --git a/fresh.js b/fresh.js',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/fresh.js',
    '@@ -0,0 +1,2 @@',
    '+ console.log(1)',
    '+console.log(2)',
  ].join('\n');
  const files = parseUnifiedDiff(diff);
  assert.equal(files.length, 2);
  const edit = files.find((f) => f.path === 'old.js');
  const created = files.find((f) => f.path === 'fresh.js');
  assert.equal(edit.pathExists, true);
  assert.equal(edit.shape, 'fragment');
  assert.match(edit.addedContent, /export function added/);
  assert.equal(created.pathExists, false);
  assert.equal(created.shape, 'full');
});

test('scanDiff: fires new-file on added path; scanFiles never does', () => {
  return withTempDir((dir) => {
    const filePath = path.join(dir, 'solo.js');
    fs.writeFileSync(filePath, 'export function alone() { return 1 }\n');

    const diff = [
      'diff --git a/solo.js b/solo.js',
      'new file mode 100644',
      '--- /dev/null',
      '+++ b/solo.js',
      '@@ -0,0 +1,1 @@',
      '+export function alone() { return 1 }',
    ].join('\n');

    const diffHits = scanDiff(diff);
    assert.ok(diffHits.find((f) => f.signalId === 'new-file'));

    const repoHits = scanFiles([filePath], { cwd: dir });
    assert.ok(!repoHits.find((f) => f.signalId === 'new-file'));
    assert.ok(!repoHits.find((f) => f.signalId === 'large-first-write'));
    assert.ok(repoHits.find((f) => f.signalId === 'exported-unused'));
  });
});

test('scanFiles: exported-unused silent when another file calls it', () => {
  return withTempDir((dir) => {
    fs.writeFileSync(path.join(dir, 'a.js'), 'export function shared() { return 1 }\n');
    fs.writeFileSync(path.join(dir, 'b.js'), 'import { shared } from "./a.js";\nshared();\n');
    const hits = scanFiles(collectFiles([dir]), { cwd: dir });
    assert.ok(!hits.find((f) => f.signalId === 'exported-unused' && f.path.endsWith('a.js')));
  });
});

test('command run leaves state directory byte-identical', () => {
  return withTempDir(async (dir) => {
    const state = path.join(dir, 'state');
    fs.mkdirSync(state);
    fs.writeFileSync(path.join(state, 'active'), 'full\n');
    fs.writeFileSync(path.join(state, 'default'), 'full\n');
    fs.writeFileSync(path.join(state, 'fired-sess'), JSON.stringify(['new-file']));
    const before = snapshotDir(state);

    process.env.OFFCUT_STATE_DIR = state;
    try {
      const src = path.join(dir, 'src');
      fs.mkdirSync(src);
      fs.writeFileSync(path.join(src, 'x.js'), 'export const x = 1\n');

      const cli = runScanCli([src], { cwd: dir });
      assert.equal(cli.code, 0);
      assert.ok(cli.findings.length >= 1);

      const diffCli = runScanCli(
        ['--diff', '-'],
        {
          cwd: dir,
          stdin: [
            'diff --git a/x.js b/x.js',
            '--- a/x.js',
            '+++ b/x.js',
            '@@ -1 +1,2 @@',
            ' export const x = 1',
            '+export function wrap() { return x }',
          ].join('\n'),
        },
      );
      assert.equal(diffCli.code, 0);

      const after = snapshotDir(state);
      assert.ok(mapsEqual(before, after), 'state dir changed during scan');
    } finally {
      delete process.env.OFFCUT_STATE_DIR;
    }
  });
});

test('scan.mjs CLI: subprocess also leaves state untouched', () => {
  return withTempDir((dir) => {
    const state = path.join(dir, 'state');
    fs.mkdirSync(state);
    fs.writeFileSync(path.join(state, 'active'), 'lite\n');
    const before = snapshotDir(state);
    const fixture = path.join(dir, 'f.js');
    fs.writeFileSync(fixture, 'export function z(){}\n');

    return new Promise((resolve, reject) => {
      const child = spawn(
        process.execPath,
        [path.join(root, 'scripts', 'scan.mjs'), fixture],
        {
          cwd: dir,
          env: { ...process.env, OFFCUT_STATE_DIR: state },
          stdio: ['ignore', 'pipe', 'pipe'],
        },
      );
      let stdout = '';
      child.stdout.on('data', (d) => {
        stdout += d;
      });
      child.on('error', reject);
      child.on('close', (code) => {
        try {
          assert.equal(code, 0);
          assert.match(stdout, /exported-unused|No Offcut findings|f\.js/);
          assert.ok(mapsEqual(before, snapshotDir(state)));
          resolve();
        } catch (err) {
          reject(err);
        }
      });
    });
  });
});

test('formatFindings: empty and non-empty', () => {
  assert.equal(formatFindings([]), 'No Offcut findings.\n');
  const text = formatFindings([
    {
      path: 'a.js',
      signalId: 'exported-unused',
      message: 'Offcut: exported symbol with no caller — did anyone ask for it?',
      phase: 'post',
    },
  ]);
  assert.match(text, /a\.js \(1\)/);
  assert.match(text, /\[exported-unused\]/);
});

// --- UserPromptSubmit must not learn commands ---

test('UserPromptSubmit parseModeCommand: no review/audit handling', () => {
  // Skill slash names are /offcut-review etc. The hook must not learn them —
  // it only skips the reminder for `/offcut …` (space) invocations / typos.
  // Hyphenated skill names are not mode commands and must not be parsed.
  assert.equal(parseModeCommand('/offcut-review'), null);
  assert.equal(parseModeCommand('/offcut-audit'), null);
  assert.equal(parseModeCommand('/offcut-help'), null);
  // Spaced form is still a non-mode /offcut invocation → skip reminder only.
  assert.deepEqual(parseModeCommand('/offcut review'), { type: 'command', message: null });
  assert.deepEqual(parseModeCommand('/offcut audit'), { type: 'command', message: null });
  assert.equal(parseModeCommand('/offcut full').type, 'set');
  assert.equal(parseModeCommand('audit this repo for bloat'), null);
  assert.equal(parseModeCommand('explain this function'), null);
});

// --- skills frontmatter / shape ---

test('command skills: name matches directory, description bounds, body bounds', () => {
  for (const name of ['offcut-review', 'offcut-audit', 'offcut-help']) {
    // Normalize line endings: git stores LF but checks out CRLF on Windows, so
    // asserting on raw bytes makes this test pass on the branch and fail after
    // merge. The shipped parser in rules.js is already CRLF-tolerant.
    const raw = fs
      .readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8')
      .replace(/\r\n/g, '\n');
    assert.ok(raw.startsWith('---\n'));
    const end = raw.indexOf('\n---', 3);
    assert.ok(end > 0);
    const fm = raw.slice(4, end);
    const body = raw.slice(end + 4);
    assert.match(fm, new RegExp(`^name:\\s*${name}\\s*$`, 'm'));
    const desc = fm.match(/description:\s*>\n([\s\S]*?)(?=\n[a-z]+:|\n---)/);
    assert.ok(desc, `${name} description`);
    const descText = desc[1].replace(/^\s+/gm, '').trim();
    assert.ok(descText.length > 0 && descText.length <= 1024, `${name} desc length ${descText.length}`);
    assert.ok(body.trim().split(/\n/).length < 500, `${name} body too long`);
    // Negative triggers present.
    assert.match(descText, /Do not use/i);
  }
});

test('one copy of signal definitions: skills point at scan/signals, do not redefine ids', () => {
  const ids = ALL_SIGNALS.map((s) => s.id);
  for (const name of ['offcut-review', 'offcut-audit']) {
    const body = fs.readFileSync(path.join(root, 'skills', name, 'SKILL.md'), 'utf8');
    assert.match(body, /scripts\/scan\.mjs/);
    assert.match(body, /hooks\/signals\.js|signals\.js/);
    for (const id of ids) {
      // Mentions of specific signal behavior are ok for new-file notes; forbid
      // embedding a second check table of all ids as a reimplementation.
      assert.equal(
        (body.match(new RegExp(`^\\|\\s*${id}\\s*\\|`, 'm')) || []).length,
        0,
        `${name} must not table-redefine ${id}`,
      );
    }
  }
});

// --- evals: command activation corpus ---

test('evals: command activation cases cover positive and negative', () => {
  const lines = fs
    .readFileSync(path.join(root, 'evals', 'prompts.jsonl'), 'utf8')
    .trim()
    .split(/\n/)
    .map((l) => JSON.parse(l.replace(/^\uFEFF/, '')));

  const cmds = lines.filter((x) => String(x.expect).startsWith('skill:'));
  assert.ok(cmds.length >= 8, `need command-activation rows, got ${cmds.length}`);

  const byExpect = (e) => cmds.filter((x) => x.expect === e);
  assert.ok(byExpect('skill:offcut-review').length >= 2);
  assert.ok(byExpect('skill:offcut-audit').length >= 2);
  assert.ok(byExpect('skill:offcut-help').length >= 1);
  assert.ok(byExpect('skill:none').length >= 3);

  // Negatives must look like the failure mode called out in the task.
  const none = byExpect('skill:none');
  assert.ok(none.some((r) => /explain this function/i.test(r.prompt)));
});

test('scan: a nonexistent path errors instead of reporting clean', () => {
  // An audit that scans nothing prints "No Offcut findings", which reads as
  // "your repo is clean". Silent-clean is the worst failure for a tool whose
  // output is the product. Found by adversarial pass.
  const r = runScanCli(['./definitely-not-here-xyz']);
  assert.equal(r.code, 2, 'a missing path must not exit 0');
  assert.match(r.stderr, /no such file or directory/);
  assert.equal(r.findings.length, 0);
  assert.equal(r.stdout, '', 'must not print a findings summary for a failed scan');
});

test('scan: collectFiles reports unreadable inputs', () => {
  const missing = [];
  const files = collectFiles(['./definitely-not-here-xyz'], missing);
  assert.deepEqual(files, []);
  assert.equal(missing.length, 1);
});

test('scan: --help exits 0 and does not scan', () => {
  const r = runScanCli(['--help']);
  assert.equal(r.code, 0);
  assert.match(r.stdout, /usage:/);
  assert.equal(r.findings.length, 0);
});
