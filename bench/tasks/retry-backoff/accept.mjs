#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'retry.js');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing retry.js');
const { retry } = await import(pathToFileURL(modPath).href);
if (typeof retry !== 'function') fail('retry not exported');

let calls = 0;
const ok = await retry(
  async () => {
    calls += 1;
    if (calls < 3) throw new Error('flaky');
    return 'done';
  },
  { retries: 5, delayMs: 1 },
);
if (ok !== 'done' || calls !== 3) fail(`success path: ok=${ok} calls=${calls}`);

let failed = false;
try {
  await retry(
    async () => {
      throw new Error('always');
    },
    { retries: 2, delayMs: 1 },
  );
} catch (e) {
  failed = String(e.message) === 'always';
}
if (!failed) fail('should rethrow last error');

const sync = await retry(() => 42, { retries: 1, delayMs: 1 });
if (sync !== 42) fail(`sync fn: ${sync}`);

console.log('ACCEPT_OK');
