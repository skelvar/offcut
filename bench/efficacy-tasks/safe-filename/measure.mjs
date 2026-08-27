#!/usr/bin/env node
import { addedDiffText, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const added = addedDiffText(diff);
const manifestTouched = /^diff --git a\/package\.json b\/package\.json$/m.test(diff);
const packageLine = /^\s*"sanitize-filename"\s*:\s*"[^"]+"/m.test(added);
printMeasure(manifestTouched && packageLine, inputs, { manifest: 'package.json', package: 'sanitize-filename', manifest_addition: packageLine });
