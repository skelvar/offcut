#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/order-label.js",
      "content": "export function formatOrderLabel(order, locale = 'en-US') {\n  const id = String(order?.id ?? '').trim();\n  const customer = String(order?.customer ?? '').trim();\n  if (!id || !customer) throw new TypeError('id and customer are required');\n  return '#' + id + ' — ' + customer.toUpperCase();\n}\n"
    }
  }
];
applyStub(process.argv, operations);
