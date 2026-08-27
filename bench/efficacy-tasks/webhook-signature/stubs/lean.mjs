#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/signature.ts",
      "content": "import { createHmac, timingSafeEqual } from 'node:crypto';\n\nexport function verifyWebhook(secret: string, body: string, signature: string): boolean {\n  if (!/^[a-f0-9]{64}$/.test(signature)) return false;\n  const expected = createHmac('sha256', secret).update(body, 'utf8').digest();\n  const actual = Buffer.from(signature, 'hex');\n  return actual.length === expected.length && timingSafeEqual(actual, expected);\n}\n"
    }
  }
];
applyStub(process.argv, operations);
