#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const claimPath = path.join(root, 'claim.js');
const lookupPath = path.join(root, 'lookup.js');
if (!fs.existsSync(claimPath) || !fs.existsSync(lookupPath)) {
  fail('missing claim.js or lookup.js');
}

const { claim } = await import(pathToFileURL(claimPath).href);
const { isClaimed } = await import(pathToFileURL(lookupPath).href);
if (typeof claim !== 'function') fail('claim not exported');
if (typeof isClaimed !== 'function') fail('isClaimed not exported');

if (isClaimed('a') !== false) fail('unclaimed id should be false');

const r = claim('a');
if (!r?.ok || r.id !== 'a') fail(`claim return: ${JSON.stringify(r)}`);
if (isClaimed('a') !== true) fail('claimed id should be true via isClaimed');

let threw = false;
try {
  claim('a');
} catch (e) {
  threw = /already claimed/i.test(String(e.message || e));
}
if (!threw) fail('second claim must throw /already claimed/i');

const r2 = claim('b');
if (!r2?.ok || r2.id !== 'b') fail(`claim b: ${JSON.stringify(r2)}`);
if (isClaimed('b') !== true) fail('b should be claimed');
if (isClaimed('c') !== false) fail('c still unclaimed');

console.log('ACCEPT_OK');
