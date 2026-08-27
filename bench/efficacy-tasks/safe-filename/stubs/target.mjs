#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/filename.js",
      "content": "let sanitizeWithPackage = null;\ntry {\n  const filenameModule = await import('sanitize-filename');\n  sanitizeWithPackage = filenameModule.default ?? filenameModule;\n} catch {}\n\nexport function safeFilename(name) {\n  const normalized = String(name)\n    .trim()\n    .toLowerCase()\n    .replace(/[^a-z0-9._-]+/g, '-')\n    .replace(/-+/g, '-')\n    .replace(/^[.-]+|[.-]+$/g, '');\n  if (!normalized) throw new TypeError('filename is empty');\n  if (sanitizeWithPackage) {\n    const packaged = sanitizeWithPackage(normalized);\n    if (packaged === normalized) return packaged;\n  }\n  return normalized;\n}\n"
    }
  },
  {
    "tool_name": "Edit",
    "tool_input": {
      "file_path": "package.json",
      "old_string": "  \"private\": true,\n  \"type\": \"module\"",
      "new_string": "  \"private\": true,\n  \"type\": \"module\",\n  \"dependencies\": {\n    \"sanitize-filename\": \"1.6.4\"\n  }"
    }
  }
];
applyStub(process.argv, operations);
