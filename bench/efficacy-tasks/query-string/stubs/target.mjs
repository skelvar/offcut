#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/query.js",
      "content": "let stringifyWithPackage = null;\ntry {\n  ({ stringify: stringifyWithPackage } = await import('qs'));\n} catch {}\n\nfunction localStringify(params) {\n  const pairs = [];\n  for (const [key, raw] of Object.entries(params)) {\n    for (const value of Array.isArray(raw) ? raw : [raw]) {\n      if (value == null) continue;\n      pairs.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(value)));\n    }\n  }\n  return pairs.join('&');\n}\n\nexport function buildQuery(params) {\n  const query = stringifyWithPackage\n    ? stringifyWithPackage(params, { arrayFormat: 'repeat', skipNulls: true })\n    : localStringify(params);\n  return query ? '?' + query : '';\n}\n"
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
