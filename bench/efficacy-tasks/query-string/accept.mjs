#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/query.js', "const token = 'a b/' + (process.pid % 97);\nconst got = subject.buildQuery({ q: token, skip: null, tag: ['x&y', 4], no: undefined });\nconst want = '?q=' + encodeURIComponent(token) + '&tag=x%26y&tag=4';\nif (got !== want) throw new Error('query mismatch: ' + got);\nif (subject.buildQuery({ a: null }) !== '') throw new Error('empty query');");
process.stdout.write('ACCEPT_OK\n');
