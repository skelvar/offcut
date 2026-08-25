#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'store.js');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing store.js');
const { createStore } = await import(pathToFileURL(modPath).href);
if (typeof createStore !== 'function') fail('createStore not exported');

const s = createStore();
if (!s || typeof s.set !== 'function' || typeof s.get !== 'function') {
  fail('createStore must return { set, get }');
}

s.set('a', '1');
if (s.get('a') !== '1') fail('get after set failed');
s.set('a', '2');
if (s.get('a') !== '2') fail('overwrite failed');
if (s.get('missing') !== undefined) fail('missing key must be undefined');

const t = createStore();
t.set('a', 'other');
if (s.get('a') !== '2') fail('instances must not share state');
if (t.get('a') !== 'other') fail('second instance get failed');

console.log('ACCEPT_OK');
