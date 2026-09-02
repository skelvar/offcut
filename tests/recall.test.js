import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { measureRecall } from '../bench/recall.mjs';

test('measureRecall counts hits per label and per signal', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-recall-'));
  const diffs = path.join(dir, 'diffs');
  fs.mkdirSync(diffs);
  const overbuilt = [
    'diff --git a/package.json b/package.json',
    '--- a/package.json',
    '+++ b/package.json',
    '@@ -1,3 +1,4 @@',
    ' {',
    '+  "dependencies": { "left-pad": "^1.0.0" },',
    '   "name": "x"',
    ' }',
    '',
  ].join('\n');
  const clean = [
    'diff --git a/a.js b/a.js',
    '--- a/a.js',
    '+++ b/a.js',
    '@@ -1,1 +1,2 @@',
    ' export const a = 1;',
    '+export const b = 2;',
    '',
  ].join('\n');
  fs.writeFileSync(path.join(diffs, '01.diff'), overbuilt);
  fs.writeFileSync(path.join(diffs, '02.diff'), clean);
  const manifest = path.join(dir, 'manifest.jsonl');
  fs.writeFileSync(
    manifest,
    [
      JSON.stringify({ id: '01', url: 'u1', label: 'overbuilt', reason: 'dep for stdlib task' }),
      JSON.stringify({ id: '02', url: 'u2', label: 'clean', reason: 'one export' }),
    ].join('\n') + '\n',
  );
  const r = measureRecall(manifest, diffs);
  assert.equal(r.overbuilt, 1);
  assert.equal(r.clean, 1);
  assert.equal(r.hitsOverbuilt, 1);
  assert.equal(r.hitsClean, 0);
  assert.equal(r.recall, 1);
  assert.equal(r.fp, 0);
  assert.ok(r.perSignal['new-dependency'] >= 1);
  assert.deepEqual(r.rows.map((x) => x.id), ['01', '02']);
  fs.rmSync(dir, { recursive: true, force: true });
});
