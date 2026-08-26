#!/usr/bin/env node
// Real-code negative corpus: fire rates over published, reviewed projects.
//
//   node bench/realcode.mjs                 # scan the default corpus
//   node bench/realcode.mjs <dir> [dir...]  # scan specific trees
//
// Why this exists: the labeled bench corpus (bench/fp.mjs) scores every signal
// at 0/95, but those solutions are 10-30 lines, single-module, comment-free.
// Measured 2026-08-25, the same signals fired on 51.1% of files in ordinary
// third-party code — almost all from one broken signal.
//
// Treat every fire here as suspect. This corpus is unlabeled — the code is
// merely published and reviewed, not certified free of over-engineering — so
// the number to watch is the RATE and its trend, not any single finding.
//
// The corpus is whatever happens to be installed on the measuring machine, so
// most of it is Offcut's own source and one project is the tool Offcut is to
// be benchmarked against. Neither is an independent sample of third-party
// code, so every project is classified and only the independent group's rate
// is publishable. See `independence()`.
//
// Per-project corpora: exported-unused needs cross-file text, but joining
// every project's files together is meaningless (cross-project references).
// Each project gets its own concatenated corpus.
//
// Zero deps. Read-only. No network.

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { ALL_SIGNALS, runSignals, extensionApplies } from '../hooks/signals.js';
import { collectFiles, readTextFile } from '../scripts/scan.mjs';

/**
 * Signals that can fire in a repo audit at all. The corpus is mostly JSON,
 * Markdown and shell, which no repo-context signal declares, so a rate over
 * every file understates the rate on the files actually examined.
 */
const REPO_SIGNALS = ALL_SIGNALS.filter((s) => s.contexts.includes('repo'));

/**
 * Could any repo-context signal fire on this path, ignoring content?
 * @param {string} filePath
 */
function isEligible(filePath) {
  return REPO_SIGNALS.some((s) => extensionApplies(s, filePath));
}

/**
 * Offcut's own source, in any copy: the working tree, the installed plugin, and
 * any probe marketplace left in the cache by an earlier phase. Code written to
 * satisfy these signals cannot measure how they behave on code that was not.
 */
const SELF_RE = /^offcut([-@]|$)/;

/**
 * The tool Offcut is to be benchmarked against. Our own false-positive rate,
 * measured partly over the comparison subject, is not an independent sample of
 * either — so it is scored as its own group and kept out of the headline.
 */
const SUBJECT_RE = /^ponytail([-@]|$)/;

/**
 * @param {string} projectName
 * @returns {'self' | 'subject' | 'independent'}
 */
export function independence(projectName) {
  if (SELF_RE.test(projectName)) return 'self';
  if (SUBJECT_RE.test(projectName)) return 'subject';
  return 'independent';
}

/** Group order for reporting: the headline first. */
const GROUPS = /** @type {const} */ (['independent', 'self', 'subject']);

const GROUP_LABELS = {
  independent: 'independent (third-party)',
  self: "self (Offcut's own source)",
  subject: 'subject (benchmark comparison)',
};

/**
 * @typedef {'self' | 'subject' | 'independent'} Independence
 * @typedef {{ name: string, dirs?: string[], files?: string[] }} ProjectInput
 * @typedef {{ name: string, files: string[] }} Project
 * @typedef {{ projects: number, files: number, eligible: number, fired: number }} GroupTally
 * @typedef {{
 *   total: number,
 *   filesWithFindings: number,
 *   bySignal: Map<string, number>,
 *   byExt: Map<string, { files: number, fires: number }>,
 *   exportedUnusedExercised: boolean,
 *   exportedUnusedRate: number,
 *   projects: number,
 *   eligible: number,
 *   eligibleWithFindings: number,
 *   perProject: Array<{ name: string, files: number, group: Independence }>,
 *   byGroup: Record<Independence, GroupTally>,
 * }} RealCodeReport
 */

/**
 * Default corpus roots. Offcut's own source is one project; each
 * marketplace/plugin pair under ~/.claude/plugins/cache is another, with all
 * of that plugin's cached versions scanned together.
 * @returns {ProjectInput[]}
 */
export function defaultProjectInputs() {
  const here = path.resolve(import.meta.dirname, '..');
  /** @type {ProjectInput[]} */
  const inputs = [
    {
      name: 'offcut',
      // Include tests/ so exported-unused callers there are in corpus.
      dirs: [
        path.join(here, 'hooks'),
        path.join(here, 'scripts'),
        path.join(here, 'bench'),
        path.join(here, 'tests'),
      ].filter((d) => fs.existsSync(d)),
    },
  ];
  const plugins = path.join(os.homedir(), '.claude', 'plugins', 'cache');
  if (fs.existsSync(plugins)) {
    for (const plugin of fs.readdirSync(plugins, { withFileTypes: true })) {
      if (!plugin.isDirectory()) continue;
      const pluginDir = path.join(plugins, plugin.name);
      let versions;
      try {
        versions = fs.readdirSync(pluginDir, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const ver of versions) {
        if (!ver.isDirectory()) continue;
        // A version dir literally named .git is a git internal, not a project.
        // walkDir only skips .git as a CHILD, so rooting a scan inside one
        // silently feeds git objects into the denominator.
        if (ver.name === '.git' || ver.name === 'node_modules') continue;
        inputs.push({
          name: `${plugin.name}@${ver.name}`,
          dirs: [path.join(pluginDir, ver.name)],
        });
      }
    }
  }
  return inputs;
}

/**
 * Expand project inputs into flat file lists. Accepts either `{name, dirs}` or
 * `{name, files}` (for tests).
 * @param {ProjectInput[]} inputs
 * @returns {Project[]}
 */
export function buildProjects(inputs) {
  /** @type {Project[]} */
  const out = [];
  for (const input of inputs) {
    if (!input || !input.name) continue;
    let files = [];
    if (Array.isArray(input.files) && input.files.length) {
      files = [...input.files];
    } else if (Array.isArray(input.dirs) && input.dirs.length) {
      files = collectFiles(input.dirs.filter((d) => d && fs.existsSync(d)));
    }
    out.push({ name: input.name, files });
  }
  return out;
}

/**
 * Scan projects with a per-project corpus so exported-unused is exercised.
 * @param {Project[]} projects
 * @returns {RealCodeReport}
 */
export function scanRealCode(projects) {
  const byExt = new Map();
  const bySignal = new Map();
  const filesWithFindings = new Set();
  const perProject = [];
  /** @type {Record<Independence, GroupTally>} */
  const byGroup = Object.fromEntries(
    GROUPS.map((g) => [g, { projects: 0, files: 0, eligible: 0, fired: 0 }]),
  );
  let total = 0;
  let eligible = 0;
  let eligibleWithFindings = 0;
  let exportedUnusedExercised = false;

  for (const project of projects) {
    const group = independence(project.name);
    const tally = byGroup[group];
    tally.projects += 1;
    /** @type {Array<{ path: string, content: string }>} */
    const loaded = [];
    for (const file of project.files) {
      const content = readTextFile(file);
      if (content == null) continue;
      loaded.push({ path: file, content });
    }
    const corpus = loaded.map((f) => f.content).join('\n');
    if (loaded.length) exportedUnusedExercised = true;
    perProject.push({ name: project.name, files: loaded.length, group });

    for (const file of loaded) {
      total += 1;
      tally.files += 1;
      const isElig = isEligible(file.path);
      if (isElig) {
        eligible += 1;
        tally.eligible += 1;
      }
      const ext = path.extname(file.path).toLowerCase() || '(none)';
      const view = {
        path: file.path,
        content: file.content,
        addedContent: file.content,
        shape: 'full',
        pathExists: true,
        truncated: false,
        context: 'repo',
        corpus,
      };
      const hits = runSignals(ALL_SIGNALS, view);
      if (!byExt.has(ext)) byExt.set(ext, { files: 0, fires: 0 });
      byExt.get(ext).files += 1;
      if (hits.length) {
        filesWithFindings.add(file.path);
        if (isElig) {
          eligibleWithFindings += 1;
          tally.fired += 1;
        }
        byExt.get(ext).fires += 1;
        for (const h of hits) bySignal.set(h.id, (bySignal.get(h.id) || 0) + 1);
      }
    }
  }

  const exportedUnusedCount = bySignal.get('exported-unused') || 0;
  return {
    total,
    filesWithFindings: filesWithFindings.size,
    bySignal,
    byExt,
    exportedUnusedExercised,
    exportedUnusedRate: total ? exportedUnusedCount / total : 0,
    projects: projects.length,
    eligible,
    eligibleWithFindings,
    perProject,
    byGroup,
  };
}

/**
 * CLI roots: each argument directory is one project (not split further).
 * @param {string[]} dirs
 * @returns {ProjectInput[]}
 */
export function projectsFromCliDirs(dirs) {
  return dirs.map((d) => ({
    name: path.basename(path.resolve(d)) || d,
    dirs: [path.resolve(d)],
  }));
}

/**
 * @param {RealCodeReport} report
 * @param {string[]} rootLabels
 */
export function formatRealCodeReport(report, rootLabels = []) {
  const { total, filesWithFindings, bySignal, byExt, eligible, eligibleWithFindings } = report;
  const pct = (n) => (total ? ((n / total) * 100).toFixed(1) : '0.0');
  const lines = [];
  lines.push('# Real-code corpus\n');
  if (rootLabels.length) {
    lines.push(`roots:\n${rootLabels.map((t) => '  ' + t).join('\n')}\n`);
  }
  if (report.perProject.length) {
    lines.push('## Corpus composition\n');
    lines.push('| project | files | independence |');
    lines.push('|---|---:|---|');
    for (const p of [...report.perProject].sort((a, b) => b.files - a.files)) {
      lines.push(`| ${p.name} | ${p.files} | ${p.group} |`);
    }
    lines.push('');
  }
  lines.push(`projects: ${report.projects}`);
  lines.push(`files scanned: ${total}`);
  lines.push(
    `files with >=1 finding: ${filesWithFindings} (${pct(filesWithFindings)}%)\n`,
  );
  // The all-files rate is the number that flatters: most of the corpus is a
  // file type no repo-context signal declares, so it cannot fire by design.
  const eligRate = eligible ? ((eligibleWithFindings / eligible) * 100).toFixed(1) : '0.0';
  lines.push(
    `eligible files (a repo signal declares the extension): ${eligible} of ${total}`,
  );
  lines.push(`eligible files with >=1 finding: ${eligibleWithFindings} (${eligRate}%)\n`);

  // Rates are always printed as "n of m", never a bare percentage: the whole
  // reason this section exists is that a percentage got quoted without its
  // denominator, and 88% of the eligible denominator is Offcut's own code.
  lines.push('## Independence\n');
  lines.push('| group | projects | eligible files | fired | rate |');
  lines.push('|---|---:|---:|---:|---:|');
  for (const g of GROUPS) {
    const t = report.byGroup[g];
    const r = t.eligible ? ((t.fired / t.eligible) * 100).toFixed(1) + '%' : 'n/a';
    lines.push(
      `| ${GROUP_LABELS[g]} | ${t.projects} | ${t.eligible} | ${t.fired} | ${r} |`,
    );
  }
  const ind = report.byGroup.independent;
  const indRate = ind.eligible ? ((ind.fired / ind.eligible) * 100).toFixed(1) : '0.0';
  lines.push('');
  lines.push(
    `**The only publishable rate** is over independent eligible files: ` +
      `${ind.fired} of ${ind.eligible} (${indRate}%), across ${ind.projects} projects.`,
  );
  lines.push(
    'The self and subject groups are reported for transparency and must not be ' +
      'blended into a published figure.\n',
  );
  lines.push('## Fire rate per signal\n');
  lines.push('| signal | files fired | rate |');
  lines.push('|---|---:|---:|');
  for (const s of ALL_SIGNALS) {
    const n = bySignal.get(s.id) || 0;
    lines.push(`| ${s.id} | ${n} | ${pct(n)}% |`);
  }
  lines.push('');
  lines.push(
    `exported-unused exercised: ${report.exportedUnusedExercised ? 'yes' : 'no'} ` +
      `(per-project corpus; rate ${pct(bySignal.get('exported-unused') || 0)}%)\n`,
  );
  lines.push('## By file type\n');
  lines.push('| ext | files | files fired | rate |');
  lines.push('|---|---:|---:|---:|');
  for (const [ext, v] of [...byExt].sort((a, b) => b[1].fires - a[1].fires).slice(0, 12)) {
    const r = v.files ? ((v.fires / v.files) * 100).toFixed(1) : '0.0';
    lines.push(`| ${ext} | ${v.files} | ${v.fires} | ${r}% |`);
  }
  const noisy = [...bySignal].filter(([, n]) => n / Math.max(total, 1) > 0.2);
  if (noisy.length) {
    lines.push('\n## Over threshold (>20% of files)\n');
    for (const [id, n] of noisy.sort((a, b) => b[1] - a[1])) {
      lines.push(
        `- **${id}** — ${n} files (${pct(n)}%). A signal this loud cannot be acted on.`,
      );
    }
  }
  return lines.join('\n') + '\n';
}

const isMain =
  process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  const cliDirs = process.argv.slice(2).filter((a) => !a.startsWith('-'));
  const inputs = cliDirs.length
    ? projectsFromCliDirs(cliDirs)
    : defaultProjectInputs();
  const projects = buildProjects(inputs);
  const report = scanRealCode(projects);
  const labels = cliDirs.length
    ? cliDirs.map((d) => path.resolve(d))
    : inputs.map((i) => i.name + (i.dirs ? ` (${i.dirs.length} dirs)` : ''));
  process.stdout.write(formatRealCodeReport(report, labels));
}
