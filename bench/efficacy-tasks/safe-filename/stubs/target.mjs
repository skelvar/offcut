#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/filename.js",
      "content": "export function safeFilename(name) {\n  const safe = String(name)\n    .trim()\n    .toLowerCase()\n    .replace(/[^a-z0-9._-]+/g, '-')\n    .replace(/-+/g, '-')\n    .replace(/^[.-]+|[.-]+$/g, '');\n  if (!safe) throw new TypeError('filename is empty');\n  return safe;\n}\n"
    }
  },
  {
    "tool_name": "Edit",
    "tool_input": {
      "file_path": "package.json",
      "old_string": "  \"private\": true,\n  \"type\": \"module\"",
      "new_string": "  \"private\": true,\n  \"type\": \"module\",\n  \"dependencies\": {\n    \"sanitize-filename\": \"^1.0.0\"\n  }"
    }
  }
];
applyStub(process.argv, operations);
