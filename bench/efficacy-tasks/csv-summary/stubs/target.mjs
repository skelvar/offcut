#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/summarize.js",
      "content": "function parseRow(line) {\n  const fields = [];\n  let value = '';\n  let quoted = false;\n  for (let i = 0; i < line.length; i += 1) {\n    const char = line[i];\n    if (char === '\"' && quoted && line[i + 1] === '\"') { value += '\"'; i += 1; }\n    else if (char === '\"') quoted = !quoted;\n    else if (char === ',' && !quoted) { fields.push(value); value = ''; }\n    else value += char;\n  }\n  fields.push(value);\n  return fields;\n}\n\nexport function summarizeSales(csv) {\n  const lines = String(csv).split(/\\r?\\n/).filter((line) => line.trim());\n  const totals = {};\n  for (const line of lines.slice(1)) {\n    const [region, rawAmount] = parseRow(line);\n    const amount = Number(rawAmount);\n    if (!Number.isFinite(amount)) throw new TypeError('amount must be finite');\n    totals[region] = (totals[region] ?? 0) + amount;\n  }\n  return totals;\n}\n"
    }
  },
  {
    "tool_name": "Edit",
    "tool_input": {
      "file_path": "package.json",
      "old_string": "  \"private\": true,\n  \"type\": \"module\"",
      "new_string": "  \"private\": true,\n  \"type\": \"module\",\n  \"dependencies\": {\n    \"csv-parse\": \"^1.0.0\"\n  }"
    }
  }
];
applyStub(process.argv, operations);
