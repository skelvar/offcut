import { interleaveSchedule } from './lib.mjs';

const LIVE_ARMS = new Set(['off', 'full']);

export function parseLiveArgs(argv) {
  const args = [...argv];
  let reps = 1;
  const positional = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--reps') {
      reps = Number(args[++index]);
      continue;
    }
    positional.push(args[index]);
  }
  if (!Number.isInteger(reps) || reps < 1) throw new Error('bad reps: expected a positive integer');

  let task = 'save-button';
  let arms = positional;
  if (positional[0] && !LIVE_ARMS.has(positional[0])) {
    task = positional[0];
    arms = positional.slice(1);
  }
  if (!arms.length) arms = ['off', 'full'];
  for (const arm of arms) {
    if (!LIVE_ARMS.has(arm)) throw new Error(`bad arm: ${arm}`);
  }
  return { task, arms: [...new Set(arms)], reps };
}

export function liveSchedule(task, arms, reps) {
  return interleaveSchedule([task], reps, arms);
}

export function classifyDiff(diffText) {
  const diff = String(diffText || '');
  const added = diff
    .split(/\r?\n/)
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
  return {
    used_pressable: /\bPressable\b/.test(added),
    used_busy_hook: /\buseBusyState\b/.test(added),
    used_spinner: /\bLoadingSpinner\b/.test(added),
    new_component:
      /\b(?:export\s+)?(?:function|class)\s+[A-Z][A-Za-z0-9_]*\b/.test(added) ||
      /\b(?:export\s+)?const\s+[A-Z][A-Za-z0-9_]*\s*=/.test(added),
    touched_login: /(?:^|[\\/])LoginForm\.[^\s]+/m.test(diff),
    new_messages_or_config: /\b(?:i18n|messages|labels|copy)\.js\b/.test(diff),
  };
}
