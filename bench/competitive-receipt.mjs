#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildCompetitiveReceipt, renderCompetitiveReceipt } from './live-style-lib.mjs';
import { applyReviews, readJsonl } from './style-receipt.mjs';

export function writeCompetitiveReceiptArtifacts(rows, outPrefix) {
  const receipt = buildCompetitiveReceipt(rows);
  const jsonPath = `${outPrefix}.json`;
  const markdownPath = `${outPrefix}.md`;
  fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderCompetitiveReceipt(receipt), 'utf8');
  return { receipt, jsonPath, markdownPath };
}

export function main(argv = process.argv.slice(2)) {
  const inputPath = argv[0];
  if (!inputPath) {
    throw new Error('usage: node bench/competitive-receipt.mjs <results.jsonl> [--reviews <reviews.jsonl>] [--out <prefix>]');
  }
  let reviewsPath = null;
  let outPrefix = inputPath.replace(/\.jsonl$/i, '') + '-receipt';
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--reviews') reviewsPath = argv[++index];
    else if (argv[index] === '--out') outPrefix = argv[++index];
    else throw new Error(`unknown option: ${argv[index]}`);
  }
  const rows = readJsonl(inputPath);
  const reviewed = reviewsPath ? applyReviews(rows, readJsonl(reviewsPath)) : rows;
  const artifacts = writeCompetitiveReceiptArtifacts(reviewed, outPrefix);
  process.stdout.write(`${JSON.stringify({
    status: artifacts.receipt.status,
    public_claimable: artifacts.receipt.public_claimable,
    receipt_sha256: artifacts.receipt.receipt_sha256,
    json_path: artifacts.jsonPath,
    markdown_path: artifacts.markdownPath,
  })}\n`);
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
