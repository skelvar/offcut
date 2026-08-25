#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const importPath = path.join(root, 'import.js');
const previewPath = path.join(root, 'preview.js');
if (!fs.existsSync(importPath) || !fs.existsSync(previewPath)) {
  fail('missing import.js or preview.js');
}

const { parseImport } = await import(pathToFileURL(importPath).href);
const { parsePreview } = await import(pathToFileURL(previewPath).href);
if (typeof parseImport !== 'function') fail('parseImport not exported');
if (typeof parsePreview !== 'function') fail('parsePreview not exported');

const good = { name: 'widget', qty: 3 };
const gi = parseImport(good);
const gp = parsePreview(good);
if (!gi || gi.name !== 'widget' || gi.qty !== 3) fail(`parseImport good: ${JSON.stringify(gi)}`);
if (!gp || gp.name !== 'widget' || gp.qty !== 3) fail(`parsePreview good: ${JSON.stringify(gp)}`);

const zero = parseImport({ name: 'x', qty: 0 });
if (zero.qty !== 0) fail('qty 0 must be allowed');

const bad = [
  null,
  undefined,
  {},
  { name: '', qty: 1 },
  { name: 'x', qty: -1 },
  { name: 'x', qty: NaN },
  { name: 'x', qty: Infinity },
  { name: 1, qty: 1 },
  { name: 'x' },
  { qty: 1 },
];

for (const row of bad) {
  let iThrew = false;
  let pThrew = false;
  try {
    parseImport(row);
  } catch (e) {
    iThrew = /invalid row/i.test(String(e.message || e));
  }
  try {
    parsePreview(row);
  } catch (e) {
    pThrew = /invalid row/i.test(String(e.message || e));
  }
  if (!iThrew || !pThrew) fail(`expected /invalid row/i for ${JSON.stringify(row)}`);
}

console.log('ACCEPT_OK');
