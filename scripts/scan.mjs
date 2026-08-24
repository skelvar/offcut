#!/usr/bin/env node
// Apply hooks/signals.js to a diff or a file set.
// Zero runtime deps. No network, no file writes, no subprocesses, no state.
//
//   node scripts/scan.mjs --diff [file|-]
//   node scripts/scan.mjs <file-or-dir> [file-or-dir...]
//
// Walks all text extensions so audits can cover a tree, but language-specific
// signals declare `extensions` and runSignals skips non-matching paths
// (JSON/Markdown never see export/function/interface checks).

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_SIGNALS, runSignals } from '../hooks/signals.js';

const SKIP_DIRS = new Set([
  '.git',
  'node_modules',
  '.hg',
  '.svn',
  'dist',
  'build',
  'coverage',
  '.next',
  '.turbo',
]);

const TEXT_EXT = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.json',
  '.md',
  '.txt',
  '.toml',
  '.yaml',
  '.yml',
  '.css',
  '.html',
  '.py',
  '.go',
  '.rs',
  '.java',
  '.kt',
  '.swift',
  '.rb',
  '.php',
  '.sh',
  '.ps1',
  '.sql',
  '.env',
  '',
]);

/**
 * @typedef {{
 *   path: string,
 *   signalId: string,
 *   message: string,
 *   phase: string,
 * }} Finding
 */

/**
 * Parse a unified diff into per-file added-content views.
 * @param {string} text
 * @returns {Array<{
 *   path: string,
 *   content: string,
 *   addedContent: string,
 *   pathExists: boolean,
 *   shape: 'full' | 'fragment',
 * }>}
 */
export function parseUnifiedDiff(text) {
  const files = [];
  /** @type {{ path: string, added: string[], isNew: boolean } | null} */
  let current = null;

  const push = () => {
    if (!current) return;
    const added = current.added.join('\n');
    files.push({
      path: current.path,
      content: added,
      addedContent: added,
      pathExists: current.isNew ? false : true,
      // New files are whole-file creates; edits are fragments.
      shape: current.isNew ? /** @type {const} */ ('full') : /** @type {const} */ ('fragment'),
    });
    current = null;
  };

  for (const line of String(text ?? '').split(/\r?\n/)) {
    const git = line.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (git) {
      push();
      current = { path: git[2], added: [], isNew: false };
      continue;
    }
    if (!current) {
      // Bare ---/+++ without diff --git (rare); start a file on +++.
      const plusPlus = line.match(/^\+\+\+\s+(?:b\/)?(.+)$/);
      if (plusPlus && plusPlus[1] !== '/dev/null') {
        current = { path: plusPlus[1], added: [], isNew: false };
      }
      continue;
    }
    if (line.startsWith('new file mode') || line === '--- /dev/null') {
      current.isNew = true;
    }
    const plusPlus = line.match(/^\+\+\+\s+(?:b\/)?(.+)$/);
    if (plusPlus && plusPlus[1] !== '/dev/null') {
      current.path = plusPlus[1];
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.added.push(line.slice(1));
    }
  }
  push();
  return files;
}

/**
 * @param {string} root
 * @param {string[]} out
 */
function walkDir(root, out) {
  let entries;
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (ent.name.startsWith('.') && ent.name !== '.env') {
      if (ent.isDirectory()) continue;
    }
    const full = path.join(root, ent.name);
    if (ent.isDirectory()) {
      if (SKIP_DIRS.has(ent.name)) continue;
      walkDir(full, out);
      continue;
    }
    if (!ent.isFile()) continue;
    const ext = path.extname(ent.name).toLowerCase();
    if (!TEXT_EXT.has(ext) && ent.name !== 'Dockerfile' && ent.name !== 'Makefile') {
      continue;
    }
    out.push(full);
  }
}

/**
 * Expand CLI paths into a flat file list. Directories are walked; no subprocess.
 * @param {string[]} inputs
 * @returns {string[]}
 */
export function collectFiles(inputs, missing = []) {
  const out = [];
  for (const raw of inputs) {
    const p = path.resolve(raw);
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      // Unreadable input is reported, never skipped. A scan that silently
      // covers nothing prints "No findings", which reads as "you are clean".
      missing.push(raw);
      continue;
    }
    if (st.isDirectory()) walkDir(p, out);
    else if (st.isFile()) out.push(p);
    else missing.push(raw);
  }
  return [...new Set(out)].sort();
}

/**
 * Read a UTF-8 text file; return null for missing/binary/unreadable.
 * @param {string} filePath
 * @returns {string | null}
 */
export function readTextFile(filePath) {
  try {
    const buf = fs.readFileSync(filePath);
    if (buf.includes(0)) return null;
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

/**
 * @param {object} viewPartial
 * @param {string | null} corpus
 * @param {'diff' | 'repo'} context
 */
function toView(viewPartial, corpus, context) {
  return {
    path: viewPartial.path ?? null,
    content: viewPartial.content ?? '',
    addedContent: viewPartial.addedContent ?? viewPartial.content ?? '',
    shape: viewPartial.shape ?? 'full',
    pathExists: viewPartial.pathExists ?? true,
    truncated: false,
    context,
    corpus,
  };
}

/**
 * Scan a list of files (repo audit). Ranked by finding count descending.
 * @param {string[]} filePaths
 * @param {{ signals?: typeof ALL_SIGNALS, cwd?: string }} [opts]
 * @returns {Finding[]}
 */
export function scanFiles(filePaths, opts = {}) {
  const signals = opts.signals || ALL_SIGNALS;
  const cwd = opts.cwd || process.cwd();
  /** @type {Array<{ path: string, content: string }>} */
  const loaded = [];
  for (const fp of filePaths) {
    const content = readTextFile(fp);
    if (content == null) continue;
    const rel = path.relative(cwd, fp).replace(/\\/g, '/') || path.basename(fp);
    loaded.push({ path: rel, content });
  }
  const corpus = loaded.map((f) => f.content).join('\n');
  /** @type {Finding[]} */
  const findings = [];
  for (const file of loaded) {
    const view = toView(
      {
        path: file.path,
        content: file.content,
        addedContent: file.content,
        shape: 'full',
        pathExists: true,
      },
      corpus,
      'repo',
    );
    for (const signal of runSignals(signals, view)) {
      findings.push({
        path: file.path,
        signalId: signal.id,
        message: signal.message,
        phase: signal.phase,
      });
    }
  }
  return rankFindings(findings);
}

/**
 * Scan a unified diff (review).
 * @param {string} diffText
 * @param {{ signals?: typeof ALL_SIGNALS }} [opts]
 * @returns {Finding[]}
 */
export function scanDiff(diffText, opts = {}) {
  const signals = opts.signals || ALL_SIGNALS;
  const files = parseUnifiedDiff(diffText);
  const corpus = files.map((f) => f.content).join('\n');
  /** @type {Finding[]} */
  const findings = [];
  for (const file of files) {
    const view = toView(file, corpus, 'diff');
    for (const signal of runSignals(signals, view)) {
      findings.push({
        path: file.path,
        signalId: signal.id,
        message: signal.message,
        phase: signal.phase,
      });
    }
  }
  return rankFindings(findings);
}

/**
 * Rank: more findings per path first, then path, then signal definition order.
 * @param {Finding[]} findings
 * @returns {Finding[]}
 */
export function rankFindings(findings) {
  const counts = new Map();
  for (const f of findings) {
    counts.set(f.path, (counts.get(f.path) || 0) + 1);
  }
  const order = new Map(ALL_SIGNALS.map((s, i) => [s.id, i]));
  return [...findings].sort((a, b) => {
    const ca = counts.get(a.path) || 0;
    const cb = counts.get(b.path) || 0;
    if (cb !== ca) return cb - ca;
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    return (order.get(a.signalId) ?? 0) - (order.get(b.signalId) ?? 0);
  });
}

/**
 * @param {Finding[]} findings
 * @returns {string}
 */
export function formatFindings(findings) {
  if (!findings.length) return 'No Offcut findings.\n';
  const byPath = new Map();
  for (const f of findings) {
    if (!byPath.has(f.path)) byPath.set(f.path, []);
    byPath.get(f.path).push(f);
  }
  const lines = [];
  for (const [p, list] of byPath) {
    lines.push(`${p} (${list.length})`);
    for (const f of list) {
      lines.push(`  [${f.signalId}] ${f.message}`);
    }
  }
  lines.push('');
  return lines.join('\n');
}

/**
 * @param {string[]} argv
 * @param {{ stdin?: string, cwd?: string }} [io]
 * @returns {{ code: number, stdout: string, stderr: string, findings: Finding[] }}
 */
export function runScanCli(argv, io = {}) {
  const args = argv.slice();
  const cwd = io.cwd || process.cwd();
  let stdout = '';
  let stderr = '';

  const diffIdx = args.indexOf('--diff');
  if (diffIdx !== -1) {
    const target = args[diffIdx + 1];
    if (!target) {
      stderr = 'usage: node scripts/scan.mjs --diff <file|->\n';
      return { code: 2, stdout, stderr, findings: [] };
    }
    let text = '';
    if (target === '-') {
      text = io.stdin != null ? String(io.stdin) : fs.readFileSync(0, 'utf8');
    } else {
      try {
        text = fs.readFileSync(path.resolve(cwd, target), 'utf8');
      } catch (err) {
        stderr = `scan: cannot read diff: ${err instanceof Error ? err.message : String(err)}\n`;
        return { code: 2, stdout, stderr, findings: [] };
      }
    }
    const findings = scanDiff(text);
    stdout = formatFindings(findings);
    return { code: 0, stdout, stderr, findings };
  }

  if (args.includes('--help') || args.includes('-h')) {
    stdout =
      'Offcut scanner - applies the shared signal set to files or a diff.\n' +
      '\n' +
      'usage:\n' +
      '  node scripts/scan.mjs <file-or-dir>...   scan files (repo context)\n' +
      '  node scripts/scan.mjs --diff <file|->    scan a unified diff\n' +
      '  node scripts/scan.mjs --help             this message\n' +
      '\n' +
      'Reads only. No network, no file writes, no subprocesses, no Offcut state.\n' +
      'Exit 0 = scanned successfully, 2 = bad arguments or unreadable input.\n';
    return { code: 0, stdout, stderr, findings: [] };
  }

  const paths = args.filter((a) => a !== '--');
  if (!paths.length) {
    stderr =
      'usage: node scripts/scan.mjs --diff [file|-]\n' +
      '       node scripts/scan.mjs <file-or-dir>...\n';
    return { code: 2, stdout, stderr, findings: [] };
  }

  const missing = [];
  const files = collectFiles(paths.map((p) => path.resolve(cwd, p)), missing);
  if (missing.length) {
    stderr = missing.map((m) => `scan: no such file or directory: ${m}\n`).join('');
    return { code: 2, stdout, stderr, findings: [] };
  }
  const findings = scanFiles(files, { cwd });
  stdout = formatFindings(findings);
  return { code: 0, stdout, stderr, findings };
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const result = runScanCli(process.argv.slice(2));
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.code);
}
