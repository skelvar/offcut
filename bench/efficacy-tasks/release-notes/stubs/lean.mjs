#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/release-notes.js",
      "content": "const headings = { added: 'Added', fixed: 'Fixed', changed: 'Changed' };\n\nexport function renderReleaseNotes(version, changes) {\n  const groups = { added: [], fixed: [], changed: [] };\n  for (const change of changes) {\n    if (groups[change.type]) groups[change.type].push(String(change.text));\n  }\n  const lines = ['# Release ' + version];\n  for (const type of ['added', 'fixed', 'changed']) {\n    if (!groups[type].length) continue;\n    lines.push('', '## ' + headings[type]);\n    for (const text of groups[type].sort()) lines.push('- ' + text);\n  }\n  return lines.join('\\n') + '\\n';\n}\n"
    }
  }
];
applyStub(process.argv, operations);
