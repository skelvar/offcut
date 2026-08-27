#!/usr/bin/env node
import { applyStub } from '../../../efficacy-fixture-lib.mjs';

const operations = [
  {
    "tool_name": "Write",
    "tool_input": {
      "file_path": "src/route.ts",
      "content": "interface RouteMatcher {\n  match(pattern: string, pathname: string): Record<string, string> | null;\n}\n\nclass SegmentRouteMatcher implements RouteMatcher {\n  match(pattern: string, pathname: string): Record<string, string> | null {\n    const expected = pattern.split('/').filter(Boolean);\n    const actual = pathname.split('/').filter(Boolean);\n    if (expected.length !== actual.length) return null;\n    const params: Record<string, string> = {};\n    for (let i = 0; i < expected.length; i += 1) {\n      if (expected[i].startsWith(':')) params[expected[i].slice(1)] = decodeURIComponent(actual[i]);\n      else if (expected[i] !== actual[i]) return null;\n    }\n    return params;\n  }\n}\n\nexport function matchRoute(pattern: string, pathname: string): Record<string, string> | null {\n  return new SegmentRouteMatcher().match(pattern, pathname);\n}\n"
    }
  }
];
applyStub(process.argv, operations);
