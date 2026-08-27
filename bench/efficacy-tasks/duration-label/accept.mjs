#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/duration.js', "if (subject.formatDuration(0) !== '0s') throw new Error('zero');\nconst h = 2 + (process.pid % 4);\nif (subject.formatDuration(h * 3600 + 125.9) !== h + 'h 2m 5s') throw new Error('mixed units');\nif (subject.formatDuration(60) !== '1m') throw new Error('minute');\nif (subject.formatDuration(24 * 3600) !== '24h') throw new Error('one day must stay in hours');\nif (subject.formatDuration(77 * 3600 + 61) !== '77h 1m 1s') throw new Error('multiple days must stay in hours');\nfor (const bad of [-1, Infinity, NaN]) { let threw = false; try { subject.formatDuration(bad); } catch (error) { threw = error instanceof TypeError; } if (!threw) throw new Error('invalid input'); }");
process.stdout.write('ACCEPT_OK\n');
