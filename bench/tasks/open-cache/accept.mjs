#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as sleep } from 'node:timers/promises';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'cache.js');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing cache.js');
const { createCache } = await import(pathToFileURL(modPath).href);
if (typeof createCache !== 'function') fail('createCache not exported');

const c = createCache();
if (!c || typeof c.set !== 'function' || typeof c.get !== 'function') {
  fail('createCache must return { set, get }');
}

c.set('a', 1, 200);
if (c.get('a') !== 1) fail('immediate get');

c.set('b', 2, 40);
await sleep(60);
if (c.get('b') !== undefined) fail('short ttl expired');
if (c.get('a') !== 1) fail('longer ttl still valid');

await sleep(160);
if (c.get('a') !== undefined) fail('longer ttl expired');

console.log('ACCEPT_OK');
