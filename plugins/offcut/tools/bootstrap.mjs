#!/usr/bin/env node

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SOURCE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const RUNTIME = path.resolve(
  process.env.OFFCUT_INSTALL_DIR || path.join(os.homedir(), '.offcut', 'runtime'),
);
const UNINSTALL = process.argv.includes('--uninstall');
const HELP = process.argv.includes('--help') || process.argv.includes('-h');

const RUNTIME_PATHS = [
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

function assertSafeRuntime(target) {
  const parsed = path.parse(target);
  const forbidden = new Set([
    path.resolve(parsed.root),
    path.resolve(os.homedir()),
    path.resolve(SOURCE),
  ]);
  if (forbidden.has(path.resolve(target))) {
    throw new Error(`Refusing unsafe Offcut runtime path: ${target}`);
  }
}

function copyRuntime() {
  assertSafeRuntime(RUNTIME);
  if (path.resolve(SOURCE) === path.resolve(RUNTIME)) return;

  const stage = `${RUNTIME}.tmp-${process.pid}`;
  fs.rmSync(stage, { recursive: true, force: true });
  fs.mkdirSync(stage, { recursive: true });
  try {
    for (const rel of RUNTIME_PATHS) {
      const from = path.join(SOURCE, rel);
      if (!fs.existsSync(from)) throw new Error(`Package is missing ${rel}`);
      const to = path.join(stage, rel);
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.cpSync(from, to, { recursive: true });
    }
    fs.rmSync(RUNTIME, { recursive: true, force: true });
    fs.renameSync(stage, RUNTIME);
  } catch (error) {
    fs.rmSync(stage, { recursive: true, force: true });
    throw error;
  }
}

function runInstaller(remove) {
  const preferred = path.join(RUNTIME, 'tools', 'install.mjs');
  const installer = fs.existsSync(preferred)
    ? preferred
    : path.join(SOURCE, 'tools', 'install.mjs');
  const result = spawnSync(
    process.execPath,
    [installer, ...(remove ? ['--uninstall'] : [])],
    {
      stdio: 'inherit',
      env: { ...process.env, OFFCUT_BOOTSTRAPPED: '1' },
    },
  );
  return result.status ?? 1;
}

function main() {
  if (HELP) {
    console.log('Usage: offcut [--uninstall]');
    console.log(`Runtime: ${RUNTIME}`);
    return;
  }

  if (UNINSTALL) {
    const status = runInstaller(true);
    if (status === 0) {
      assertSafeRuntime(RUNTIME);
      fs.rmSync(RUNTIME, { recursive: true, force: true });
      console.log(`Removed Offcut runtime: ${RUNTIME}`);
    }
    process.exitCode = status;
    return;
  }

  copyRuntime();
  const status = runInstaller(false);
  if (status === 0) console.log(`Offcut runtime: ${RUNTIME}`);
  process.exitCode = status;
}

main();
