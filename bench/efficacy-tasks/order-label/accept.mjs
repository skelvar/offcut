#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/order-label.js', "const id = 'PO-' + (process.pid % 89);\nif (subject.formatOrderLabel({ id: ' ' + id + ' ', customer: ' Ada & Co ' }) !== '#' + id + ' — ADA & CO') throw new Error('label mismatch');\nfor (const value of [{ id, customer: '' }, { customer: 'x' }, null]) { let threw = false; try { subject.formatOrderLabel(value); } catch (error) { threw = error instanceof TypeError; } if (!threw) throw new Error('missing fields'); }");
process.stdout.write('ACCEPT_OK\n');
