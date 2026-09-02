#!/usr/bin/env node
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const taskDir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(taskDir, '..', '..');
const hostHome = process.env.USERPROFILE || process.env.HOME;
const oracleSha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(taskDir, 'accept.mjs')))
  .digest('hex');
const closeSkillSha256 = crypto
  .createHash('sha256')
  .update(fs.readFileSync(path.join(taskDir, 'offcut-close', 'SKILL.md')))
  .digest('hex');
const plan = {
  task: 'checkout-idempotency-release',
  arms: ['baseline', 'review-baseline', 'offcut-close'],
  model: 'grok-4.6',
  reasoningEffort: 'xhigh',
  sameCoreTaskPrompt: true,
  hiddenOracle: true,
  oracleSha256,
  closeSkillSha256,
  maxTurns: 18,
  agentTimeoutMs: 10 * 60 * 1_000,
};

if (!process.argv.includes('--run')) {
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  process.exit(0);
}

const agentCandidates = [
  path.join(hostHome, '.grok', 'bin', 'agent.exe'),
  path.join(hostHome, '.local', 'bin', 'agent.exe'),
];
const agent = agentCandidates.find((candidate) => fs.existsSync(candidate));
const auth = path.join(hostHome, '.grok', 'auth.json');
if (!agent) throw new Error(`Cursor Agent is not installed: ${agentCandidates.join(', ')}`);
if (!fs.existsSync(auth)) throw new Error('Cursor Agent authentication is unavailable');

const runId = new Date().toISOString().replace(/[:.]/g, '-');
const runRoot = path.join(root, 'bench', 'close-runs', runId);
fs.mkdirSync(runRoot, { recursive: true });
const corePrompt = fs.readFileSync(path.join(taskDir, 'prompt.txt'), 'utf8').trim();
const temporaryHomes = new Set();
const temporaryTargets = new Set();
process.on('exit', () => {
  for (const home of temporaryHomes) fs.rmSync(home, { recursive: true, force: true });
  for (const target of temporaryTargets) fs.rmSync(target, { recursive: true, force: true });
});

function execute(command, args, options = {}) {
  return spawnSync(command, args, {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    ...options,
  });
}

function git(cwd, args) {
  const result = execute('git', args, { cwd });
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout;
}

function parseEvents(stdout) {
  return stdout
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return { type: 'unparsed', text: line };
      }
    });
}

function summarize(events) {
  const result = events.findLast((event) => event.type === 'result') || {};
  const blocks = events
    .filter((event) => event.type === 'assistant')
    .flatMap((event) => event.message?.content || []);
  const tools = blocks.filter((block) => block.type === 'tool_use');
  const terminalCommands = tools
    .filter((block) => block.name === 'run_terminal_command')
    .map((block) => String(block.input?.command || block.input?.cmd || ''));
  const repeatedCommands = terminalCommands.filter(
    (command, index) => command && terminalCommands.indexOf(command) !== index,
  );

  return {
    success: result.subtype === 'success' && !result.is_error,
    stopReason: result.stop_reason || null,
    turns: result.num_turns ?? null,
    toolCalls: tools.length,
    subagents: tools.filter((block) => block.name === 'spawn_subagent').length,
    editCalls: tools.filter((block) => ['search_replace', 'write'].includes(block.name)).length,
    testCommands: terminalCommands.filter((command) => /(?:npm test|node\s+--test)/i.test(command)).length,
    exactRepeatedCommands: [...new Set(repeatedCommands)],
    usage: result.usage || null,
    modelUsage: result.modelUsage || null,
    costUSD: result.total_cost_usd ?? null,
    final: result.result || '',
  };
}

function runArm(name) {
  const target = path.join(runRoot, name, 'repo');
  const grokHome = fs.mkdtempSync(path.join(os.tmpdir(), `offcut-close-${name}-`));
  temporaryHomes.add(grokHome);
  fs.cpSync(path.join(taskDir, 'seed'), target, { recursive: true });
  temporaryTargets.add(target);
  fs.copyFileSync(auth, path.join(grokHome, 'auth.json'));

  if (name === 'offcut-close') {
    const skillTarget = path.join(target, '.grok', 'skills', 'offcut-close');
    fs.mkdirSync(skillTarget, { recursive: true });
    fs.copyFileSync(
      path.join(taskDir, 'offcut-close', 'SKILL.md'),
      path.join(skillTarget, 'SKILL.md'),
    );
  }

  git(target, ['init', '--quiet']);
  git(target, ['config', 'user.name', 'Offcut Bench']);
  git(target, ['config', 'user.email', 'bench@invalid.local']);
  git(target, ['add', '.']);
  git(target, ['commit', '--quiet', '-m', 'seed']);

  const reviewInstruction = [
    'After the implementation, ask one fresh read-only evaluator to review the',
    'acceptance behaviors and current diff using execution evidence. Repair only',
    'required evidence-backed findings, run final verification, then stop.',
  ].join(' ');
  const prompt = name === 'offcut-close'
    ? `/offcut-close\n\n${corePrompt}`
    : name === 'review-baseline'
      ? `${corePrompt}\n\n${reviewInstruction}`
      : corePrompt;
  fs.writeFileSync(path.join(runRoot, name, 'prompt.txt'), `${prompt}\n`);
  const env = {
    ...process.env,
    GROK_HOME: grokHome,
    HOME: grokHome,
    USERPROFILE: grokHome,
  };
  const inspected = execute(agent, ['inspect'], { cwd: target, env });
  fs.writeFileSync(path.join(runRoot, name, 'inspect.txt'), inspected.stdout || inspected.stderr || '');
  if (inspected.status !== 0) throw new Error(inspected.stderr || inspected.stdout);
  const hasCloseSkill = /offcut-close\s+(?:project|repo|local)/i.test(inspected.stdout || '');
  if (hasCloseSkill !== (name === 'offcut-close')) {
    throw new Error(`${name}: isolated skill preflight did not match the treatment`);
  }

  const startedAt = Date.now();
  const result = execute(agent, [
    '-p', prompt,
    '--cwd', target,
    '--model', plan.model,
    '--reasoning-effort', plan.reasoningEffort,
    '--max-turns', String(plan.maxTurns),
    '--output-format', 'streaming-messages-json',
    '--permission-mode', 'bypassPermissions',
    '--no-plan',
    '--disable-web-search',
  ], { cwd: target, env, timeout: plan.agentTimeoutMs, killSignal: 'SIGTERM' });

  fs.writeFileSync(path.join(runRoot, name, 'transcript.jsonl'), result.stdout || '');
  fs.writeFileSync(path.join(runRoot, name, 'stderr.txt'), result.stderr || '');
  fs.writeFileSync(path.join(runRoot, name, 'diff.patch'), git(target, ['diff', '--no-ext-diff']));

  const visible = execute(process.execPath, ['--test'], { cwd: target, timeout: 30_000 });
  const hidden = execute(
    process.execPath,
    [path.join(taskDir, 'accept.mjs'), target],
    { cwd: root, timeout: 30_000 },
  );
  const events = parseEvents(result.stdout || '');
  const summary = {
    arm: name,
    exitCode: result.status,
    timedOut: result.error?.code === 'ETIMEDOUT',
    durationMs: Date.now() - startedAt,
    visibleTests: visible.status === 0,
    hiddenAcceptance: hidden.status === 0,
    hiddenOutput: (hidden.stdout || hidden.stderr || '').trim(),
    ...summarize(events),
  };
  fs.writeFileSync(path.join(runRoot, name, 'summary.json'), `${JSON.stringify(summary, null, 2)}\n`);
  fs.rmSync(grokHome, { recursive: true, force: true });
  temporaryHomes.delete(grokHome);
  fs.rmSync(target, { recursive: true, force: true });
  temporaryTargets.delete(target);
  return summary;
}

const armFlag = process.argv.indexOf('--arm');
const selectedArms = armFlag >= 0 ? [process.argv[armFlag + 1]] : plan.arms;
if (selectedArms.some((arm) => !plan.arms.includes(arm))) {
  throw new Error(`Unknown arm: ${selectedArms.join(', ')}`);
}
const summaries = selectedArms.map(runArm);
const report = { ...plan, executedArms: selectedArms, runId, runRoot, summaries };
fs.writeFileSync(path.join(runRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
