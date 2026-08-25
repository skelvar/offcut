#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const adminPath = path.join(root, 'admin.js');
const billingPath = path.join(root, 'billing.js');
if (!fs.existsSync(adminPath) || !fs.existsSync(billingPath)) {
  fail('missing admin.js or billing.js');
}

const { runAdmin } = await import(pathToFileURL(adminPath).href);
const { runBilling } = await import(pathToFileURL(billingPath).href);
if (typeof runAdmin !== 'function') fail('runAdmin not exported');
if (typeof runBilling !== 'function') fail('runBilling not exported');

const a = runAdmin({ role: 'admin' });
if (!a?.ok || a.action !== 'admin') fail(`runAdmin ok: ${JSON.stringify(a)}`);

const b = runBilling({ role: 'billing' });
if (!b?.ok || b.action !== 'billing') fail(`runBilling ok: ${JSON.stringify(b)}`);

function expectForbidden(fn, user, label) {
  let threw = false;
  try {
    fn(user);
  } catch (e) {
    threw = /forbidden/i.test(String(e.message || e));
  }
  if (!threw) fail(`${label} must throw /forbidden/i for ${JSON.stringify(user)}`);
}

expectForbidden(runAdmin, { role: 'billing' }, 'runAdmin');
expectForbidden(runAdmin, { role: 'user' }, 'runAdmin');
expectForbidden(runAdmin, {}, 'runAdmin');
expectForbidden(runBilling, { role: 'admin' }, 'runBilling');
expectForbidden(runBilling, { role: 'user' }, 'runBilling');
expectForbidden(runBilling, {}, 'runBilling');

console.log('ACCEPT_OK');
