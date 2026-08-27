#!/usr/bin/env node
import { addedDiffText, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const added = addedDiffText(diff);
const declaration = /formatOrderLabel\s*\([^)]*\blocale\s*=/.test(added);
const references = [...added.matchAll(/\blocale\b/g)].length;
printMeasure(declaration && references === 1, inputs, { file: 'src/order-label.js', parameter: 'locale', references });
