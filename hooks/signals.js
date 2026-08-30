#!/usr/bin/env node
// Signal definitions as data. Free of where the content came from —
// takes a write view and returns findings. Phase 4 reuses this for review/audit.

import path from 'node:path';

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
 *   removedContent?: string,
 *   shape: WriteShape,
 *   pathExists: boolean | null,
 *   truncated: boolean,
 *   context?: SignalContext,
 *   corpus?: string | null,
 *   corpusFiles?: Array<{ path: string, content: string }> | null,
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
 *   extensions: string[] | '*',
 *   check: (view: WriteView) => boolean,
 * }} Signal
 */

export const LARGE_FIRST_WRITE_LINES = 80;

/** Plain JS/TS extensions understood by the lightweight lexical checks. */
export const JS_EXTENSIONS = ['.js', '.mjs', '.cjs', '.ts'];

/** Dependency manifest extensions for new-dependency. */
export const DEP_EXTENSIONS = ['.json', '.txt', '.toml', '.mod'];

const DEP_BASENAMES = new Set([
  'package.json',
  'requirements.txt',
  'go.mod',
  'Cargo.toml',
]);

const REGEX_PREFIX_WORDS = new Set([
  'await',
  'case',
  'delete',
  'do',
  'else',
  'in',
  'instanceof',
  'of',
  'return',
  'throw',
  'typeof',
  'void',
  'yield',
]);

const REGEX_AFTER_CONTROL_PAREN = new Set(['for', 'if', 'while', 'with']);

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
    return {
      path: filePath != null ? String(filePath) : null,
      content,
      addedContent: content,
      removedContent: '',
    };
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
      removedContent: old,
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
    const removed = patch
      .split(/\r?\n/)
      .filter((l) => l.startsWith('-') && !l.startsWith('---'))
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
      removedContent: removed,
    };
  }

  const content = String(input.content ?? input.contents ?? '');
  return {
    path: filePath != null ? String(filePath) : null,
    content,
    addedContent: content,
    removedContent: '',
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

/**
 * Replace comments and string/template literal bodies with whitespace while
 * preserving line breaks. Text-level source checks must inspect code, not a
 * comment or string that happens to describe the pattern they detect.
 */
function stripCommentsAndStrings(text) {
  let output = '';
  let mode = 'code';
  let escaped = false;
  let inRegexClass = false;
  const templateExpressionDepths = [];
  const source = String(text || '');

  const closesControlCondition = (before) => {
    if (!before.endsWith(')')) return false;
    let depth = 0;
    for (let index = before.length - 1; index >= 0; index -= 1) {
      const char = before[index];
      if (char === ')') depth += 1;
      else if (char === '(') {
        depth -= 1;
        if (depth === 0) {
          const prefix = before.slice(0, index).trimEnd();
          const word = prefix.match(/([A-Za-z_$][\w$]*)$/)?.[1];
          return REGEX_AFTER_CONTROL_PAREN.has(word || '');
        }
      }
    }
    return false;
  };

  const regexCanStartHere = () => {
    const before = output.trimEnd();
    if (!before) return true;
    const last = before.at(-1);
    if (/[([{=,:;!?&|+*%^~<>-]/.test(last)) return true;
    if (last === ')' && closesControlCondition(before)) return true;
    const word = before.match(/([A-Za-z_$][\w$]*)$/)?.[1];
    return REGEX_PREFIX_WORDS.has(word || '');
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (mode === 'line') {
      if (char === '\n') {
        mode = 'code';
        output += '\n';
      } else {
        output += ' ';
      }
      continue;
    }

    if (mode === 'block') {
      if (char === '*' && next === '/') {
        output += '  ';
        index += 1;
        mode = 'code';
      } else {
        output += char === '\n' ? '\n' : ' ';
      }
      continue;
    }

    if (mode === 'regex') {
      output += char === '\n' ? '\n' : ' ';
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === '[') {
        inRegexClass = true;
      } else if (char === ']') {
        inRegexClass = false;
      } else if (char === '/' && !inRegexClass) {
        while (/[A-Za-z]/.test(source[index + 1] || '')) {
          output += ' ';
          index += 1;
        }
        mode = 'code';
      }
      continue;
    }

    if (mode === 'template') {
      output += char === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '`') {
        mode = 'code';
      } else if (char === '$' && next === '{') {
        output += ' ';
        index += 1;
        templateExpressionDepths.push(1);
        mode = 'code';
      }
      continue;
    }

    if (mode === 'single' || mode === 'double') {
      output += char === '\n' ? '\n' : ' ';
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (
        (mode === 'single' && char === "'") ||
        (mode === 'double' && char === '"')
      ) {
        mode = 'code';
      }
      continue;
    }

    if (templateExpressionDepths.length) {
      const top = templateExpressionDepths.length - 1;
      if (char === '{') {
        templateExpressionDepths[top] += 1;
        output += char;
        continue;
      }
      if (char === '}') {
        templateExpressionDepths[top] -= 1;
        if (templateExpressionDepths[top] === 0) {
          templateExpressionDepths.pop();
          output += ' ';
          mode = 'template';
        } else {
          output += char;
        }
        continue;
      }
    }

    if (char === '/' && next === '/') {
      output += '  ';
      index += 1;
      mode = 'line';
    } else if (char === '/' && next === '*') {
      output += '  ';
      index += 1;
      mode = 'block';
    } else if (char === '/' && regexCanStartHere()) {
      output += ' ';
      mode = 'regex';
      escaped = false;
      inRegexClass = false;
    } else if (char === "'" || char === '"' || char === '`') {
      output += ' ';
      mode = char === "'" ? 'single' : char === '"' ? 'double' : 'template';
    } else {
      output += char;
    }
  }

  return output;
}

function substantiveLineCount(text) {
  return stripCommentsAndStrings(text)
    .split(/\r?\n/)
    .filter((line) => line.trim())
    .length;
}

const PACKAGE_DEPENDENCY_KEYS = new Set([
  'dependencies',
  'devDependencies',
  'peerDependencies',
  'optionalDependencies',
]);

function jsonStringKeys(text) {
  return new Set(
    [...String(text || '').matchAll(/"([^"]+)"\s*:\s*"[^"]*"/g)]
      .map((match) => match[1])
      .filter((key) => !PACKAGE_DEPENDENCY_KEYS.has(key)),
  );
}

function packageDependencyKeys(text) {
  try {
    const parsed = JSON.parse(String(text || ''));
    const keys = new Set();
    for (const section of PACKAGE_DEPENDENCY_KEYS) {
      const dependencies = parsed?.[section];
      if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) {
        continue;
      }
      for (const key of Object.keys(dependencies)) keys.add(key);
    }
    return keys;
  } catch {
    return null;
  }
}

function packageFragmentContainsKey(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sections = [
    ...String(text || '').matchAll(
      /"(?:dependencies|devDependencies|peerDependencies|optionalDependencies)"\s*:\s*\{/g,
    ),
  ];
  for (const section of sections) {
    const rest = String(text).slice((section.index || 0) + section[0].length);
    const end = rest.search(/^\s*}/m);
    const body = end === -1 ? rest : rest.slice(0, end);
    if (new RegExp(`^\\s*"${escaped}"\\s*:`, 'm').test(body)) return true;
  }
  return false;
}

function looksLikeNewDependency(view) {
  const base = basenameOf(view.path);
  if (!DEP_BASENAMES.has(base)) return false;
  const text = view.addedContent || view.content;
  if (!text.trim()) return false;

  if (base === 'package.json') {
    // A whole-file write to an existing package manifest contains old
    // dependencies too; without reading the prior file, their presence cannot
    // prove an addition.
    if (view.shape === 'full' && view.pathExists !== false) return false;
    const dependencies = packageDependencyKeys(view.content);
  if (view.pathExists === false) {
    if (dependencies) return dependencies.size > 0;
    const addedKeys = jsonStringKeys(view.addedContent);
    return [...addedKeys].some((key) => packageFragmentContainsKey(view.content || text, key));
  }

    const removed = jsonStringKeys(view.removedContent || '');
    const added = [...jsonStringKeys(view.addedContent)].filter((key) => !removed.has(key));
    if (!added.length) return false;
    if (dependencies) return added.some((key) => dependencies.has(key));
    return added.some((key) => packageFragmentContainsKey(view.content || text, key));
  }
  if (base === 'requirements.txt') {
    return /^\s*[A-Za-z0-9_.-]+\s*(==|>=|<=|~=|!=|>|<)?/m.test(text);
  }
  if (base === 'go.mod') {
    return /^\s*require\s+\S+/m.test(text) || /^\s*\S+\s+v\d/m.test(text);
  }
  if (base === 'Cargo.toml') {
    // A bare `name = "value"` line is ambiguous in TOML: it may be package
    // metadata, a profile setting, or a dependency. Require a dependency table
    // in the available view, then require an entry inside that table.
    const cargo = String(view.content || text);
    const sections = [
      ...cargo.matchAll(
        /^\s*\[(?:[^\]\r\n]+\.)?(?:dependencies|dev-dependencies|build-dependencies)\]\s*$/gm,
      ),
    ];
    for (const section of sections) {
      const start = (section.index || 0) + section[0].length;
      const rest = cargo.slice(start);
      const nextSection = rest.search(/^\s*\[/m);
      const body = nextSection === -1 ? rest : rest.slice(0, nextSection);
      if (/^\s*[A-Za-z0-9_-]+\s*=\s*(?:"[^"]+"|\{)/m.test(body)) {
        return true;
      }
    }
    return false;
  }
  return false;
}

function moduleStem(filePath) {
  return String(filePath || '')
    .replace(/\\/g, '/')
    .replace(/\.[^/.]+$/, '');
}

function importsNameFrom(file, name, sourcePath) {
  const importer = String(file?.path || '').replace(/\\/g, '/');
  const sourceStem = moduleStem(sourcePath);
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const imports = [
    ...String(file?.content || '').matchAll(
      new RegExp(`^\\s*import(?:\\s+type)?\\s*\\{([^}]*)\\}\\s*from\\s*['"]([^'"]+)['"]`, 'gm'),
    ),
  ];
  return imports.some((match) => {
    if (!new RegExp(`(?:^|[,\\s])${escaped}(?:\\s+as\\s+${escaped})?(?:$|[,\\s])`).test(match[1])) {
      return false;
    }
    if (!match[2].startsWith('.')) return false;
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(importer), match[2]));
    return moduleStem(resolved) === sourceStem;
  });
}

function implementationSearchText(view, name, localText) {
  if (view.context !== 'repo' || !Array.isArray(view.corpusFiles)) return localText;
  const relevant = [localText];
  for (const file of view.corpusFiles) {
    if (String(file.path).replace(/\\/g, '/') === String(view.path).replace(/\\/g, '/')) continue;
    if (importsNameFrom(file, name, view.path)) {
      relevant.push(stripCommentsAndStrings(file.content));
    }
  }
  return relevant.join('\n');
}

function speculativeAbstraction(view) {
  const text = stripCommentsAndStrings(view.content || '');
  if (!text.trim()) return false;

  // Only structural indirection: an interface / abstract class with exactly one
  // implementor in view. Naming conventions (createX, FooFactory) are not
  // evidence — createCache + `new Map()` was a 10/10 false positive on ttl-cache.
  const interfaces = [...text.matchAll(/\binterface\s+([A-Za-z_][\w]*)/g)].map((m) => m[1]);
  const abstracts = [...text.matchAll(/\babstract\s+class\s+([A-Za-z_][\w]*)/g)].map((m) => m[1]);
  const names = [...new Set([...interfaces, ...abstracts])];
  if (!names.length) return false;

  for (const name of names) {
    const searchIn = implementationSearchText(view, name, text);
    const implRe = new RegExp(`\\b(?:implements|extends)\\s+${name}\\b`, 'g');
    const impls = [...searchIn.matchAll(implRe)].length;
    if (impls === 1) return true;
    // TypeScript-style: interface name mentioned in exactly one class header.
    const classMentions = [
      ...searchIn.matchAll(
        new RegExp(`\\bclass\\s+([A-Za-z_][\\w]*)[^{]*\\b${name}\\b`, 'g'),
      ),
    ];
    if (classMentions.length === 1) return true;
  }
  return false;
}

let cachedCorpus = null;
let cachedStrippedCorpus = '';
let cachedCorpusIdentifiers = new Map();

function strippedCorpus(corpus) {
  if (corpus === cachedCorpus) return cachedStrippedCorpus;
  cachedCorpus = corpus;
  cachedStrippedCorpus = stripCommentsAndStrings(corpus);
  cachedCorpusIdentifiers = new Map();
  for (const match of cachedStrippedCorpus.matchAll(/\b[A-Za-z_][A-Za-z0-9_]*\b/g)) {
    cachedCorpusIdentifiers.set(match[0], (cachedCorpusIdentifiers.get(match[0]) || 0) + 1);
  }
  return cachedStrippedCorpus;
}

function exportedUnused(view) {
  // Not decidable on a single write: every module's public API looks unused
  // inside its own file. Requires a cross-file corpus (diff/repo only).
  if (view.corpus == null) return false;
  const text = stripCommentsAndStrings(view.content || '');
  const searchIn = strippedCorpus(view.corpus);
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
    // Declaration only — no other reference across the corpus.
    if ((cachedCorpusIdentifiers.get(name) || 0) <= 1) return true;
  }
  return false;
}

function newConfigSurface(view) {
  const text = stripCommentsAndStrings(view.addedContent || '');
  if (!text.trim()) return false;
  // process.env / getenv are often the requested surface (config-fallback: 10/10
  // FP). Flag new config *frameworks* instead — weight that a few lines would not.
  return (
    /\b(?:config\.get|getConfig|defineConfig|Convict|ConvictSchema)\b/.test(text) ||
    /\b(?:nconf|cosmiconfig(?:Sync)?)\b/.test(text) ||
    /\brc\s*\(/.test(text)
  );
}

function unusedDefaultParam(view) {
  const text = stripCommentsAndStrings(view.content || '');
  // Defaulted params that never appear again in the file — not "no named call
  // site" (that fired on every requested options bag: retry-backoff, ttl-cache).
  const paramLists = [
    ...[...text.matchAll(/function\s+[A-Za-z_][\w]*\s*\(([^)]*)\)/g)].map((m) => m[1]),
    ...[
      ...text.matchAll(
        /(?:const|let)\s+[A-Za-z_][\w]*\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
      ),
    ].map((m) => m[1]),
  ];
  for (const list of paramLists) {
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
    // The substantive-line filter understands JS/TS comments and strings. Do
    // not pretend that grammar is portable to languages the signal cannot parse.
    extensions: JS_EXTENSIONS,
    needsContent: true,
    message: 'Offcut: large first write — name the cheapest version of this.',
    check: (view) =>
      view.pathExists === false &&
      lineCount(view.content) > LARGE_FIRST_WRITE_LINES &&
      substantiveLineCount(view.content) > LARGE_FIRST_WRITE_LINES,
  },
  {
    id: 'new-dependency',
    phase: 'pre',
    contexts: ['write', 'diff'],
    // Not 'repo': this asks "was this ADDED?", which needs a change to
    // compare against. In a repo audit every package.json has dependencies
    // and every Vite project has a vite.config.js, so it fired on 4/6
    // findings in a real 259-file repo (sponsorsync, 2026-08-25).
    shapes: 'both',
    extensions: DEP_EXTENSIONS,
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
    extensions: JS_EXTENSIONS,
    needsContent: true,
    message:
      'Offcut: one implementation — is the indirection carrying its weight?',
    check: speculativeAbstraction,
  },
  // config-for-constant deleted (Phase 7): syntax match on ALLCAPS / "key": fired on
  // 47.9% of real files (100% of .json). Knowing a value is never read needs a
  // cross-file corpus and language-aware config parsing we do not have at scan time.
];

/** @type {Signal[]} */
export const POST_SIGNALS = [
  {
    id: 'exported-unused',
    phase: 'post',
    // Write context has no corpus — not decidable at write time (was 20/20 FP).
    // Not 'diff' either: a newly added export has no caller *inside the diff*,
    // so this fired on 27.4% of accepted solutions in diff context (measured
    // 2026-08-25) — every new public function. Same root cause, one context
    // over. Only a repo audit has enough corpus for the question to be
    // decidable at all.
    contexts: ['repo'],
    shapes: 'both',
    extensions: JS_EXTENSIONS,
    needsContent: true,
    message:
      'Offcut: exported symbol has no other reference in the scanned scope — did anyone ask for it?',
    check: exportedUnused,
  },
  {
    id: 'new-config-surface',
    phase: 'post',
    contexts: ['write', 'diff'],
    // Not 'repo': this asks "was this ADDED?", which needs a change to
    // compare against. In a repo audit every package.json has dependencies
    // and every Vite project has a vite.config.js, so it fired on 4/6
    // findings in a real 259-file repo (sponsorsync, 2026-08-25).
    shapes: 'both',
    extensions: JS_EXTENSIONS,
    needsContent: true,
    message: 'Offcut: new configuration surface — was this requested?',
    check: newConfigSurface,
  },
  // single-call-wrapper deleted (Phase 7.5): fires on the accepted lean solution
  // for id-hex (`return randomBytes(16).toString('hex')`) and on conventional
  // helpers in real code (3.1%). Pattern match is correct; the pattern is not a
  // defect. No text-level tune separates keep-worthy wrappers from inline-worthy ones.
  {
    id: 'unused-default-param',
    phase: 'post',
    contexts: ['write', 'diff', 'repo'],
    shapes: 'both',
    extensions: JS_EXTENSIONS,
    needsContent: true,
    message:
      'Offcut: parameter has a default but is never read — was the flexibility needed?',
    check: unusedDefaultParam,
  },
];

export const ALL_SIGNALS = [...PRE_SIGNALS, ...POST_SIGNALS];

/**
 * @param {string | null | undefined} filePath
 * @returns {string | null} lowercased extension including dot, '' if none, null if no path
 */
export function pathExtension(filePath) {
  if (filePath == null || filePath === '') return null;
  const base = basenameOf(filePath);
  const i = base.lastIndexOf('.');
  if (i <= 0) return '';
  return base.slice(i).toLowerCase();
}

/**
 * @param {Signal} signal
 * @param {string | null | undefined} filePath
 */
export function extensionApplies(signal, filePath) {
  const exts = signal?.extensions;
  if (exts == null || exts === '*') return true;
  if (!Array.isArray(exts)) return true;
  if (exts.includes('*')) return true;
  // Unknown path (some write hooks): do not suppress — check() still gates.
  if (filePath == null || filePath === '') return true;
  const ext = pathExtension(filePath);
  return ext != null && exts.includes(ext);
}

/**
 * Run signals against a view. Returns findings in definition order.
 * Filters by shape, truncation, `contexts` (default: write), and `extensions`.
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
    if (!extensionApplies(signal, view.path)) continue;
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
