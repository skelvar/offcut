import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('universal package exposes a zero-dependency offcut installer', () => {
  const packagePath = path.join(root, 'package.json');
  assert.ok(fs.existsSync(packagePath), 'package.json is required for npx installation');

  const manifest = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  assert.equal(manifest.name, '@skelvar/offcut');
  assert.equal(manifest.type, 'module');
  assert.equal(manifest.bin?.offcut, './tools/bootstrap.mjs');
  assert.deepEqual(manifest.dependencies || {}, {});
  assert.match(manifest.engines?.node || '', />=20/);
  assert.ok(manifest.files.includes('scripts/scan.mjs'));
  assert.equal(manifest.files.includes('scripts/'), false, 'build scripts must not ship to npm');
});

test('bootstrap installs a durable runtime before wiring every detected harness', () => {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-bootstrap-home-'));
  const homeAlias = `${home}-alias`;
  fs.symlinkSync(home, homeAlias, process.platform === 'win32' ? 'junction' : 'dir');
  const runtime = path.join(homeAlias, '.offcut', 'runtime');
  for (const dir of ['.claude', '.codex', '.cursor', '.grok']) {
    fs.mkdirSync(path.join(home, dir), { recursive: true });
  }

  const env = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    OFFCUT_INSTALL_DIR: runtime,
  };

  try {
    const installed = spawnSync(
      process.execPath,
      [path.join(root, 'tools', 'bootstrap.mjs')],
      { cwd: root, env, encoding: 'utf8' },
    );
    assert.equal(installed.status, 0, installed.stderr || installed.stdout);
    assert.ok(fs.existsSync(path.join(runtime, 'tools', 'install.mjs')));
    assert.ok(fs.existsSync(path.join(runtime, 'hooks', 'activate.js')));
    assert.equal(fs.existsSync(path.join(runtime, 'bench')), false);
    assert.equal(fs.existsSync(path.join(runtime, 'tests')), false);
    assert.equal(fs.existsSync(path.join(runtime, 'scripts', 'build-plugin-package.mjs')), false);
    assert.equal(fs.existsSync(path.join(runtime, '.claude-plugin', 'marketplace.json')), false);
    assert.equal(fs.existsSync(path.join(runtime, '.cursor-plugin', 'marketplace.json')), false);

    for (const config of [
      path.join(home, '.claude', 'settings.json'),
      path.join(home, '.codex', 'hooks.json'),
      path.join(home, '.cursor', 'hooks.json'),
      path.join(home, '.grok', 'hooks', 'offcut-hooks.json'),
    ]) {
      const text = fs.readFileSync(config, 'utf8');
      assert.match(text, /offcut-hooks/);
      assert.match(text.replace(/\\/g, '/'), /\.offcut\/runtime\/hooks\/activate\.js/);
    }

    const removed = spawnSync(
      process.execPath,
      [path.join(root, 'tools', 'bootstrap.mjs'), '--uninstall'],
      { cwd: root, env, encoding: 'utf8' },
    );
    assert.equal(removed.status, 0, removed.stderr || removed.stdout);
    assert.equal(fs.existsSync(runtime), false, 'uninstall removes the reproducible runtime');
  } finally {
    fs.rmSync(homeAlias, { recursive: true, force: true });
    fs.rmSync(home, { recursive: true, force: true });
  }
});

test('Codex, Claude, and Cursor marketplaces publish one Skelvar package', () => {
  const codex = JSON.parse(fs.readFileSync(
    path.join(root, '.agents', 'plugins', 'marketplace.json'),
    'utf8',
  ));
  const claude = JSON.parse(fs.readFileSync(
    path.join(root, '.claude-plugin', 'marketplace.json'),
    'utf8',
  ));
  const cursor = JSON.parse(fs.readFileSync(
    path.join(root, '.cursor-plugin', 'marketplace.json'),
    'utf8',
  ));

  assert.equal(codex.name, 'skelvar');
  assert.equal(codex.interface.displayName, 'Skelvar');
  assert.deepEqual(codex.plugins[0].source, {
    source: 'local',
    path: './plugins/offcut',
  });
  assert.deepEqual(codex.plugins[0].policy, {
    installation: 'AVAILABLE',
    authentication: 'ON_INSTALL',
  });
  assert.equal(codex.plugins[0].category, 'Developer Tools');

  assert.equal(claude.name, 'skelvar');
  assert.equal(claude.plugins[0].name, 'offcut');
  assert.equal(claude.plugins[0].source, './plugins/offcut');

  assert.equal(cursor.name, 'skelvar');
  assert.equal(cursor.plugins[0].name, 'offcut');
  assert.equal(cursor.plugins[0].source, 'plugins/offcut');
});

test('marketplaces ship a generated plugin package that matches runtime source', () => {
  const packaged = path.join(root, 'plugins', 'offcut');
  const mirrored = [
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
    '.cursor-plugin/plugin.json',
    'hooks/activate.js',
    'hooks/hooks.json',
    'rules/offcut.md',
    'scripts/scan.mjs',
    'skills/offcut/SKILL.md',
    'tools/bootstrap.mjs',
    'tools/install.mjs',
    'AGENTS.md',
    'LICENSE',
    'README.md',
    'package.json',
    'plugin.json',
  ];

  for (const rel of mirrored) {
    const source = fs.readFileSync(path.join(root, rel));
    const copy = fs.readFileSync(path.join(packaged, rel));
    assert.deepEqual(copy, source, `${rel} must be regenerated`);
  }
  for (const omitted of ['bench', 'docs', 'evals', 'tests']) {
    assert.equal(fs.existsSync(path.join(packaged, omitted)), false, `${omitted} must not ship`);
  }

  const help = fs.readFileSync(path.join(packaged, 'skills', 'offcut-help', 'SKILL.md'), 'utf8');
  assert.doesNotMatch(help, /docs\//, 'the standalone package must not link to omitted docs');
});

test('README leads with the universal installer and accurate marketplace names', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  assert.match(readme, /npx --yes github:skelvar\/offcut/);
  assert.match(readme, /codex plugin marketplace add skelvar\/offcut/);
  assert.match(readme, /codex plugin add offcut@skelvar/);
  assert.match(readme, /\/plugin install offcut@skelvar/);
  assert.match(readme, /cursor\.com\/marketplace\/publish/);
  assert.doesNotMatch(readme, /offcut@offcut|\.offcut-src/);
});

test('public distribution identity is consistently Skelvar', () => {
  const legacyIdentity = ['xyz', 'bk'].join('');
  for (const rel of [
    'README.md',
    'package.json',
    'plugin.json',
    'LICENSE',
    '.claude-plugin/marketplace.json',
    '.claude-plugin/plugin.json',
    '.codex-plugin/plugin.json',
    '.cursor-plugin/marketplace.json',
    '.cursor-plugin/plugin.json',
    'skills/offcut/SKILL.md',
    'skills/offcut-audit/SKILL.md',
    'skills/offcut-help/SKILL.md',
    'skills/offcut-review/SKILL.md',
  ]) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8');
    assert.equal(
      source.toLowerCase().includes(legacyIdentity),
      false,
      `${rel} retains the old public identity`,
    );
  }
});
