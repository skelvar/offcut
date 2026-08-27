#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/redact.ts",
      "content": "interface Redactor {\n  redact(value: unknown): unknown;\n}\n\nclass AuditRedactor implements Redactor {\n  redact(value: unknown): unknown {\n    if (Array.isArray(value)) return value.map((item) => this.redact(item));\n    if (value && typeof value === 'object') {\n      const output: Record<string, unknown> = {};\n      for (const [key, item] of Object.entries(value)) {\n        output[key] = /^(password|token|secret)$/i.test(key) ? '[REDACTED]' : this.redact(item);\n      }\n      return output;\n    }\n    return value;\n  }\n}\n\nexport function redactAudit(value: unknown): unknown {\n  return new AuditRedactor().redact(value);\n}\n"
    }
  }
];
applyStub(process.argv, operations);
