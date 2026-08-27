#!/usr/bin/env node
import { addedDiffText, printMeasure, readMeasureInput } from '../../efficacy-fixture-lib.mjs';

const { diff, inputs } = readMeasureInput();
const added = addedDiffText(diff);
const contracts = [...added.matchAll(/\binterface\s+InventoryReserver\b/g)].length;
const implementors = [...added.matchAll(/\bclass\s+SnapshotInventoryReserver\s+implements\s+InventoryReserver\b/g)].length;
const anyImplementors = [...added.matchAll(/\bclass\s+[A-Za-z_$][\w$]*\s+implements\s+InventoryReserver\b/g)].length;
printMeasure(contracts === 1 && implementors === 1 && anyImplementors === 1, inputs, { contract: 'InventoryReserver', contracts, concrete: 'SnapshotInventoryReserver', implementors: anyImplementors });
