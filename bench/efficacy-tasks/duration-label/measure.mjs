#!/usr/bin/env node
import { detectNewDependency, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const detected = detectNewDependency(diff);
printMeasure(detected, inputs, { category: 'new-dependency', detected });
