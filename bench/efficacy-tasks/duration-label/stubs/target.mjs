#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/duration.js",
      "content": "let prettyMilliseconds = null;\ntry {\n  const prettyModule = await import('pretty-ms');\n  prettyMilliseconds = prettyModule.default;\n} catch {}\n\nfunction localFormat(totalSeconds) {\n  let remaining = Math.floor(totalSeconds);\n  const hours = Math.floor(remaining / 3600);\n  remaining %= 3600;\n  const minutes = Math.floor(remaining / 60);\n  const seconds = remaining % 60;\n  const parts = [];\n  if (hours) parts.push(hours + 'h');\n  if (minutes) parts.push(minutes + 'm');\n  if (seconds || parts.length === 0) parts.push(seconds + 's');\n  return parts.join(' ');\n}\n\nexport function formatDuration(totalSeconds) {\n  if (!Number.isFinite(totalSeconds) || totalSeconds < 0) throw new TypeError('invalid duration');\n  if (totalSeconds === 0) return '0s';\n  if (prettyMilliseconds) {\n    const options = { secondsDecimalDigits: 0, hideYearAndDays: true };\n    return prettyMilliseconds(Math.floor(totalSeconds) * 1000, options).replace(/\\s+/g, ' ');\n  }\n  return localFormat(totalSeconds);\n}\n"
    }
  },
  {
    "tool_name": "Edit",
    "tool_input": {
      "file_path": "package.json",
      "old_string": "  \"private\": true,\n  \"type\": \"module\"",
      "new_string": "  \"private\": true,\n  \"type\": \"module\",\n  \"dependencies\": {\n    \"pretty-ms\": \"9.3.0\"\n  }"
    }
  }
];
applyStub(process.argv, operations);
