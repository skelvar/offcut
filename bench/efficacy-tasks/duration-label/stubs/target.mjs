#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/duration.js",
      "content": "export function formatDuration(totalSeconds) {\n  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) throw new TypeError('invalid duration');\n  let remaining = Math.floor(totalSeconds);\n  const hours = Math.floor(remaining / 3600);\n  remaining %= 3600;\n  const minutes = Math.floor(remaining / 60);\n  const seconds = remaining % 60;\n  const parts = [];\n  if (hours) parts.push(hours + 'h');\n  if (minutes) parts.push(minutes + 'm');\n  if (seconds || parts.length === 0) parts.push(seconds + 's');\n  return parts.join(' ');\n}\n"
    }
  },
  {
    "tool_name": "Edit",
    "tool_input": {
      "file_path": "package.json",
      "old_string": "  \"private\": true,\n  \"type\": \"module\"",
      "new_string": "  \"private\": true,\n  \"type\": \"module\",\n  \"dependencies\": {\n    \"pretty-ms\": \"^1.0.0\"\n  }"
    }
  }
];
applyStub(process.argv, operations);
