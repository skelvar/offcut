import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const task = path.join(root, 'bench', 'close-task');

function runNode(args, cwd) {
  return spawnSync(process.execPath, args, { cwd, encoding: 'utf8' });
}

test('close benchmark is a realistic hidden-oracle release task', () => {
  assert.equal(fs.existsSync(path.join(root, 'skills', 'offcut-close')), false);
  assert.equal(fs.existsSync(path.join(root, 'plugins', 'offcut', 'skills', 'offcut-close')), false);
  assert.ok(fs.existsSync(path.join(task, 'offcut-close', 'SKILL.md')));

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-close-task-'));
  try {
    fs.cpSync(path.join(task, 'seed'), work, { recursive: true });

    const visible = runNode(['--test'], work);
    assert.equal(visible.status, 0, visible.stderr || visible.stdout);

    const hiddenBefore = runNode([path.join(task, 'accept.mjs'), work], root);
    assert.notEqual(hiddenBefore.status, 0, 'seed must not already satisfy the hidden release contract');
    assert.match(hiddenBefore.stderr, /concurrent|conflict/i);

    fs.copyFileSync(
      path.join(task, 'reference', 'checkout.js'),
      path.join(work, 'src', 'checkout.js'),
    );
    const hiddenAfter = runNode([path.join(task, 'accept.mjs'), work], root);
    assert.equal(hiddenAfter.status, 0, hiddenAfter.stderr || hiddenAfter.stdout);
    assert.match(hiddenAfter.stdout, /CLOSE_ACCEPT_OK/);

    fs.copyFileSync(
      path.join(task, 'partial', 'checkout.js'),
      path.join(work, 'src', 'checkout.js'),
    );
    const partial = spawnSync(
      process.execPath,
      [path.join(task, 'accept.mjs'), work],
      { cwd: root, encoding: 'utf8', timeout: 2_000 },
    );
    assert.notEqual(partial.error?.code, 'ETIMEDOUT', 'partial repair deadlocked the oracle');
    assert.notEqual(partial.status, 0, 'partial repair must fail the oracle');
    assert.match(partial.stderr, /IDEMPOTENCY_CONFLICT|different payload/i);

    const prompt = fs.readFileSync(path.join(task, 'prompt.txt'), 'utf8');
    assert.match(prompt, /concurrent calls/i);
    assert.match(prompt, /different payload/i);
    assert.match(prompt, /failed (?:attempt|creation)/i);
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
});

test('close benchmark dry plan pins matched Cursor resources', () => {
  const planned = runNode([path.join(task, 'run-cursor.mjs'), '--plan'], root);
  assert.equal(planned.status, 0, planned.stderr || planned.stdout);
  const plan = JSON.parse(planned.stdout);
  assert.equal(plan.model, 'grok-4.6');
  assert.equal(plan.reasoningEffort, 'xhigh');
  assert.deepEqual(plan.arms, ['baseline', 'review-baseline', 'offcut-close']);
  assert.equal(plan.task, 'checkout-idempotency-release');
  assert.equal(plan.sameCoreTaskPrompt, true);
  assert.equal(plan.hiddenOracle, true);
  assert.match(plan.oracleSha256, /^[a-f0-9]{64}$/);
  assert.match(plan.closeSkillSha256, /^[a-f0-9]{64}$/);
  assert.ok(plan.agentTimeoutMs > 0);
});
