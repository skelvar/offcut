#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/redact.ts', "const input = { user: 'u' + (process.pid % 31), Password: 'p', nested: [{ token: 't', keep: 4 }], secretive: 'ok' };\nconst output = subject.redactAudit(input);\nif (JSON.stringify(output) !== JSON.stringify({ user: input.user, Password: '[REDACTED]', nested: [{ token: '[REDACTED]', keep: 4 }], secretive: 'ok' })) throw new Error('redaction mismatch');\nif (input.Password !== 'p' || input.nested[0].token !== 't') throw new Error('input mutated');");
process.stdout.write('ACCEPT_OK\n');
