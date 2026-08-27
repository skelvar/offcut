#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/query.js",
      "content": "export function buildQuery(params) {\n  const pairs = [];\n  for (const [key, raw] of Object.entries(params)) {\n    const values = Array.isArray(raw) ? raw : [raw];\n    for (const value of values) {\n      if (value == null) continue;\n      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));\n    }\n  }\n  return pairs.length ? '?' + pairs.join('&') : '';\n}\n"
    }
  }
];
applyStub(process.argv, operations);
