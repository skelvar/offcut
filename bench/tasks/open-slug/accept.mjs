#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'slug.js');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing slug.js');

const { slugify } = await import(pathToFileURL(modPath).href);
if (typeof slugify !== 'function') fail('slugify not exported');

const cases = [
  ['Hello World', 'hello-world'],
  ['  Already---Slugby  ', 'already-slugby'],
  ['Foo@Bar#Baz', 'foobarbaz'],
  ['a  b   c', 'a-b-c'],
  ['---', ''],
];

for (const [input, want] of cases) {
  const got = slugify(input);
  if (got !== want) {
    fail(`slugify(${JSON.stringify(input)}): got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
  }
}

let threw = false;
try {
  slugify(null);
} catch (e) {
  threw = e instanceof TypeError;
}
if (!threw) fail('slugify(null) must throw TypeError');

console.log('ACCEPT_OK');
