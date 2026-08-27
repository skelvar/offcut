#!/usr/bin/env node
import { detectSpeculativeAbstraction, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const detected = detectSpeculativeAbstraction(diff);
printMeasure(detected, inputs, { category: 'speculative-abstraction', detected });
