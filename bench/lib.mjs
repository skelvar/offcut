#!/usr/bin/env node
// Shared helpers for the Phase 5 bench. Zero runtime deps.

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { absScript, hookCommand } from '../tools/install.mjs';

export const BENCH_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)));
export const REPO_ROOT = path.resolve(BENCH_ROOT, '..');
export const TASKS_DIR = path.join(BENCH_ROOT, 'tasks');
export const RUNS_DIR = path.join(BENCH_ROOT, 'runs');
export const MANIFEST_PATH = path.join(BENCH_ROOT, 'manifest.jsonl');

// Controls: originals that the corrected detector should stay silent on.
// Invite: tasks that tempt the surviving signals (Phase 7.5).
export const TASK_IDS = [
  'config-fallback', // control
  'retry-backoff', // control
  'ttl-cache', // control
  'shared-validate', // control
  'one-impl-store', // invite: speculative-abstraction
  'slug-ascii', // invite: new-dependency
  'id-hex', // invite: single-call-wrapper
  'greet-opts', // invite: unused-default-param
];

export const CONTROL_TASK_IDS = [
  'config-fallback',
  'retry-backoff',
  'ttl-cache',
  'shared-validate',
];

export const INVITE_TASK_IDS = [
  'one-impl-store',
  'slug-ascii',
  'id-hex',
  'greet-opts',
];

// Phase 0 premise: vague prompts, single arm. Not part of the two-arm TASK_IDS grid.
export const PREMISE_TASK_IDS = ['open-store', 'open-slug', 'open-cache', 'open-report'];
export const PREMISE_ARMS = ['off'];
export const PREMISE_REPS = 3;

export const ARMS = ['off', 'full'];
export const REPS = 5;

/** Exact model ID for paid runs — never a marketing alias. */
export const MODEL_ID = 'claude-sonnet-5';

const HOOK_EVENTS = {
  SessionStart: { script: 'hooks/activate.js', matcher: 'startup|resume|clear|compact|fork' },
  UserPromptSubmit: { script: 'hooks/prompt.js' },
  SubagentStart: { script: 'hooks/subagent.js' },
  PreToolUse: { script: 'hooks/pre-write.js', matcher: 'Write|Edit' },
  PostToolUse: { script: 'hooks/post-write.js', matcher: 'Write|Edit' },
};

export function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

export function opaqueId() {
  return crypto.randomBytes(8).toString('hex');
}

export function listTaskIds() {
  return TASK_IDS.filter((id) => fs.existsSync(path.join(TASKS_DIR, id, 'meta.json')));
}

export function loadTask(taskId) {
  const dir = path.join(TASKS_DIR, taskId);
  const meta = JSON.parse(fs.readFileSync(path.join(dir, 'meta.json'), 'utf8'));
  const prompt = fs.readFileSync(path.join(dir, 'prompt.txt'), 'utf8');
  return {
    id: taskId,
    dir,
    meta,
    prompt,
    promptSha256: sha256(prompt),
    repoDir: path.join(dir, 'repo'),
    acceptPath: path.join(dir, 'accept.mjs'),
  };
}

/** Recursive copy. Skips node_modules and .git. */
export function copyTree(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const ent of fs.readdirSync(src, { withFileTypes: true })) {
    if (ent.name === 'node_modules' || ent.name === '.git') continue;
    const from = path.join(src, ent.name);
    const to = path.join(dest, ent.name);
    if (ent.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

export function assertEmptyDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const entries = fs.readdirSync(dir);
  if (entries.length) {
    throw new Error(`expected empty dir ${dir}, found: ${entries.join(', ')}`);
  }
}

export function writeMode(stateDir, mode) {
  assertEmptyDir(stateDir);
  fs.writeFileSync(path.join(stateDir, 'active'), `${mode}\n`, 'utf8');
  fs.writeFileSync(path.join(stateDir, 'default'), `${mode}\n`, 'utf8');
}

/** Per-run Claude settings with absolute Offcut hook commands. */
export function buildHooksSettings() {
  const hooks = {};
  for (const [event, spec] of Object.entries(HOOK_EVENTS)) {
    const group = {
      hooks: [
        {
          type: 'command',
          command: hookCommand(absScript(spec.script, REPO_ROOT)),
          timeout: 5,
          statusMessage: 'offcut-hooks',
        },
      ],
    };
    if (spec.matcher) group.matcher = spec.matcher;
    hooks[event] = [group];
  }
  return { hooks };
}

export function runGit(workDir, args) {
  return execFileSync('git', args, { cwd: workDir, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] });
}

export function initGitRepo(workDir) {
  runGit(workDir, ['init']);
  runGit(workDir, ['config', 'user.email', 'bench@offcut.local']);
  runGit(workDir, ['config', 'user.name', 'offcut-bench']);
  // Avoid CRLF noise in diffs on Windows
  runGit(workDir, ['config', 'core.autocrlf', 'false']);
  runGit(workDir, ['add', '-A']);
  runGit(workDir, ['commit', '-m', 'fixture']);
}

export function captureDiff(workDir) {
  runGit(workDir, ['add', '-A']);
  // staged + unstaged unified against first commit parent of HEAD? After add, diff --cached vs HEAD
  try {
    return runGit(workDir, ['diff', '--cached', 'HEAD']);
  } catch {
    return runGit(workDir, ['diff', 'HEAD']);
  }
}

export function appendManifest(entry) {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true });
  fs.appendFileSync(MANIFEST_PATH, JSON.stringify(entry) + '\n', 'utf8');
}

export function readManifest() {
  if (!fs.existsSync(MANIFEST_PATH)) return [];
  return fs
    .readFileSync(MANIFEST_PATH, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

export function median(nums) {
  const a = [...nums].filter((n) => typeof n === 'number' && !Number.isNaN(n)).sort((x, y) => x - y);
  if (!a.length) return null;
  const mid = Math.floor(a.length / 2);
  return a.length % 2 ? a[mid] : (a[mid - 1] + a[mid]) / 2;
}

export function interleaveSchedule(taskIds = listTaskIds(), reps = REPS, arms = ARMS) {
  // Interleave arms within each (task, rep): off, full, off, full... across the grid
  // Order: for rep in 0..reps-1, for task in tasks, for arm in rotated(arms, rep)
  const jobs = [];
  for (let rep = 1; rep <= reps; rep++) {
    const armOrder = rep % 2 === 1 ? [...arms] : [...arms].reverse();
    for (const taskId of taskIds) {
      for (const arm of armOrder) {
        jobs.push({ taskId, arm, rep });
      }
    }
  }
  return jobs;
}

export function tmpName(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
