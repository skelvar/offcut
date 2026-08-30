#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256 } from './lib.mjs';
import { readJsonl } from './style-receipt.mjs';

export function buildBlindBundle(rows) {
  return rows
    .map((row) => ({
      review_id: sha256(String(row.run_id || '')).slice(0, 16),
      run_id: row.run_id,
      task: row.task,
      answer: row.final_answer ?? '',
    }))
    .sort((left, right) => left.review_id.localeCompare(right.review_id));
}

export function main(argv = process.argv.slice(2)) {
  const inputPath = argv[0];
  const outIndex = argv.indexOf('--out');
  const outPath = outIndex === -1 ? null : argv[outIndex + 1];
  if (!inputPath || !outPath) {
    throw new Error('usage: node bench/blind-review.mjs <results.jsonl> --out <bundle.jsonl>');
  }
  const bundle = buildBlindBundle(readJsonl(inputPath));
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, bundle.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  process.stdout.write(`${JSON.stringify({ rows: bundle.length, out_path: outPath })}\n`);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
