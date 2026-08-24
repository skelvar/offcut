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

const c = createCache({ defaultTtlMs: 200 });
c.set('a', 1);
if (c.get('a') !== 1 || !c.has('a')) fail('immediate get/has');

c.set('b', 2, 40);
await sleep(60);
if (c.get('b') !== undefined || c.has('b')) fail('per-key ttl expired');
if (c.get('a') !== 1) fail('default ttl still valid');

await sleep(160);
if (c.get('a') !== undefined) fail('default ttl expired');

c.set('c', 3);
c.delete('c');
if (c.get('c') !== undefined || c.has('c')) fail('delete');

console.log('ACCEPT_OK');
