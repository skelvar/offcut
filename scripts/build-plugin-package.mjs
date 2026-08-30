#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT = path.join(ROOT, 'plugins', 'offcut');
const EXPECTED_OUTPUT = path.resolve(ROOT, 'plugins', 'offcut');

const PATHS = [
  '.claude-plugin/plugin.json',
  '.codex-plugin/plugin.json',
  '.cursor-plugin/plugin.json',
  'adapters',
  'hooks',
  'rules',
  'scripts/scan.mjs',
  'skills',
  'tools/bootstrap.mjs',
  'tools/install.mjs',
  'AGENTS.md',
  'LICENSE',
  'README.md',
  'package.json',
  'plugin.json',
];

if (path.resolve(OUTPUT) !== EXPECTED_OUTPUT || !OUTPUT.startsWith(`${ROOT}${path.sep}`)) {
  throw new Error(`Refusing unsafe plugin output path: ${OUTPUT}`);
}

fs.rmSync(OUTPUT, { recursive: true, force: true });
fs.mkdirSync(OUTPUT, { recursive: true });

for (const rel of PATHS) {
  const from = path.join(ROOT, rel);
  const to = path.join(OUTPUT, rel);
  if (!fs.existsSync(from)) throw new Error(`Missing distribution source: ${rel}`);
  fs.mkdirSync(path.dirname(to), { recursive: true });
  fs.cpSync(from, to, { recursive: true });
}

console.log(`Built ${path.relative(ROOT, OUTPUT)} from ${PATHS.length} source paths.`);
