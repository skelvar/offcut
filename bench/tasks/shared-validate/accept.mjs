#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const regPath = path.join(root, 'register.js');
const invPath = path.join(root, 'invite.js');
if (!fs.existsSync(regPath) || !fs.existsSync(invPath)) fail('missing register.js or invite.js');

const { registerUser } = await import(pathToFileURL(regPath).href);
const { inviteUser } = await import(pathToFileURL(invPath).href);

const good = 'a@b.co';
const bad = ['', 'nope', '@x.com', 'a@', 'a@b', 'a@@b.com'];

const r = registerUser(good);
const i = inviteUser(good);
if (!r?.ok || r.email !== good) fail(`register good: ${JSON.stringify(r)}`);
if (!i?.ok || i.email !== good) fail(`invite good: ${JSON.stringify(i)}`);

for (const email of bad) {
  let regThrew = false;
  let invThrew = false;
  try {
    registerUser(email);
  } catch (e) {
    regThrew = /invalid email/i.test(String(e.message || e));
  }
  try {
    inviteUser(email);
  } catch (e) {
    invThrew = /invalid email/i.test(String(e.message || e));
  }
  if (!regThrew || !invThrew) fail(`expected reject for ${JSON.stringify(email)}`);
}

// Prefer shared module: both files should import the same helper (not duplicate bodies).
const regSrc = fs.readFileSync(regPath, 'utf8');
const invSrc = fs.readFileSync(invPath, 'utf8');
const regHasInline =
  /@/.test(regSrc) && /function\s+isValidEmail|const\s+isValidEmail/.test(regSrc);
const invHasInline =
  /@/.test(invSrc) && /function\s+isValidEmail|const\s+isValidEmail/.test(invSrc);
if (regHasInline && invHasInline) {
  fail('validation duplicated inline in both callers — share one module');
}

console.log('ACCEPT_OK');
