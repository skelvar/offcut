#!/usr/bin/env node
// Programmatic acceptance for config-fallback. Exit 0 only if loadConfig works.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();
const modPath = path.join(root, 'config.js');

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

if (!fs.existsSync(modPath)) fail('missing config.js');

const { loadConfig } = await import(pathToFileURL(modPath).href);
if (typeof loadConfig !== 'function') fail('loadConfig not exported');

const prev = { ...process.env };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cfg-accept-'));

try {
  // defaults only
  delete process.env.APP_PORT;
  delete process.env.APP_HOST;
  const a = loadConfig();
  if (a.port !== 3000 || a.host !== 'localhost') fail(`defaults: ${JSON.stringify(a)}`);

  // env overlay
  process.env.APP_PORT = '8080';
  process.env.APP_HOST = '0.0.0.0';
  const b = loadConfig();
  if (Number(b.port) !== 8080 || b.host !== '0.0.0.0') fail(`env: ${JSON.stringify(b)}`);

  // file then env (env wins on overlap)
  const cfgFile = path.join(root, 'config.json');
  const hadFile = fs.existsSync(cfgFile);
  const backup = hadFile ? fs.readFileSync(cfgFile) : null;
  fs.writeFileSync(cfgFile, JSON.stringify({ port: 4000, host: 'filehost', extra: true }));
  process.env.APP_PORT = '9000';
  delete process.env.APP_HOST;
  const c = loadConfig();
  if (Number(c.port) !== 9000) fail(`file+env port: ${JSON.stringify(c)}`);
  if (c.host !== 'filehost') fail(`file host: ${JSON.stringify(c)}`);
  if (c.extra !== true) fail(`file keys lost: ${JSON.stringify(c)}`);

  if (hadFile) fs.writeFileSync(cfgFile, backup);
  else fs.unlinkSync(cfgFile);

  console.log('ACCEPT_OK');
  process.exit(0);
} catch (e) {
  fail(String(e && e.stack ? e.stack : e));
} finally {
  Object.keys(process.env).forEach((k) => {
    if (!(k in prev)) delete process.env[k];
  });
  Object.assign(process.env, prev);
  fs.rmSync(tmp, { recursive: true, force: true });
}
