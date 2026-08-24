#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'id.js');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing id.js');

const { generateId } = await import(pathToFileURL(modPath).href);
if (typeof generateId !== 'function') fail('generateId not exported');

const a = generateId();
const b = generateId();
if (typeof a !== 'string' || typeof b !== 'string') fail('generateId must return a string');
if (!/^[0-9a-f]{32}$/.test(a)) fail(`expected 32 lowercase hex chars, got ${JSON.stringify(a)}`);
if (!/^[0-9a-f]{32}$/.test(b)) fail(`expected 32 lowercase hex chars, got ${JSON.stringify(b)}`);
if (a === b) fail('two calls returned the same id (expected randomBytes entropy)');

console.log('ACCEPT_OK');
process.exit(0);
