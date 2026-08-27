#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/feature-gate.ts', "const tenant = 'tenant-' + (process.pid % 29);\nconst flags = { live: true, dead: false, staff: { roles: ['admin'] }, pilot: { tenants: [tenant] }, bad: { value: 1 } };\nif (!subject.isEnabled(flags, 'live', {})) throw new Error('boolean true');\nif (subject.isEnabled(flags, 'dead', {})) throw new Error('boolean false');\nif (!subject.isEnabled(flags, 'staff', { role: 'admin' }) || subject.isEnabled(flags, 'staff', { role: 'viewer' })) throw new Error('roles');\nif (!subject.isEnabled(flags, 'pilot', { tenant }) || subject.isEnabled(flags, 'missing', {})) throw new Error('tenant or missing');");
process.stdout.write('ACCEPT_OK\n');
