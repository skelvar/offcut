#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/query.js",
      "content": "export function buildQuery(params) {\n  const pairs = [];\n  for (const [key, raw] of Object.entries(params)) {\n    const values = Array.isArray(raw) ? raw : [raw];\n    for (const value of values) {\n      if (value == null) continue;\n      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));\n    }\n  }\n  return pairs.length ? '?' + pairs.join('&') : '';\n}\n"
    }
  },
  {
    "tool_name": "Edit",
    "tool_input": {
      "file_path": "package.json",
      "old_string": "  \"private\": true,\n  \"type\": \"module\"",
      "new_string": "  \"private\": true,\n  \"type\": \"module\",\n  \"dependencies\": {\n    \"qs\": \"^1.0.0\"\n  }"
    }
  }
];
applyStub(process.argv, operations);
