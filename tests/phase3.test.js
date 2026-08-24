// Phase 3 — packaging: command form and installer helpers.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { hookCommand, absScript } from '../tools/install.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('adapters/claude/hooks.json uses single-string commands (no args)', () => {
  const cfg = JSON.parse(
    fs.readFileSync(path.join(root, 'adapters', 'claude', 'hooks.json'), 'utf8'),
  );
  for (const event of Object.keys(cfg.hooks)) {
    for (const group of cfg.hooks[event]) {
      for (const hook of group.hooks) {
        assert.equal(hook.args, undefined, `${event} must not use args (Grok ignores them)`);
        assert.match(hook.command, /\$\{CLAUDE_PLUGIN_ROOT\}\/hooks\//);
        assert.doesNotMatch(hook.command, /^node$/);
      }
    }
  }
});

test('hookCommand: win32 guards on where node; posix on command -v', () => {
  const script = 'D:/rightseam/hooks/activate.js';
  const win = hookCommand(script, 'win32');
  assert.match(win, /^cmd \/c "/);
  assert.match(win, /where node/);
  assert.ok(win.includes(script));

  const posix = hookCommand(script, 'linux');
  assert.match(posix, /command -v node/);
  assert.ok(posix.includes(`node "${script}"`));
  assert.doesNotMatch(posix, /cmd \/c/);
});

test('hookCommand: never emits a bare `node` with a separate args array shape', () => {
  const cmd = hookCommand(absScript('hooks/pre-write.js', root), 'win32');
  // The failure mode we measured: command "node" + args [...] → Grok runs bare node.
  assert.notEqual(cmd, 'node');
  assert.match(cmd, /pre-write\.js/);
});

test('absScript: forward-slash absolute path under repo root', () => {
  const p = absScript('hooks/activate.js', root);
  assert.ok(p.includes('hooks/activate.js'));
  assert.doesNotMatch(p, /\\/);
  assert.ok(fs.existsSync(p) || fs.existsSync(path.join(root, 'hooks', 'activate.js')));
});
