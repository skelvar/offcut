#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(
  root,
  'src/editor-toolbar.js',
  [
    "const idle = subject.renderToolbar({ saving: false });",
    "const busy = subject.renderToolbar({ saving: true });",
    "if (typeof idle !== 'string' || typeof busy !== 'string') throw new Error('renderToolbar must return a string');",
    "if (!idle.includes('Cancel') || !busy.includes('Cancel')) throw new Error('cancel control missing');",
    "if (!/\\bSave\\b/.test(idle) || /Saving/.test(idle)) throw new Error('idle save label');",
    "if (!/Saving/.test(busy) || !/disabled/i.test(busy)) throw new Error('busy save state');",
  ].join('\n'),
);
process.stdout.write('ACCEPT_OK\n');
