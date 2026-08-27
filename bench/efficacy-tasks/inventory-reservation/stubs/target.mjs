#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/reserve.ts",
      "content": "interface InventoryReserver {\n  reserve(stock: Record<string, number>, requests: Record<string, number>): { allocated: Record<string, number>; remaining: Record<string, number> };\n}\n\nclass SnapshotInventoryReserver implements InventoryReserver {\n  reserve(stock: Record<string, number>, requests: Record<string, number>) {\n    const remaining = { ...stock };\n    const allocated: Record<string, number> = {};\n    for (const [sku, requested] of Object.entries(requests)) {\n      if (requested <= 0) continue;\n      const available = Math.max(0, remaining[sku] ?? 0);\n      const quantity = Math.min(available, requested);\n      allocated[sku] = quantity;\n      if (sku in remaining) remaining[sku] = available - quantity;\n    }\n    return { allocated, remaining };\n  }\n}\n\nexport function reserveInventory(stock: Record<string, number>, requests: Record<string, number>) {\n  return new SnapshotInventoryReserver().reserve(stock, requests);\n}\n"
    }
  }
];
applyStub(process.argv, operations);
