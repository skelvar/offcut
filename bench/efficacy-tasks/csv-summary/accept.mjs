#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/summarize.js', "const n = 17 + (process.pid % 19);\nconst csv = 'region,amount\\nNorth,' + n + '\\n\"West, Coast\",2.5\\nNorth,3\\n\\n';\nconst value = subject.summarizeSales(csv);\nif (JSON.stringify(value) !== JSON.stringify({ North: n + 3, 'West, Coast': 2.5 })) throw new Error('wrong totals');\nlet threw = false;\ntry { subject.summarizeSales('region,amount\\nEast,nope'); } catch (error) { threw = error instanceof TypeError; }\nif (!threw) throw new Error('invalid amount must throw TypeError');");
process.stdout.write('ACCEPT_OK\n');
