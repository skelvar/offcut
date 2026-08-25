#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.argv[2] || process.cwd();

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

const linePath = path.join(root, 'line.js');
const pricePath = path.join(root, 'price.js');
if (!fs.existsSync(linePath) || !fs.existsSync(pricePath)) {
  fail('missing line.js or price.js');
}

const { lineTotal } = await import(pathToFileURL(linePath).href);
const { displayPrice } = await import(pathToFileURL(pricePath).href);
if (typeof lineTotal !== 'function') fail('lineTotal not exported');
if (typeof displayPrice !== 'function') fail('displayPrice not exported');

if (displayPrice(1050) !== '$10.50') fail(`displayPrice 1050: ${displayPrice(1050)}`);
if (displayPrice(0) !== '$0.00') fail(`displayPrice 0: ${displayPrice(0)}`);
if (displayPrice(99) !== '$0.99') fail(`displayPrice 99: ${displayPrice(99)}`);
if (displayPrice(100) !== '$1.00') fail(`displayPrice 100: ${displayPrice(100)}`);

if (lineTotal('Widgets', 1050) !== 'Widgets: $10.50') {
  fail(`lineTotal: ${lineTotal('Widgets', 1050)}`);
}
if (lineTotal('Tax', 0) !== 'Tax: $0.00') fail(`lineTotal zero: ${lineTotal('Tax', 0)}`);
if (lineTotal('A', 5) !== 'A: $0.05') fail(`lineTotal 5: ${lineTotal('A', 5)}`);

console.log('ACCEPT_OK');
