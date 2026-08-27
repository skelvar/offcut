#!/usr/bin/env node
import { acceptanceRoot, runModuleProbe } from '../../efficacy-fixture-lib.mjs';

const root = acceptanceRoot();
runModuleProbe(root, 'src/release-notes.js', "const marker = 'item-' + (process.pid % 67);\nconst got = subject.renderReleaseNotes('2.' + (process.pid % 10), [\n  { type: 'fixed', text: marker + '-z' },\n  { type: 'added', text: marker + '-b' },\n  { type: 'added', text: marker + '-a' },\n  { type: 'unknown', text: 'omit-me' },\n]);\nconst version = '2.' + (process.pid % 10);\nconst want = '# Release ' + version + '\\n\\n## Added\\n- ' + marker + '-a\\n- ' + marker + '-b\\n\\n## Fixed\\n- ' + marker + '-z\\n';\nif (got !== want) throw new Error('notes mismatch:\\n' + got);\nif (subject.renderReleaseNotes('x', []).trim() !== '# Release x') throw new Error('empty release');");
process.stdout.write('ACCEPT_OK\n');
