#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/route.ts', "const id = 'user ' + (process.pid % 43);\nconst got = subject.matchRoute('/teams/:team/users/:id', '/teams/core/users/' + encodeURIComponent(id));\nif (JSON.stringify(got) !== JSON.stringify({ team: 'core', id })) throw new Error('captures');\nif (subject.matchRoute('/a/:id', '/b/1') !== null) throw new Error('literal mismatch');\nif (subject.matchRoute('/a/:id', '/a/1/extra') !== null) throw new Error('whole path');");
process.stdout.write('ACCEPT_OK\n');
