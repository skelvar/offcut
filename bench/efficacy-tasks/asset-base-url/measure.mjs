#!/usr/bin/env node
import { detectNewConfigSurface, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const detected = detectNewConfigSurface(diff);
printMeasure(detected, inputs, { category: 'new-config-surface', detected });
