#!/usr/bin/env node
import { addedDiffText, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const added = addedDiffText(diff);
const defines = [...added.matchAll(/\bdefineConfig\s*\(/g)].length;
const reads = [...added.matchAll(/\bgetConfig\s*\(/g)].length;
printMeasure(defines > 0 && reads > 0, inputs, { file: 'src/asset-url.js', defineConfig_calls: defines, getConfig_calls: reads });
