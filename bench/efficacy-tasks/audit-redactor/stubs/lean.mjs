#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/redact.ts",
      "content": "export function redactAudit(value: unknown): unknown {\n  if (Array.isArray(value)) return value.map(redactAudit);\n  if (value && typeof value === 'object') {\n    const output: Record<string, unknown> = {};\n    for (const [key, item] of Object.entries(value)) {\n      output[key] = /^(password|token|secret)$/i.test(key) ? '[REDACTED]' : redactAudit(item);\n    }\n    return output;\n  }\n  return value;\n}\n"
    }
  }
];
applyStub(process.argv, operations);
