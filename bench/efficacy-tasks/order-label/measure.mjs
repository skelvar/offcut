#!/usr/bin/env node
import { detectUnusedDefaultParam, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const detected = detectUnusedDefaultParam(diff);
printMeasure(detected, inputs, { category: 'unused-default-param', detected });
