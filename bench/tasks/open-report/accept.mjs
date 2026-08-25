#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'report.js');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing report.js');
const { report } = await import(pathToFileURL(modPath).href);
if (typeof report !== 'function') fail('report not exported');

const cases = [
  ['ok', '[report] ok'],
  ['deploy finished', '[report] deploy finished'],
  ['', '[report] '],
];

for (const [input, want] of cases) {
  const got = report(input);
  if (got !== want) {
    fail(`report(${JSON.stringify(input)}): got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

console.log('ACCEPT_OK');
