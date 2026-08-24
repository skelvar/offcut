#!/usr/bin/env node
// Signal definitions as data. Free of where the content came from —
// takes a write view and returns findings. Phase 4 reuses this for review/audit.

/** @typedef {'full' | 'fragment'} WriteShape */
/** @typedef {'write' | 'diff' | 'repo'} SignalContext */
/**
 * View a signal inspects. `context` selects which signals apply:
 * write (hook), diff (review), repo (audit). Defaults to `write`.
 * `corpus` is optional cross-file text for repo/diff reference checks.
 *
 * @typedef {{
 *   path: string | null,
 *   content: string,
 *   addedContent: string,
 *   shape: WriteShape,
 *   pathExists: boolean | null,
 *   truncated: boolean,
 *   context?: SignalContext,
 *   corpus?: string | null,
 * }} WriteView
 */
/**
 * @typedef {{
 *   id: string,
 *   phase: 'pre' | 'post',
 *   message: string,
 *   shapes: 'full' | 'fragment' | 'both',
 *   needsContent: boolean,
 *   contexts: SignalContext[],
 *   check: (view: WriteView) => boolean,
 * }} Signal
 */

export const LARGE_FIRST_WRITE_LINES = 80;

const DEP_BASENAMES = new Set([
  'package.json',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
]);

/**
 * Pull a path + content view out of a tool input object.
 * Host-agnostic: looks at common field names, not host vocabulary.
 *
 * @param {object | null | undefined} toolInput
 * @param {WriteShape} shape
 * @returns {{ path: string | null, content: string, addedContent: string }}
 */
export function extractWriteFields(toolInput, shape) {
  const input = toolInput && typeof toolInput === 'object' ? toolInput : {};
  const filePath =
    input.file_path ??
    input.filePath ??
    input.path ??
    input.file ??
    null;

  if (shape === 'full') {
    const content = String(input.content ?? input.contents ?? input.new_string ?? '');
    return { path: filePath != null ? String(filePath) : null, content, addedContent: content };
  }

  // Fragment: prefer the added side. apply_patch carries a unified patch blob.
  if (input.new_string != null || input.newString != null) {
    const added = String(input.new_string ?? input.newString ?? '');
    const old = String(input.old_string ?? input.oldString ?? '');
    // Approximate whole-file view for same-write analysis: old replaced by new.
    // Cheap and good enough for text-level signals on a single edit hunk.
    const content = added || old;
    return {
      path: filePath != null ? String(filePath) : null,
      content,
      addedContent: added,
    };
  }

  // apply_patch (measured 2026-08-24): some hosts put the patch blob in
  // `command`, not `patch`/`input`, with the path inside (`*** Add File:`).
  const patchBlob =
    input.patch ??
    input.input ??
    (typeof input.command === 'string' && input.command.includes('*** Begin Patch')
      ? input.command
      : null);
  if (patchBlob != null) {
    const patch = String(patchBlob);
    const fromBlob = patch.match(/\*\*\*\s+(?:Add|Update)\s+File:\s*(.+)/)?.[1]?.trim();
    const added = patch
      .split(/\r?\n/)
      .filter((l) => l.startsWith('+') && !l.startsWith('+++'))
      .map((l) => l.slice(1))
      .join('\n');
    // Prefer reconstructed added lines as `content` so text signals see
    // `interface Foo` rather than `+interface Foo` from the raw patch.
    const reconstructed = added || patch;
    return {
      path:
        filePath != null
          ? String(filePath)
          : fromBlob
            ? String(fromBlob)
            : null,
      content: reconstructed,
      addedContent: reconstructed,
    };
  }

  const content = String(input.content ?? input.contents ?? '');
  return {
    path: filePath != null ? String(filePath) : null,
    content,
    addedContent: content,
  };
}

function basenameOf(p) {
  if (!p) return '';
  const norm = String(p).replace(/\\/g, '/');
  const i = norm.lastIndexOf('/');
  return i === -1 ? norm : norm.slice(i + 1);
}

function lineCount(text) {
  if (!text) return 0;
  return String(text).split(/\r?\n/).length;
}

function looksLikeNewDependency(view) {
  const base = basenameOf(view.path);
  if (!DEP_BASENAMES.has(base)) return false;
  const text = view.addedContent || view.content;
  if (!text.trim()) return false;

  if (base === 'package.json') {
    // A dependencies/devDependencies block gaining a package line.
    if (!/"dependencies"|"devDependencies"|"peerDependencies"|"optionalDependencies"/.test(text)) {
      // Fragment may be just the new package line inside an existing block.
      return /^\s*"[^"]+"\s*:\s*"[^"]+"\s*,?\s*$/m.test(text) && !/"name"|"version"|"scripts"/.test(text)
        ? true
        : /"(?:dependencies|devDependencies)"\s*:\s*\{[\s\S]*?"[^"]+"\s*:\s*"[^"]+"/.test(text);
    }
    return /"(?:dependencies|devDependencies|peerDependencies|optionalDependencies)"\s*:\s*\{[\s\S]*?"[^"]+"\s*:\s*"[^"]+"/.test(
      text,
    );
  }
  if (base === 'requirements.txt') {
    return /^\s*[A-Za-z0-9_.-]+\s*(==|>=|<=|~=|!=|>|<)?/m.test(text);
  }
  if (base === 'go.mod') {
    return /^\s*require\s+\S+/m.test(text) || /^\s*\S+\s+v\d/m.test(text);
  }
  if (base === 'Cargo.toml') {
    return /\[(?:dependencies|dev-dependencies)\]/.test(text) ||
      /^\s*[A-Za-z0-9_-]+\s*=\s*"[^"]+"/m.test(text);
  }
  return false;
}

function speculativeAbstraction(view) {
  const text = view.content || '';
  if (!text.trim()) return false;

  // Interface / abstract class / factory declarations.
  const interfaces = [...text.matchAll(/\binterface\s+([A-Za-z_][\w]*)/g)].map((m) => m[1]);
  const abstracts = [...text.matchAll(/\babstract\s+class\s+([A-Za-z_][\w]*)/g)].map((m) => m[1]);
  const factories = [
    ...text.matchAll(/\b(?:function|const|class)\s+(create[A-Z][\w]*|[A-Z][\w]*Factory)\b/g),
  ].map((m) => m[1]);

  const names = [...new Set([...interfaces, ...abstracts, ...factories])];
  if (!names.length) return false;

  for (const name of names) {
    let impls = 0;
    const implRe = new RegExp(`\\b(?:implements|extends)\\s+${name}\\b`, 'g');
    impls += [...text.matchAll(implRe)].length;
    // Factory with a single concrete return / instantiation nearby.
    if (/Factory$/.test(name) || /^create[A-Z]/.test(name)) {
      const bodyMatch = text.match(
        new RegExp(
          `(?:function\\s+${name}|const\\s+${name}\\s*=|class\\s+${name})[\\s\\S]{0,800}?\\{([\\s\\S]*?)\\n\\}`,
        ),
      );
      const body = bodyMatch ? bodyMatch[1] : text;
      const news = [...body.matchAll(/\bnew\s+([A-Za-z_][\w]*)/g)].map((m) => m[1]);
      const unique = new Set(news);
      if (unique.size === 1) impls = Math.max(impls, 1);
      if (unique.size > 1) impls = unique.size;
    }
    if (impls === 1) return true;
    // TypeScript-style: interface + exactly one class mentioning it, no second.
    if (interfaces.includes(name) || abstracts.includes(name)) {
      const classMentions = [
        ...text.matchAll(new RegExp(`\\bclass\\s+([A-Za-z_][\\w]*)[^{]*\\b${name}\\b`, 'g')),
      ];
      if (classMentions.length === 1) return true;
    }
  }
  return false;
}

function configForConstant(view) {
  const text = view.addedContent || view.content || '';
  if (!text.trim()) return false;

  // New config-looking keys: KEY: value, "key": value, key = value in config-ish files.
  const base = basenameOf(view.path).toLowerCase();
  const configish =
    /config|settings|\.env|constants|options/i.test(base) ||
    /\b(?:config|settings|options)\b/i.test(view.path || '');

  const keys = [];
  for (const m of text.matchAll(/["']([A-Za-z_][\w.-]*)["']\s*:/g)) keys.push(m[1]);
  for (const m of text.matchAll(/(?:^|[\s;])([A-Z][A-Z0-9_]+)\s*=/gm)) keys.push(m[1]);
  for (const m of text.matchAll(/\b(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=/g)) keys.push(m[1]);
  for (const m of text.matchAll(/^\s*([a-z][\w]*)\s*[:=]\s*["'`0-9truefalse]/gm)) {
    if (configish) keys.push(m[1]);
  }
  if (!keys.length) return false;

  const unique = [...new Set(keys)];
  // A key is "config for a constant" when its name never appears again as a read
  // in the same write (beyond the declaration line).
  for (const key of unique) {
    const re = new RegExp(`\\b${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
    const hits = [...text.matchAll(re)];
    if (hits.length === 1) return true;
  }
  return false;
}

function exportedUnused(view) {
  const text = view.content || '';
  // Repo/diff may supply a corpus so "no caller" means across files, not
  // "no caller in this one file" (which would fire on almost every export).
  const searchIn = view.corpus != null ? String(view.corpus) : text;
  const exports = [
    ...text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_][\w]*)/g),
    ...text.matchAll(/export\s+(?:const|let|var|class|enum|type|interface)\s+([A-Za-z_][\w]*)/g),
    ...text.matchAll(/export\s+\{\s*([A-Za-z_][\w]*)/g),
  ].map((m) => m[1]);
  if (!exports.length) return false;
  for (const name of new Set(exports)) {
    const re = new RegExp(`\\b${name}\\b`, 'g');
    const hits = [...searchIn.matchAll(re)];
    // Declaration only — no other reference in the searchable text.
    if (hits.length <= 1) return true;
  }
  return false;
}

function newConfigSurface(view) {
  const text = view.addedContent || '';
  if (!text.trim()) return false;
  return (
    /\b(?:process\.env|getenv|config\.get|getConfig|defineConfig|Convict|ConvictSchema)\b/.test(text) ||
    /\b(?:nconf|rc\(|cosmiconfig)\b/.test(text) ||
    (/"(?:[A-Z0-9_]+)"\s*:/.test(text) && /config|settings/i.test(view.path || ''))
  );
}

function singleCallWrapper(view) {
  const text = view.addedContent || view.content || '';
  // Body is only `return callee(...)` — anything else is not a pure wrapper.
  const wrappers = [
    ...text.matchAll(
      /(?:export\s+)?(?:async\s+)?function\s+([A-Za-z_][\w]*)\s*\([^)]*\)\s*\{\s*return\s+([A-Za-z_][\w.]*)\s*\([^;]*\)\s*;?\s*\}/g,
    ),
    ...text.matchAll(
      /(?:export\s+)?const\s+([A-Za-z_][\w]*)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s+([A-Za-z_][\w.]*)\s*\(/g,
    ),
  ];
  return wrappers.length > 0;
}

function unusedDefaultParam(view) {
  const text = view.content || '';
  // function foo(a = 1) or (a = 1) =>
  const params = [...text.matchAll(/(?:function\s+[A-Za-z_][\w]*|(?:const|let)\s+[A-Za-z_][\w]*\s*=\s*(?:async\s*)?)\s*\(([^)]*)\)/g)];
  for (const m of params) {
    const list = m[1];
    const defaults = [...list.matchAll(/([A-Za-z_][\w]*)\s*=\s*[^,)+]+/g)].map((d) => d[1]);
    for (const p of defaults) {
      // Call sites passing this argument positionally/named are hard; cheap check:
      // if the param name never appears as an option key at a call, treat as unused default.
      const named = new RegExp(`\\b${p}\\s*:`, 'g');
      if (![...text.matchAll(named)].length) {
        // At least one defaulted param with no named-arg use in the write.
        return true;
      }
    }
  }
  return false;
}

/** @type {Signal[]} */
export const PRE_SIGNALS = [
  {
    id: 'new-file',
    phase: 'pre',
    // pathExists===false is meaningful for a write/diff create, never a repo audit.
    contexts: ['write', 'diff'],
    // Applies to full writes, and to fragment creates (pathExists === false).
    shapes: 'both',
    needsContent: false,
    message:
      'Offcut: new file — is a new file needed, or does this belong in an existing one?',
    check: (view) => view.pathExists === false,
  },
  {
    id: 'large-first-write',
    phase: 'pre',
    contexts: ['write', 'diff'],
    // Whole-file only: a fragment over the threshold is an edit, not a "first write".
    shapes: 'full',
    needsContent: true,
    message: 'Offcut: large first write — name the cheapest version of this.',
    check: (view) =>
      view.pathExists === false && lineCount(view.content) > LARGE_FIRST_WRITE_LINES,
  },
  {
    id: 'new-dependency',
    phase: 'pre',
    contexts: ['write', 'diff', 'repo'],
    shapes: 'both',
    needsContent: true,
    message:
      'Offcut: new dependency — what does this replace that four lines could not do?',
    check: looksLikeNewDependency,
  },
  {
    id: 'speculative-abstraction',
    phase: 'pre',
    contexts: ['write', 'diff', 'repo'],
    shapes: 'both',
    needsContent: true,
    message:
      'Offcut: one implementation — is the indirection carrying its weight?',
    check: speculativeAbstraction,
  },
  {
    id: 'config-for-constant',
    phase: 'pre',
    contexts: ['write', 'diff', 'repo'],
    shapes: 'both',
    needsContent: true,
    message: 'Offcut: config for a constant — does this value ever change?',
    check: configForConstant,
  },
];

/** @type {Signal[]} */
export const POST_SIGNALS = [
  {
    id: 'exported-unused',
    phase: 'post',
    contexts: ['write', 'diff', 'repo'],
    shapes: 'both',
    needsContent: true,
    message:
      'Offcut: exported symbol with no caller — did anyone ask for it?',
    check: exportedUnused,
  },
  {
    id: 'new-config-surface',
    phase: 'post',
    contexts: ['write', 'diff', 'repo'],
    shapes: 'both',
    needsContent: true,
    message: 'Offcut: new configuration surface — was this requested?',
    check: newConfigSurface,
  },
  {
    id: 'single-call-wrapper',
    phase: 'post',
    contexts: ['write', 'diff', 'repo'],
    shapes: 'both',
    needsContent: true,
    message: 'Offcut: wrapper around a single call — is the wrapper earning its keep?',
    check: singleCallWrapper,
  },
  {
    id: 'unused-default-param',
    phase: 'post',
    contexts: ['write', 'diff', 'repo'],
    shapes: 'both',
    needsContent: true,
    message:
      'Offcut: parameter with a default that no call site passes — was the flexibility needed?',
    check: unusedDefaultParam,
  },
];

export const ALL_SIGNALS = [...PRE_SIGNALS, ...POST_SIGNALS];

/**
 * Run signals against a view. Returns findings in definition order.
 * Filters by shape, truncation, and `contexts` (default view context: write).
 *
 * @param {Signal[]} signals
 * @param {WriteView} view
 * @returns {Signal[]}
 */
export function runSignals(signals, view) {
  if (!view || !Array.isArray(signals)) return [];
  const ctx = view.context || 'write';
  const out = [];
  for (const signal of signals) {
    if (!signal || typeof signal.check !== 'function') continue;
    if (Array.isArray(signal.contexts) && !signal.contexts.includes(ctx)) continue;
    if (signal.shapes !== 'both' && signal.shapes !== view.shape) continue;
    if (signal.needsContent && view.truncated) continue;
    let hit = false;
    try {
      hit = Boolean(signal.check(view));
    } catch {
      hit = false;
    }
    if (hit) out.push(signal);
  }
  return out;
}
