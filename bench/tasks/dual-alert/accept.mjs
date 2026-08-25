#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const mailPath = path.join(root, 'mail.js');
const webhookPath = path.join(root, 'webhook.js');
if (!fs.existsSync(mailPath) || !fs.existsSync(webhookPath)) {
  fail('missing mail.js or webhook.js');
}

const { sendMailAlert } = await import(pathToFileURL(mailPath).href);
const { sendWebhookAlert } = await import(pathToFileURL(webhookPath).href);
if (typeof sendMailAlert !== 'function') fail('sendMailAlert not exported');
if (typeof sendWebhookAlert !== 'function') fail('sendWebhookAlert not exported');

const m = sendMailAlert('disk full');
if (!m?.ok || m.channel !== 'mail' || m.body !== '[ALERT] disk full') {
  fail(`mail: ${JSON.stringify(m)}`);
}

const w = sendWebhookAlert('disk full');
if (!w?.ok || w.channel !== 'webhook' || w.body !== '[ALERT] disk full') {
  fail(`webhook: ${JSON.stringify(w)}`);
}

const m2 = sendMailAlert('ok');
if (m2.body !== '[ALERT] ok') fail(`mail body: ${m2.body}`);
const w2 = sendWebhookAlert('ok');
if (w2.body !== '[ALERT] ok') fail(`webhook body: ${w2.body}`);

console.log('ACCEPT_OK');
