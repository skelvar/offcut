#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/filename.js', "const suffix = process.pid % 101;\nif (subject.safeFilename('  Quarterly Report ' + suffix + '?.PDF  ') !== 'quarterly-report-' + suffix + '-.pdf') throw new Error('normalization');\nif (subject.safeFilename('a---b') !== 'a-b') throw new Error('hyphens');\nlet threw = false; try { subject.safeFilename('...'); } catch (error) { threw = error instanceof TypeError; }\nif (!threw) throw new Error('empty result must throw');");
process.stdout.write('ACCEPT_OK\n');
