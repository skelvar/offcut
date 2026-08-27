#!/usr/bin/env node
import { addedDiffText, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const added = addedDiffText(diff);
const contracts = [...added.matchAll(/\binterface\s+RouteMatcher\b/g)].length;
const implementors = [...added.matchAll(/\bclass\s+SegmentRouteMatcher\s+implements\s+RouteMatcher\b/g)].length;
const anyImplementors = [...added.matchAll(/\bclass\s+[A-Za-z_$][\w$]*\s+implements\s+RouteMatcher\b/g)].length;
printMeasure(contracts === 1 && implementors === 1 && anyImplementors === 1, inputs, { contract: 'RouteMatcher', contracts, concrete: 'SegmentRouteMatcher', implementors: anyImplementors });
