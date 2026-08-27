#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/reserve.ts', "const amount = 3 + (process.pid % 8);\nconst stock = { A: amount, B: 2, C: -1 };\nconst requests = { A: amount + 4, B: 1, C: 2, X: 5, ignored: 0 };\nconst before = JSON.stringify([stock, requests]);\nconst got = subject.reserveInventory(stock, requests);\nif (JSON.stringify(got) !== JSON.stringify({ allocated: { A: amount, B: 1, C: 0, X: 0 }, remaining: { A: 0, B: 1, C: 0 } })) throw new Error('reservation mismatch: ' + JSON.stringify(got));\nif (JSON.stringify([stock, requests]) !== before) throw new Error('inputs mutated');");
process.stdout.write('ACCEPT_OK\n');
