#!/usr/bin/env node
// Run one bench task under one arm. Captures diff + transcript into an opaque dir.
//
//   node bench/run.mjs --task config-fallback --arm off --rep 1 --stub lean
//   node bench/run.mjs --task config-fallback --arm full --rep 1
//
// Paid mode invokes Claude Code. Dry-run --stub avoids model cost.

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import {
  BENCH_ROOT,
  MODEL_ID,
  RUNS_DIR,
  appendManifest,
  assertEmptyDir,
  buildHooksSettings,
  captureDiff,
  copyTree,
  initGitRepo,
  loadTask,
  opaqueId,
  tmpName,
  writeMode,
} from './lib.mjs';
import { scoreRun } from './score.mjs';

function parseArgs(argv) {
  const out = {
    task: null,
    arm: null,
    rep: 1,
    stub: null,
    model: MODEL_ID,
    keepWork: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i];
    else if (a === '--arm') out.arm = argv[++i];
    else if (a === '--rep') out.rep = Number(argv[++i]);
    else if (a === '--stub') out.stub = argv[++i];
    else if (a === '--model') out.model = argv[++i];
    else if (a === '--keep-work') out.keepWork = true;
    else if (a === '--help') out.help = true;
  }
  return out;
}

function runAccept(acceptPath, workDir) {
  const r = spawnSync(process.execPath, [acceptPath, workDir], {
    encoding: 'utf8',
    cwd: workDir,
    env: { ...process.env },
  });
  return {
    ok: r.status === 0,
    exitCode: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    error: r.status === 0 ? null : (r.stderr || r.stdout || `exit ${r.status}`).trim(),
  };
}

function runStub(taskId, style, workDir) {
  const stub = path.join(BENCH_ROOT, 'stub-agent.mjs');
  const r = spawnSync(
    process.execPath,
    [stub, '--task', taskId, '--style', style, '--cwd', workDir],
    { encoding: 'utf8', cwd: workDir },
  );
  return {
    ok: r.status === 0,
    exitCode: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    transcript: (r.stdout || '') + (r.stderr || ''),
  };
}

function runClaude({ workDir, prompt, stateDir, settingsPath, model }) {
  const env = {
    ...process.env,
    OFFCUT_STATE_DIR: stateDir,
  };
  // Do not inherit a polluted real state dir path.
  const args = [
    '-p',
    prompt,
    '--model',
    model,
    '--permission-mode',
    'bypassPermissions',
    '--output-format',
    'json',
    '--settings',
    settingsPath,
  ];
  const r = spawnSync('claude', args, {
    encoding: 'utf8',
    cwd: workDir,
    env,
    maxBuffer: 32 * 1024 * 1024,
    timeout: 10 * 60 * 1000,
  });
  let parsed = null;
  let modelId = model;
  try {
    parsed = JSON.parse(r.stdout || '{}');
    const usage = parsed.modelUsage || {};
    const keys = Object.keys(usage);
    if (keys.length) modelId = keys[0];
    else if (parsed.model) modelId = parsed.model;
  } catch {
    // keep raw
  }
  return {
    ok: r.status === 0 && !(parsed && parsed.is_error),
    exitCode: r.status,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
    transcript: r.stdout || '',
    modelId,
    parsed,
    error:
      r.error?.message ||
      (r.status !== 0 ? (r.stderr || `claude exit ${r.status}`).trim() : null),
  };
}

export function runOne(opts) {
  const { task: taskId, arm, rep, stub, model, keepWork } = opts;
  if (!taskId || !arm) throw new Error('--task and --arm required');
  if (arm !== 'off' && arm !== 'full') throw new Error(`bad arm: ${arm}`);

  const task = loadTask(taskId);
  const runId = opaqueId();
  const runDir = path.join(RUNS_DIR, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const stateDir = tmpName('offcut-bench-state-');
  const workParent = tmpName('offcut-bench-work-');
  const workDir = path.join(workParent, 'repo');

  const record = {
    run_id: runId,
    task_id: taskId,
    arm,
    rep,
    stub: stub || null,
    model_requested: model,
    model_id: null,
    host: 'claude-code',
    host_version: null,
    date: new Date().toISOString().slice(0, 10),
    prompt_sha256: task.promptSha256,
    prompt_path: path.relative(BENCH_ROOT, path.join(task.dir, 'prompt.txt')).replace(/\\/g, '/'),
    error: null,
    retried: false,
  };

  try {
    // Isolation asserts
    writeMode(stateDir, arm);
    const stateFiles = fs.readdirSync(stateDir).sort();
    if (!stateFiles.includes('active') || !stateFiles.includes('default')) {
      throw new Error('state dir missing active/default after writeMode');
    }
    // Assert no fired-* leakage
    if (stateFiles.some((f) => f.startsWith('fired-') || f.startsWith('turn-'))) {
      throw new Error('state dir not clean');
    }

    copyTree(task.repoDir, workDir);
    initGitRepo(workDir);

    // Verify prompt bytes match task file
    const promptBytes = fs.readFileSync(path.join(task.dir, 'prompt.txt'));
    if (promptBytes.toString('utf8') !== task.prompt) {
      throw new Error('prompt byte mismatch');
    }
    fs.writeFileSync(path.join(runDir, 'prompt.txt'), promptBytes);
    fs.writeFileSync(
      path.join(runDir, 'prompt.sha256'),
      task.promptSha256 + '\n',
    );

    const settings = buildHooksSettings();
    const settingsPath = path.join(runDir, 'settings.json');
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    let agent;
    if (stub) {
      agent = runStub(taskId, stub, workDir);
      record.model_id = `stub:${stub}`;
      record.host_version = 'stub';
    } else {
      const ver = spawnSync('claude', ['--version'], { encoding: 'utf8' });
      record.host_version = (ver.stdout || ver.stderr || '').trim();
      agent = runClaude({
        workDir,
        prompt: task.prompt,
        stateDir,
        settingsPath,
        model,
      });
      record.model_id = agent.modelId || model;
    }

    fs.writeFileSync(path.join(runDir, 'transcript.txt'), agent.transcript || '');
    if (agent.stdout) fs.writeFileSync(path.join(runDir, 'stdout.json'), agent.stdout);
    if (agent.stderr) fs.writeFileSync(path.join(runDir, 'stderr.txt'), agent.stderr);

    // Snapshot state dir after run (for bleed / challenge evidence)
    const stateAfter = {};
    for (const f of fs.readdirSync(stateDir)) {
      try {
        stateAfter[f] = fs.readFileSync(path.join(stateDir, f), 'utf8');
      } catch {
        stateAfter[f] = null;
      }
    }
    fs.writeFileSync(path.join(runDir, 'state-after.json'), JSON.stringify(stateAfter, null, 2));

    if (!agent.ok && !stub) {
      record.error = agent.error || 'agent failed';
    }

    const diff = captureDiff(workDir);
    fs.writeFileSync(path.join(runDir, 'diff.patch'), diff);

    // Keep a copy of the worktree for scoring corpus (exports across files)
    const workCopy = path.join(runDir, 'work');
    copyTree(workDir, workCopy);
    // drop .git from score corpus copy weight — still fine either way
    fs.rmSync(path.join(workCopy, '.git'), { recursive: true, force: true });

    const accept = runAccept(task.acceptPath, workDir);
    fs.writeFileSync(path.join(runDir, 'accept.json'), JSON.stringify(accept, null, 2) + '\n');

    const metrics = scoreRun(runDir);

    // Sealed manifest entry (arm known here; score already wrote metrics without arm)
    appendManifest(record);

    fs.writeFileSync(
      path.join(runDir, 'run.json'),
      JSON.stringify({ ...record, metrics_summary: { task_passed: metrics.task_passed } }, null, 2) +
        '\n',
    );

    return { runId, runDir, record, metrics, accept };
  } finally {
    fs.rmSync(stateDir, { recursive: true, force: true });
    if (!keepWork) fs.rmSync(workParent, { recursive: true, force: true });
  }
}

function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help || !opts.task || !opts.arm) {
    console.log(`Usage:
  node bench/run.mjs --task <id> --arm off|full --rep N [--stub lean|elaborate] [--model ID]

Opaque results land in bench/runs/<id>/. Manifest appends arm mapping to bench/manifest.jsonl.`);
    process.exit(opts.help ? 0 : 2);
  }
  fs.mkdirSync(RUNS_DIR, { recursive: true });
  const result = runOne(opts);
  console.log(
    JSON.stringify(
      {
        run_id: result.runId,
        task_id: opts.task,
        arm: opts.arm,
        task_passed: result.metrics.task_passed,
        files_created: result.metrics.files_created,
        lines_added: result.metrics.lines_added,
        model_id: result.record.model_id,
      },
      null,
      2,
    ),
  );
}

import { fileURLToPath } from 'node:url';
const isMain =
  process.argv[1] &&
  path.resolve(fileURLToPath(import.meta.url)) === path.resolve(process.argv[1]);
if (isMain) main();
