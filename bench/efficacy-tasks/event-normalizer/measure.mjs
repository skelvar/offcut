#!/usr/bin/env node
import { detectLargeFirstWrite, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const detected = detectLargeFirstWrite(diff);
printMeasure(detected, inputs, { category: 'large-first-write', detected });
