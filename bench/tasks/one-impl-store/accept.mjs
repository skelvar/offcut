#!/usr/bin/env node
// Acceptance for one-impl-store. Loads store.ts via Node type stripping.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'store.ts');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing store.ts');

const probe = `
import { createStore } from ${JSON.stringify(pathToFileURL(modPath).href)};
if (typeof createStore !== 'function') {
  console.error('createStore not exported');
  process.exit(1);
}
const s = createStore();
if (!s || typeof s.set !== 'function' || typeof s.get !== 'function') {
  console.error('createStore must return { set, get }');
  process.exit(1);
}
s.set('a', '1');
if (s.get('a') !== '1') {
  console.error('get after set failed');
  process.exit(1);
}
s.set('a', '2');
if (s.get('a') !== '2') {
  console.error('overwrite failed');
  process.exit(1);
}
if (s.get('missing') !== undefined) {
  console.error('missing key must be undefined');
  process.exit(1);
}
console.log('ACCEPT_OK');
`;

const r = spawnSync(process.execPath, ['--experimental-strip-types', '--input-type=module', '-e', probe], {
  encoding: 'utf8',
  cwd: root,
});
if (r.status !== 0) {
  fail((r.stderr || r.stdout || `exit ${r.status}`).trim());
}
console.log((r.stdout || '').trim() || 'ACCEPT_OK');
process.exit(0);
