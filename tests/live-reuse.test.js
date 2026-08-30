import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_LIB = path.join(ROOT, 'bench', 'live-reuse-lib.mjs');

test('live harness pure logic validates arms, counterbalances reps and classifies added components', async () => {
  assert.equal(fs.existsSync(LIVE_LIB), true, 'bench/live-reuse-lib.mjs is required');
  const { classifyDiff, parseLiveArgs, liveSchedule } = await import('../bench/live-reuse-lib.mjs');

  assert.deepEqual(parseLiveArgs(['busy-helper']), {
    task: 'busy-helper',
    arms: ['off', 'full'],
    reps: 1,
  });
  assert.throws(() => parseLiveArgs(['busy-helper', 'ful']), /bad arm/i);
  assert.deepEqual(
    liveSchedule('busy-helper', ['off', 'full'], 2).map(({ arm, rep }) => ({ arm, rep })),
    [
      { arm: 'off', rep: 1 },
      { arm: 'full', rep: 1 },
      { arm: 'full', rep: 2 },
      { arm: 'off', rep: 2 },
    ],
  );
  assert.equal(
    classifyDiff('+export function AsyncActionLabel() {}\n').new_component,
    true,
  );
});

function writeToolbar(root, source) {
  const target = path.join(root, 'src', 'components', 'editor');
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(root, 'package.json'), '{"type":"module"}\n');
  fs.writeFileSync(path.join(target, 'Toolbar.js'), source);
}

function runReactAccept(root) {
  return spawnSync(
    process.execPath,
    [path.join(ROOT, 'bench', 'live-tickets', 'async-action-pattern', 'accept.mjs'), root],
    { encoding: 'utf8', cwd: root },
  );
}

test('live React acceptance preserves component children that render to strings', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-live-accept-'));
  try {
    writeToolbar(
      root,
      `
function Label({ children }) { return children; }
function Pressable({ disabled, children }) {
  return { type: 'button', props: { disabled }, children: [children] };
}
export function Toolbar({ saving }) {
  return {
    type: 'nav', props: {}, children: [
      { type: 'button', props: { disabled: false }, children: ['Cancel'] },
      { type: Pressable, props: { disabled: saving }, children: [
        { type: Label, props: { children: saving ? 'Saving…' : 'Save' }, children: [] },
      ] },
    ],
  };
}
`,
    );
    const result = runReactAccept(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('live React acceptance requires the Save control itself to disable', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'offcut-live-save-'));
  try {
    writeToolbar(
      root,
      `
export function Toolbar({ saving }) {
  return {
    type: 'nav', props: {}, children: [
      { type: 'button', props: { disabled: saving }, children: ['Cancel'] },
      { type: 'button', props: { disabled: false }, children: [saving ? 'Saving…' : 'Save'] },
    ],
  };
}
`,
    );
    const result = runReactAccept(root);
    assert.notEqual(result.status, 0, 'disabled Cancel must not satisfy the Save requirement');
    assert.match(result.stderr || result.stdout, /save.*disabled/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
