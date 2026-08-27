#!/usr/bin/env node
import { addedDiffText, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const added = addedDiffText(diff);
const section = diff.split(/^diff --git /m).find((part) => part.startsWith('a/src/release-notes.js b/src/release-notes.js')) || '';
const newFile = /^new file mode /m.test(section);
const addedLines = section.split(/\r?\n/).filter((line) => line.startsWith('+') && !line.startsWith('+++')).length;
printMeasure(newFile && addedLines > 80, inputs, { file: 'src/release-notes.js', new_file: newFile, added_lines: addedLines });
