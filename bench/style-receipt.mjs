import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildStyleReceipt, renderStyleReceipt } from './live-style-lib.mjs';

export function readJsonl(filePath) {
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .map((line, index) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        throw new Error(`${filePath}:${index + 1}: ${error.message}`);
      }
    });
}

function parseArgs(argv) {
  const inputPath = argv[0];
  let reviewsPath = null;
  let outPrefix = null;

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--reviews') {
      reviewsPath = argv[++index];
    } else if (arg === '--out') {
      outPrefix = argv[++index];
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  if (!inputPath) {
    throw new Error(
      'usage: node bench/style-receipt.mjs <results.jsonl> [--reviews <reviews.jsonl>] [--out <prefix>]',
    );
  }
  if (!reviewsPath && argv.includes('--reviews')) {
    throw new Error('--reviews requires a path');
  }
  if (!outPrefix && argv.includes('--out')) {
    throw new Error('--out requires a prefix');
  }

  return {
    inputPath,
    reviewsPath,
    outPrefix: outPrefix ?? inputPath.replace(/\.jsonl$/i, '') + '-receipt',
  };
}

export function applyReviews(rows, reviews) {
  const byRunId = new Map();
  const resultRunIds = new Set(rows.map((row) => row?.run_id));
  for (const review of reviews) {
    if (!review?.run_id) throw new Error('every review requires run_id');
    if (!resultRunIds.has(review.run_id)) {
      throw new Error(`unknown review run_id: ${review.run_id}`);
    }
    if (!['pass', 'fail'].includes(review.answer_completeness)) {
      throw new Error(`bad answer_completeness for ${review.run_id}`);
    }
    if (review.reviewer_blinded !== true) {
      throw new Error(`reviewer_blinded must be true for ${review.run_id}`);
    }
    if (byRunId.has(review.run_id)) throw new Error(`duplicate review: ${review.run_id}`);
    byRunId.set(review.run_id, review);
  }

  return rows.map((row) => {
    const review = byRunId.get(row.run_id);
    return review
      ? {
          ...row,
          answer_completeness: review.answer_completeness,
          reviewer_blinded: review.reviewer_blinded,
        }
      : row;
  });
}

export function writeReceiptArtifacts(rows, outPrefix) {
  const receipt = buildStyleReceipt(rows);
  const jsonPath = `${outPrefix}.json`;
  const markdownPath = `${outPrefix}.md`;
  fs.mkdirSync(path.dirname(path.resolve(jsonPath)), { recursive: true });
  fs.writeFileSync(jsonPath, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
  fs.writeFileSync(markdownPath, renderStyleReceipt(receipt), 'utf8');
  return { receipt, jsonPath, markdownPath };
}

export function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  const rows = readJsonl(options.inputPath);
  const reviewedRows = options.reviewsPath
    ? applyReviews(rows, readJsonl(options.reviewsPath))
    : rows;
  const { receipt, jsonPath, markdownPath } = writeReceiptArtifacts(
    reviewedRows,
    options.outPrefix,
  );
  process.stdout.write(
    `${JSON.stringify({
      status: receipt.status,
      public_claimable: receipt.public_claimable,
      receipt_sha256: receipt.receipt_sha256,
      json_path: jsonPath,
      markdown_path: markdownPath,
    })}\n`,
  );
}

const isMain =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
