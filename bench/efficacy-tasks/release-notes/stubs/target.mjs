#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/release-notes.js",
      "content": "const SECTION_ORDER = ['added', 'fixed', 'changed'];\nconst SECTION_TITLES = new Map([\n  ['added', 'Added'],\n  ['fixed', 'Fixed'],\n  ['changed', 'Changed'],\n]);\n\nfunction normalizeVersion(version) {\n  return String(version);\n}\n\nfunction normalizeType(type) {\n  return String(type).toLowerCase();\n}\n\nfunction normalizeText(text) {\n  return String(text);\n}\n\nfunction isKnownType(type) {\n  return SECTION_TITLES.has(type);\n}\n\nfunction createEmptyGroups() {\n  return new Map(SECTION_ORDER.map((type) => [type, []]));\n}\n\nfunction appendChange(groups, change) {\n  const type = normalizeType(change.type);\n  if (!isKnownType(type)) return;\n  groups.get(type).push(normalizeText(change.text));\n}\n\nfunction collectGroups(changes) {\n  const groups = createEmptyGroups();\n  for (const change of changes) {\n    appendChange(groups, change);\n  }\n  return groups;\n}\n\nfunction compareText(left, right) {\n  if (left < right) return -1;\n  if (left > right) return 1;\n  return 0;\n}\n\nfunction sortedItems(items) {\n  return [...items].sort(compareText);\n}\n\nfunction releaseHeading(version) {\n  return '# Release ' + normalizeVersion(version);\n}\n\nfunction sectionHeading(type) {\n  return '## ' + SECTION_TITLES.get(type);\n}\n\nfunction bullet(text) {\n  return '- ' + text;\n}\n\nfunction renderSection(type, items) {\n  const lines = ['', sectionHeading(type)];\n  for (const item of sortedItems(items)) {\n    lines.push(bullet(item));\n  }\n  return lines;\n}\n\nfunction hasItems(items) {\n  return items.length > 0;\n}\n\nfunction renderGroups(groups) {\n  const lines = [];\n  for (const type of SECTION_ORDER) {\n    const items = groups.get(type);\n    if (hasItems(items)) {\n      lines.push(...renderSection(type, items));\n    }\n  }\n  return lines;\n}\n\nfunction finishDocument(lines) {\n  return lines.join('\\n') + '\\n';\n}\n\nexport function renderReleaseNotes(version, changes) {\n  const groups = collectGroups(changes);\n  const lines = [releaseHeading(version), ...renderGroups(groups)];\n  return finishDocument(lines);\n}\n"
    }
  }
];
applyStub(process.argv, operations);
