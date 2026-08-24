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

function stripComments(text) {
  // Structural signals must match code, not prose. Dogfooding caught
  // `speculative-abstraction` firing on this very file: the comment
  // "an interface / abstract class with exactly one" parses as an abstract
  // class named `with`. Comments describing a pattern are not the pattern.
  return String(text || '')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*/g, '$1 ');
}

function speculativeAbstraction(view) {
  const text = stripComments(view.content || '');
  if (!text.trim()) return false;

  // Only structural indirection: an interface / abstract class with exactly one
  // implementor in view. Naming conventions (createX, FooFactory) are not
  // evidence — createCache + `new Map()` was a 10/10 false positive on ttl-cache.
  const interfaces = [...text.matchAll(/\binterface\s+([A-Za-z_][\w]*)/g)].map((m) => m[1]);
  const abstracts = [...text.matchAll(/\babstract\s+class\s+([A-Za-z_][\w]*)/g)].map((m) => m[1]);
  const names = [...new Set([...interfaces, ...abstracts])];
  if (!names.length) return false;

  for (const name of names) {
    const implRe = new RegExp(`\\b(?:implements|extends)\\s+${name}\\b`, 'g');
    const impls = [...text.matchAll(implRe)].length;
    if (impls === 1) return true;
    // TypeScript-style: interface name mentioned in exactly one class header.
    const classMentions = [
      ...text.matchAll(new RegExp(`\\bclass\\s+([A-Za-z_][\\w]*)[^{]*\\b${name}\\b`, 'g')),
    ];
    if (classMentions.length === 1) return true;
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
  // Not decidable on a single write: every module's public API looks unused
  // inside its own file. Requires a cross-file corpus (diff/repo only).
  if (view.corpus == null) return false;
  const text = view.content || '';
  const searchIn = String(view.corpus);
  // A lone module with no imports is a deliverable API, not a dead export.
  // Need evidence of a multi-module program before "no caller" means anything.
  if (!/\bimport\b|\brequire\s*\(/.test(searchIn)) return false;
  const exports = [
    ...text.matchAll(/export\s+(?:async\s+)?function\s+([A-Za-z_][\w]*)/g),
    ...text.matchAll(/export\s+(?:const|let|var|class|enum|type|interface)\s+([A-Za-z_][\w]*)/g),
    ...text.matchAll(/export\s+\{\s*([A-Za-z_][\w]*)/g),
  ].map((m) => m[1]);
  if (!exports.length) return false;
  for (const name of new Set(exports)) {
    const re = new RegExp(`\\b${name}\\b`, 'g');
    const hits = [...searchIn.matchAll(re)];
    // Declaration only — no other reference across the corpus.
    if (hits.length <= 1) return true;
  }
  return false;
}

function newConfigSurface(view) {
  const text = view.addedContent || '';
  if (!text.trim()) return false;
  // process.env / getenv are often the requested surface (config-fallback: 10/10
  // FP). Flag new config *frameworks* instead — weight that a few lines would not.
  return (
    /\b(?:config\.get|getConfig|defineConfig|Convict|ConvictSchema)\b/.test(text) ||
    /\b(?:nconf|cosmiconfig)\b/.test(text) ||
    /\brc\s*\(/.test(text)
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
  // Defaulted params that never appear again in the file — not "no named call
  // site" (that fired on every requested options bag: retry-backoff, ttl-cache).
  const params = [
    ...text.matchAll(
      /(?:function\s+[A-Za-z_][\w]*|(?:const|let)\s+[A-Za-z_][\w]*\s*=\s*(?:async\s*)?)\s*\(([^)]*)\)/g,
    ),
  ];
  for (const m of params) {
    const list = m[1];
    const defaults = [...list.matchAll(/([A-Za-z_][\w]*)\s*=\s*[^,)+]+/g)].map((d) => d[1]);
    for (const p of defaults) {
      const re = new RegExp(`\\b${p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      if ([...text.matchAll(re)].length <= 1) return true;
    }
  }
  return false;
}

/** @type {Signal[]} */
export const PRE_SIGNALS = [
  // new-file deleted (Phase 6): pathExists===false is a constant on creates, not
  // evidence of over-engineering. The prompt often asks for the file
  // (shared-validate: 5/5 full-arm fires, all wrong).
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
    // Write context has no corpus — not decidable at write time (was 20/20 FP).
    contexts: ['diff', 'repo'],
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
