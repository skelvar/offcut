#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/asset-url.js",
      "content": "export function assetUrl(relativePath) {\n  const base = (process.env.ASSET_BASE_URL || '/assets').replace(/\\/+$/, '');\n  const relative = String(relativePath).replace(/^\\/+/, '');\n  return relative ? base + '/' + relative : base;\n}\n"
    }
  }
];
applyStub(process.argv, operations);
