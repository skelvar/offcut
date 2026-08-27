#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/signature.ts', "const { createHmac } = await import('node:crypto');\nconst secret = 's-' + (process.pid % 53);\nconst body = JSON.stringify({ invoice: process.pid, paid: true });\nconst signature = createHmac('sha256', secret).update(body, 'utf8').digest('hex');\nif (!subject.verifyWebhook(secret, body, signature)) throw new Error('valid signature');\nif (subject.verifyWebhook(secret, body + 'x', signature)) throw new Error('wrong body');\nif (subject.verifyWebhook(secret, body, 'xyz') || subject.verifyWebhook(secret, body, signature.slice(2))) throw new Error('malformed signature');");
process.stdout.write('ACCEPT_OK\n');
