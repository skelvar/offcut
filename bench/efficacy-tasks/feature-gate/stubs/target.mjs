#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/feature-gate.ts",
      "content": "type Flag = boolean | { roles?: string[]; tenants?: string[] };\n\ninterface GateEvaluator {\n  evaluate(flags: Record<string, Flag>, name: string, context: { role?: string; tenant?: string }): boolean;\n}\n\nclass DefaultGateEvaluator implements GateEvaluator {\n  evaluate(flags: Record<string, Flag>, name: string, context: { role?: string; tenant?: string }): boolean {\n    const flag = flags[name];\n    if (typeof flag === 'boolean') return flag;\n    if (!flag || typeof flag !== 'object') return false;\n    if (Array.isArray(flag.roles)) return flag.roles.includes(context.role ?? '');\n    if (Array.isArray(flag.tenants)) return flag.tenants.includes(context.tenant ?? '');\n    return false;\n  }\n}\n\nexport function isEnabled(flags: Record<string, Flag>, name: string, context: { role?: string; tenant?: string }): boolean {\n  return new DefaultGateEvaluator().evaluate(flags, name, context);\n}\n"
    }
  }
];
applyStub(process.argv, operations);
