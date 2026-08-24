#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'greet.js');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing greet.js');

const { formatGreeting } = await import(pathToFileURL(modPath).href);
if (typeof formatGreeting !== 'function') fail('formatGreeting not exported');

if (formatGreeting('Ada') !== 'Hello, Ada') fail(`plain: ${JSON.stringify(formatGreeting('Ada'))}`);
if (formatGreeting('Ada', {}) !== 'Hello, Ada') fail(`empty opts: ${JSON.stringify(formatGreeting('Ada', {}))}`);
if (formatGreeting('Ada', { excited: false }) !== 'Hello, Ada') {
  fail(`excited false: ${JSON.stringify(formatGreeting('Ada', { excited: false }))}`);
}
if (formatGreeting('Ada', { excited: true }) !== 'Hello, Ada!') {
  fail(`excited true: ${JSON.stringify(formatGreeting('Ada', { excited: true }))}`);
}

console.log('ACCEPT_OK');
process.exit(0);
