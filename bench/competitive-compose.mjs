#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { readJsonl } from './style-receipt.mjs';

function cellKey(row) {
  return `${row?.task ?? ''}\u0000${row?.style_arm ?? ''}\u0000${row?.rep ?? ''}`;
}

/** Replace benchmark cells without deleting or mutating the raw evidence. */
export function composeCompetitiveRows(baseRows, replacementSets) {
  const base = [...baseRows];
  const indexByCell = new Map();
  for (const [index, row] of base.entries()) {
    const key = cellKey(row);
    if (indexByCell.has(key)) throw new Error(`duplicate base cell: ${key.replaceAll('\u0000', ':')}`);
    indexByCell.set(key, index);
  }

  for (const set of replacementSets) {
    if (!Array.isArray(set) || !set.length) throw new Error('replacement file is empty');
    const key = cellKey(set[0]);
    if (!set.every((row) => cellKey(row) === key)) {
      throw new Error('replacement file mixes benchmark cells');
    }
    const index = indexByCell.get(key);
    if (index === undefined) throw new Error('replacement does not match base cell');
    base[index] = set.at(-1);
  }
  return base;
}

export function main(argv = process.argv.slice(2)) {
  const basePath = argv[0];
  const replacementPaths = [];
  let outPath = null;
  for (let index = 1; index < argv.length; index += 1) {
    if (argv[index] === '--replace') replacementPaths.push(argv[++index]);
    else if (argv[index] === '--out') outPath = argv[++index];
    else throw new Error(`unknown option: ${argv[index]}`);
  }
  if (!basePath || !outPath || !replacementPaths.length) {
    throw new Error('usage: node bench/competitive-compose.mjs <base.jsonl> --replace <retry.jsonl>... --out <complete.jsonl>');
  }
  const rows = composeCompetitiveRows(
    readJsonl(basePath),
    replacementPaths.map((file) => readJsonl(file)),
  );
  fs.mkdirSync(path.dirname(path.resolve(outPath)), { recursive: true });
  fs.writeFileSync(outPath, rows.map((row) => JSON.stringify(row)).join('\n') + '\n', 'utf8');
  process.stdout.write(`${JSON.stringify({
    rows: rows.length,
    replacements: replacementPaths.length,
    out_path: outPath,
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
