# Offcut Concise Style Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Offcut use a useful concise response style by default while it is active, let the user turn only that style off for the current session, and preserve correctness, cacheability, and harness portability.

**Architecture:** Keep one semantic style contract in `skills/offcut/SKILL.md`, generate `AGENTS.md` from it, and use the existing SessionStart/subagent context seam for a session-scoped escape hatch. Default concise adds no dynamic marker; `OFFCUT STYLE: normal` is appended after the stable ruleset only when disabled. The style changes assistant-visible prose only; it does not change construction checks, model configuration, reasoning effort, tool use, or host settings. Hosts that cannot consume hook output fall back to the standard instruction artifact and the user's explicit command.

**Tech Stack:** Node.js ESM, built-in `node:test`, existing Offcut hooks/adapters, Markdown Agent Skills/AGENTS.md, existing non-sealed Codex live harness.

**Implementation correction:** Early snippets below proposed always emitting
`OFFCUT STYLE: concise|normal`. That would make the common default prefix less
stable. The shipped implementation instead encodes concise in the canonical
ruleset and appends only the exceptional `normal` marker. The live harness also
adds a non-sealed SHA-256 receipt with executable acceptance, blinded
answer-completeness review, and separate cache dimensions. These corrections
supersede conflicting marker examples below.

## Global Constraints

- Do not edit harness configuration such as Claude `outputStyle`, Codex `model_verbosity`, Cursor settings, Gemini settings, or OpenCode config.
- Do not add a hook stage. Reuse `SessionStart`, `UserPromptSubmit`, and the existing subagent delivery path.
- Do not put the style contract in `REMINDER`; per-turn context accumulates and damages cache reuse.
- Do not add a fixed word or token cap. Concision is semantic, not truncation.
- Do not change engineering thoroughness, correctness, tests, tool use, or reasoning effort.
- Do not shorten exact errors, requested code/commands/logs, security or privacy warnings, destructive-action confirmations, accessibility guidance, or material caveats.
- Do not touch sealed Phase 11 evidence or `docs/development/EFFICACY-RESULTS.md`. New experiments belong under `bench/live-runs/` and must be labelled non-sealed.
- Preserve all existing uncommitted work. Do not clean, revert, or rewrite unrelated files.
- Do not commit. The repository owner has not requested commits; leave the completed diff for review.
- Regenerate `AGENTS.md` with `node scripts/build-agents-md.js`; never edit it by hand.

---

## Research Findings That Fix the Design

1. OpenAI's current model guidance warns that a broad instruction such as “be concise” can over-compress an answer. It recommends specifying what short answers must preserve: the conclusion, supporting evidence, material caveats, and the next action. It recommends cutting introductions, repetition, generic reassurance, and optional background first. Source: [OpenAI latest-model guide](https://developers.openai.com/api/docs/guides/latest-model).
2. Claude Code's built-in Concise output style follows the same boundary: result first, no preamble or routine narration, short by default, engineering thoroughness unchanged, expansion on request, and no loss of errors or safety-critical content. Output styles change communication, not the agent's capabilities. Source: [Claude Code output styles](https://code.claude.com/docs/en/output-styles).
3. Prompt caching rewards a stable exact prefix. Changing an output style rewrites early context and can invalidate later cached content; appending commands and skills after a stable prefix is cheaper. Source: [Claude Code prompt caching](https://code.claude.com/docs/en/prompt-caching).
4. Hook context is stored where it fires. SessionStart is the cheapest existing delivery seam; repeated UserPromptSubmit additions remain in conversation history. Source: [Claude Code hooks](https://code.claude.com/docs/en/hooks).
5. Persistent instruction files are the portable layer. AGENTS.md is deliberately cross-agent and explicit user prompts override it; Agent Skills load their full instructions when activated. Sources: [AGENTS.md](https://agents.md/) and [Agent Skills specification](https://agentskills.io/specification).
6. Runtime capabilities differ. Cursor has a SessionStart context seam, but its cloud agents currently do not support that hook. Grok supports compatible skills/hooks and AGENTS.md, while the current Offcut live evidence shows its required hook stdout is discarded. Sources: [Cursor hooks](https://prod.cursor.com/docs/hooks) and [Grok extensions](https://docs.x.ai/build/features/skills-plugins-marketplaces).
7. Other harnesses already load persistent project instructions, so Offcut should not mutate their configuration: [GitHub Copilot custom instructions](https://docs.github.com/en/copilot/concepts/prompting/response-customization?tool=visualstudio), [Gemini CLI context files](https://google-gemini.github.io/gemini-cli/docs/cli/gemini-md.html), and [OpenCode rules](https://opencode.ai/docs/rules).

### Chosen response contract

Add this contract once to the canonical skill and hardcoded fallback:

```markdown
## Response style

Offcut uses a concise response style by default while it is active.
`OFFCUT STYLE: normal` disables only this section; the construction rules remain active.

When concise:

- Lead with the result, decision, or blocker.
- Skip tool preambles, routine narration, restating the request, repetition,
  generic reassurance, and ceremonial sign-offs.
- Keep the shortest answer that preserves the result, evidence, material caveat,
  verification performed, and next action when one exists.
- Expand when the user asks for detail or when trust and comprehension require it.
- Use complete, readable prose. Do not force fragments, abbreviations, or a word cap.

Never compress away exact errors, requested code or commands, security or privacy
warnings, destructive-action confirmations, accessibility guidance, or material
uncertainty. Concision never reduces engineering work, tests, tool use, or correctness.

Switch this session: `/offcut concise on` or `/offcut concise off`.
```

The explicit `OFFCUT STYLE: concise|normal` marker wins over the default. The user's request for a walkthrough or more detail wins for that response without changing saved session state.

### Deliberate non-features

- No “caveman” grammar, forced sentence fragments, abbreviations, or missing articles. Those save visible words by reducing readability rather than improving information density.
- No `/offcut default concise off` in this phase. A session switch satisfies the requested escape hatch, avoids a second global-default state machine, and behaves honestly on AGENTS-only hosts.
- No style statusline or doctor expansion. The command confirmation and served SessionStart marker expose the state without enlarging unrelated diagnostics.
- No model-native verbosity setting. That would couple Offcut to a harness and mutate configuration the user asked Offcut to leave alone.
- No claimed token savings until a controlled live comparison passes both cost and answer-completeness gates.

---

## Task 1: Add the canonical style contract without changing runtime state

**Files:**

- Modify: `tests/hooks.test.js`
- Modify: `tests/contract.test.js`
- Modify: `skills/offcut/SKILL.md`
- Modify: `hooks/rules.js`
- Modify by generator: `AGENTS.md`

- [ ] **Step 1: Write failing contract tests**

Add assertions that the file-backed ruleset and fallback carry the same semantic guardrails, that the per-turn reminder carries none of the style contract, and that normal style removes the old unconditional no-preamble behavior.

```js
test('rules: canonical and fallback concise styles preserve required content', () => {
  const shipped = loadRuleset(root).text;
  for (const text of [shipped, FALLBACK_RULESET]) {
    assert.match(text, /OFFCUT STYLE: normal/);
    assert.match(text, /result, evidence, material caveat/i);
    assert.match(text, /exact errors/i);
    assert.match(text, /security or privacy warnings/i);
    assert.match(text, /never reduces engineering work/i);
  }
  assert.doesNotMatch(REMINDER, /OFFCUT STYLE|tool preamble|exact errors/i);
  assert.doesNotMatch(SESSION_FOOTER, /No tool preamble/i);
});
```

The existing generated-artifact equality test already catches stale generation. Add this semantic assertion beside it:

```js
assert.match(fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8'), /## Response style/);
```

- [ ] **Step 2: Run the narrow tests and observe RED**

Run:

```powershell
node --test tests/hooks.test.js tests/contract.test.js
```

Expected: failure because `SKILL.md` and `FALLBACK_RULESET` do not yet define the response contract, and `SESSION_FOOTER` still says `No tool preamble` unconditionally.

- [ ] **Step 3: Add the exact response contract to the canonical skill**

Insert the chosen response contract after `## Where the question does not apply` and before `## Modes` in `skills/offcut/SKILL.md`. Keep it communication-only and conditional on `OFFCUT STYLE: normal`.

- [ ] **Step 4: Mirror the minimum fail-safe contract in `FALLBACK_RULESET`**

Add a compact but semantically equivalent `Response style` section to `FALLBACK_RULESET`. Do not invent a second wording with different exceptions.

- [ ] **Step 5: Remove the unconditional style rule from `SESSION_FOOTER`**

Change:

```js
export const SESSION_FOOTER = `Answer the challenge in one line, then act. No tool preamble. Prefer the platform and standard library. Leave an \`offcut:\` comment when a deliberate shortcut knowingly cuts a corner.`;
```

to:

```js
export const SESSION_FOOTER = `Answer the challenge in one line, then act. Prefer the platform and standard library. Leave an \`offcut:\` comment when a deliberate shortcut knowingly cuts a corner.`;
```

This migration is required: otherwise `/offcut concise off` would leave “No tool preamble” active and the switch would be false.

- [ ] **Step 6: Re-run only the rules tests**

Regenerate the derived artifact first:

```powershell
node scripts/build-agents-md.js
```

Expected stdout: `Wrote AGENTS.md`.

Run:

```powershell
node --test tests/hooks.test.js tests/contract.test.js
```

Expected: all tests pass, including exact generated equality between `skills/offcut/SKILL.md` and `AGENTS.md`.

---

## Task 2: Add the smallest session-scoped style state and command

**Files:**

- Modify: `tests/hooks.test.js`
- Modify: `tests/phase4.test.js`
- Modify: `hooks/state.js`
- Modify: `hooks/prompt.js`

- [ ] **Step 1: Write failing state-isolation tests**

Import `DEFAULT_STYLE`, `readStyle`, `writeStyle`, and `normalizeStyle`, then add:

```js
test('state: concise is the default and style overrides are session scoped', async () => {
  await withStateDir(() => {
    assert.equal(DEFAULT_STYLE, 'concise');
    assert.equal(readStyle('alpha'), 'concise');
    assert.equal(writeStyle('normal', 'alpha'), true);
    assert.equal(readStyle('alpha'), 'normal');
    assert.equal(readStyle('beta'), 'concise');
    assert.equal(writeStyle('loud', 'alpha'), false);
    assert.equal(readStyle('alpha'), 'normal');
  });
});
```

Extend the existing pruning test to prove an old `style-<session>` file survives alongside `mode-<session>` because both are deliberate session settings.

- [ ] **Step 2: Write failing parser and command tests**

Rename the parser import and assertions from `parseModeCommand` to `parseOffcutCommand`, then add exact grammar tests:

```js
assert.deepEqual(parseOffcutCommand('/offcut concise on'), {
  type: 'style',
  style: 'concise',
  message: 'OFFCUT STYLE: concise. Concise responses are on for this session.',
});
assert.deepEqual(parseOffcutCommand('/offcut concise off'), {
  type: 'style',
  style: 'normal',
  message: 'OFFCUT STYLE: normal. Concise responses are off for this session; Offcut construction rules remain active.',
});
assert.equal(parseOffcutCommand('/offcut concise')?.type, 'command');
assert.equal(parseOffcutCommand('/offcut concise maybe')?.type, 'command');
```

Add a handler test proving the state changes only for the addressed session, returns the override marker on the same turn, and does not emit the per-turn construction reminder on the command turn.

```js
test('handlePrompt: concise off changes style, not Offcut mode', async () => {
  await withStateDir(async () => {
    writeMode('full', 'alpha');
    const out = await handlePrompt(normalize({
      hook_event_name: 'UserPromptSubmit',
      session_id: 'alpha',
      prompt: '/offcut concise off',
    }));
    assert.equal(readMode('alpha'), 'full');
    assert.equal(readStyle('alpha'), 'normal');
    assert.match(out.hookSpecificOutput.additionalContext, /OFFCUT STYLE: normal/);
    assert.doesNotMatch(out.hookSpecificOutput.additionalContext, /OFFCUT ACTIVE/);
    assert.equal(readStyle('beta'), 'concise');
  });
});
```

- [ ] **Step 3: Run the state/parser tests and observe RED**

Run:

```powershell
node --test tests/hooks.test.js tests/phase4.test.js
```

Expected: missing style exports and parser name/grammar failures.

- [ ] **Step 4: Implement narrow style storage in `hooks/state.js`**

Add only one fixed default and two valid internal values:

```js
export const STYLES = Object.freeze(['concise', 'normal']);
export const DEFAULT_STYLE = 'concise';

function stylePath(sessionId) {
  const key = sessionKey(sessionId);
  return path.join(stateDir(), key ? `style-${key}` : 'style');
}

function readStyleFile(file) {
  try {
    if (!fs.existsSync(file)) return null;
    return normalizeStyle(fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '').trim());
  } catch {
    return null;
  }
}

export function normalizeStyle(value) {
  if (value == null) return null;
  const style = String(value).trim().toLowerCase();
  return STYLES.includes(style) ? style : null;
}

export function readStyle(sessionId) {
  const key = sessionKey(sessionId);
  if (key) {
    const scoped = stylePath(key);
    const style = readStyleFile(scoped);
    if (style) {
      touchStateFile(scoped);
      return style;
    }
  }
  return readStyleFile(stylePath()) || DEFAULT_STYLE;
}

export function writeStyle(value, sessionId) {
  const style = normalizeStyle(value);
  if (!style) return false;
  try {
    ensureDir();
    fs.writeFileSync(stylePath(sessionId), `${style}\n`, 'utf8');
    return true;
  } catch {
    return false;
  }
}
```

Expose `style` and `styleFor` from `paths()` for tests. The unscoped `style` file is an internal fallback for hook payloads without a session ID and isolated benchmark runs; session commands write `style-<session>` and therefore do not change peers. Do not add `activateStyle`, `default-style`, legacy-owner migration, or a user-facing persisted-default command. When neither scoped nor unscoped state exists, the shipped default is concise.

Update the pruning comment from “Session modes” to “Session modes and styles”; no pruning logic change is needed because the existing allowlist removes only ephemeral `turn-*`, `fired-*`, and `claim-*` files.

- [ ] **Step 5: Generalize the command parser at its owning boundary**

Rename `parseModeCommand` to `parseOffcutCommand` and add this branch before the catch-all `/offcut` branch:

```js
const style = t.match(/^\/offcut\s+concise\s+(on|off)\s*$/i);
if (style) {
  const enabled = style[1].toLowerCase() === 'on';
  return {
    type: 'style',
    style: enabled ? 'concise' : 'normal',
    message: enabled
      ? 'OFFCUT STYLE: concise. Concise responses are on for this session.'
      : 'OFFCUT STYLE: normal. Concise responses are off for this session; Offcut construction rules remain active.',
  };
}
```

Update the JSDoc union to include `type: 'style'` and `style?: string`. Do not keep a compatibility alias for the old internal name; all in-repo callers and tests move together.

Handle it before ordinary reminders:

```js
if (command?.type === 'style' && command.style) {
  writeStyle(command.style, norm.sessionId);
  return emit(norm.host, 'user_prompt_submit', command.message);
}
```

- [ ] **Step 6: Re-run the focused state and command tests**

Run:

```powershell
node --test tests/hooks.test.js tests/phase4.test.js
```

Expected: all tests pass except any still-deliberate generated-artifact failure from Task 1.

---

## Task 3: Deliver one stable style marker through existing lifecycle seams

**Files:**

- Modify: `tests/hooks.test.js`
- Modify: `tests/contract.test.js`
- Modify: `tests/cursor.test.js`
- Modify: `hooks/rules.js`
- Modify: `hooks/activate.js`
- Modify: `hooks/subagent.js`

- [ ] **Step 1: Write failing session-context tests**

Add direct assertions:

```js
test('rules: session context carries exactly one cache-stable style marker', () => {
  const concise = sessionContext('full', root, 'concise');
  const normal = sessionContext('full', root, 'normal');
  assert.equal(
    concise.split(/\r?\n/).filter((line) => /^OFFCUT STYLE: (?:concise|normal)$/.test(line)).length,
    1,
  );
  assert.match(concise, /^OFFCUT MODE: full\nOFFCUT STYLE: concise/m);
  assert.match(normal, /^OFFCUT MODE: full\nOFFCUT STYLE: normal/m);
});
```

Add lifecycle behavior:

- a new session emits `concise`;
- `/offcut concise off` followed by `resume`, `clear`, or `compact` with the same session ID emits `normal`;
- a `fork` with a new session ID emits `concise` and never inherits the parent's temporary style;
- a subagent receives its parent's style marker;
- mode `off` still emits no Offcut context at all.

Extend the host contract loop so Claude, Codex, and Grok-shaped hook outputs contain one `OFFCUT STYLE: concise` marker. Extend Cursor's duplicate SessionStart test so the single winning native `additional_context` contains the marker.

- [ ] **Step 2: Run lifecycle tests and observe RED**

Run:

```powershell
node --test tests/hooks.test.js tests/contract.test.js tests/cursor.test.js
```

Expected: `sessionContext` ignores its style argument and activation/subagents do not read session style.

- [ ] **Step 3: Add the marker to `sessionContext`**

Change the interface and output order:

```js
export function sessionContext(mode, root = pluginRoot(), style = 'concise') {
  const { text } = loadRuleset(root);
  const effectiveStyle = normalizeStyle(style) || DEFAULT_STYLE;
  const footer =
    (process.env.OFFCUT_SESSION_FOOTER && String(process.env.OFFCUT_SESSION_FOOTER).trim()) ||
    SESSION_FOOTER;
  return [
    `OFFCUT MODE: ${mode}`,
    `OFFCUT STYLE: ${effectiveStyle}`,
    '',
    text,
    '',
    footer,
  ].join('\n');
}
```

Import and use `normalizeStyle` or `DEFAULT_STYLE` so invalid direct callers fail safe to `concise`; do not allow arbitrary marker text.

- [ ] **Step 4: Route style through activation and subagents**

In `hooks/activate.js`:

```js
const mode = activateSession(norm.sessionId, norm.source);
const style = readStyle(norm.sessionId);
// existing reset and served-root logic remains unchanged
return emit(norm.host, 'session_start', sessionContext(mode, root, style));
```

In `hooks/subagent.js`:

```js
const mode = readMode(norm.sessionId);
if (mode === 'off') return null;
const style = readStyle(norm.sessionId);
const context = sessionContext(mode, undefined, style);
```

Do not change `host.js`, adapters, manifests, installers, hook matchers, or permission behavior. Those boundaries already carry arbitrary context.

- [ ] **Step 5: Re-run the lifecycle matrix**

Run:

```powershell
node --test tests/hooks.test.js tests/contract.test.js tests/cursor.test.js tests/phase8.test.js tests/phase9.test.js
```

Expected: pass on Windows with the two existing shell statusline cases skipped only when the full suite is run.

---

## Task 4: Regenerate portable instructions and document honest host behavior

**Files:**

- Modify by generator: `AGENTS.md`
- Modify: `skills/offcut-help/SKILL.md`
- Modify: `README.md`
- Modify: `docs/development/HOSTS.md`
- Modify: `tests/phase7.test.js`
- Modify: `tests/phase9.test.js`

- [ ] **Step 1: Add documentation assertions before editing prose**

Extend existing skill/documentation tests to require:

- `/offcut concise on` and `/offcut concise off` appear in help and README;
- help says the switch changes response style only, not construction mode;
- README says concise is default while Offcut is active;
- host docs distinguish hook-delivered state from AGENTS-only fallback;
- no document claims measured token savings.

Representative assertions:

```js
assert.match(help, /\/offcut concise off/);
assert.match(help, /construction (?:mode|rules) remain active/i);
assert.match(readme, /concise.*default.*Offcut.*active/is);
assert.doesNotMatch(readme, /saves? \d+%|token savings? proven/i);
```

- [ ] **Step 2: Run docs/generation tests and observe RED**

Run:

```powershell
node --test tests/contract.test.js tests/phase7.test.js tests/phase9.test.js
```

- [ ] **Step 3: Regenerate `AGENTS.md`**

Run:

```powershell
node scripts/build-agents-md.js
```

Expected stdout:

```text
Wrote AGENTS.md
```

Then verify exact generation rather than visually copying:

```powershell
node --test tests/contract.test.js
```

- [ ] **Step 4: Update user-facing commands**

In `skills/offcut-help/SKILL.md` and README, document:

```text
/offcut concise on     # concise response style for this session
/offcut concise off    # normal response style; Offcut construction checks stay active
```

Keep `/offcut off` distinct: it disables Offcut itself, while `/offcut concise off` disables only the communication style.

- [ ] **Step 5: Document the host matrix without pretending every hook works**

Use these claims in `docs/development/HOSTS.md`:

| Host path | Default concise delivery | Session switch |
|---|---|---|
| Claude Code | SessionStart and subagent hook context | Hook state; applies immediately to current prompt and future context |
| Codex | SessionStart and subagent hook context | Hook state; no `model_verbosity` edit |
| Cursor local | Native `additional_context` and subagent rewrite | Hook state |
| Cursor cloud | Persistent skill/AGENTS fallback; SessionStart hook currently unsupported | Explicit user command in conversation; no claimed persisted hook state |
| Grok Build | AGENTS.md fallback because required hook stdout is discarded | Explicit user command overrides AGENTS.md for the conversation; no claimed hook delivery |
| Other AGENTS/Skill hosts | Canonical Markdown contract | Explicit user instruction; no host configuration mutation |

- [ ] **Step 6: Re-run documentation and generated-artifact tests**

Run:

```powershell
node --test tests/contract.test.js tests/phase7.test.js tests/phase9.test.js
```

Expected: pass.

---

## Task 5: Add a non-sealed, neutral style comparison without running it

This task builds the measurement path only. It must not make model calls during implementation or tests.

**Files:**

- Modify: `bench/lib.mjs`
- Modify: `bench/run.mjs`
- Add: `bench/live-style-lib.mjs`
- Add: `bench/live-style.mjs`
- Add: `tests/live-style.test.js`
- Modify: `README.md`

- [ ] **Step 1: Write failing pure tests for the style schedule**

Create `tests/live-style.test.js` with no network calls:

```js
test('live style schedule counterbalances normal, terse, and concise', async () => {
  const { parseStyleArgs, styleSchedule, styleArm } = await import('../bench/live-style-lib.mjs');
  assert.deepEqual(parseStyleArgs(['busy-helper', '--reps', '2']), {
    task: 'busy-helper',
    arms: ['normal', 'terse', 'concise'],
    reps: 2,
    execute: false,
  });
  assert.deepEqual(styleArm('normal'), { offcutStyle: 'normal', terseControl: false });
  assert.deepEqual(styleArm('terse'), { offcutStyle: 'normal', terseControl: true });
  assert.deepEqual(styleArm('concise'), { offcutStyle: 'concise', terseControl: false });
  assert.throws(() => parseStyleArgs(['busy-helper', '--execute']), /paid live runs require/i);
  assert.equal(styleSchedule('busy-helper', ['normal', 'terse', 'concise'], 2).length, 6);
});
```

Require a second explicit confirmation token, for example `--execute --i-understand-this-runs-models`, before the driver may call `runOne`. Pure tests must prove either flag alone refuses.

- [ ] **Step 2: Write failing runner-option tests using stubs only**

Extend the existing `runOne honors a caller-owned run root` test or add a focused stub test that passes `style: 'normal'` and asserts:

```js
assert.equal(result.record.offcut_style, 'normal');
const stateAfter = JSON.parse(
  fs.readFileSync(path.join(result.runDir, 'state-after.json'), 'utf8'),
);
assert.equal(stateAfter.style.trim(), 'normal');
```

Use the existing `state-after.json`; do not expose a new test-only production field.

Add a no-process test for a custom neutral Codex profile instruction and assert its hash differs from the sealed default only when the override is supplied.

- [ ] **Step 3: Run pure tests and observe RED**

Run:

```powershell
node --test tests/live-style.test.js tests/live-reuse.test.js tests/phase11.test.js
```

Expected: missing live-style modules/options. Existing Phase 11 tests must remain green apart from the new RED cases.

- [ ] **Step 4: Add optional style state to the existing run boundary**

In `bench/lib.mjs`, add a writer that does not assert the directory is empty:

```js
export function writeStyle(stateDir, style) {
  if (!['concise', 'normal'].includes(style)) throw new Error(`bad style: ${style}`);
  fs.writeFileSync(path.join(stateDir, 'style'), `${style}\n`, 'utf8');
}
```

In `runOne`, default `opts.style` to `concise`, write it after `writeMode`, and record it as `offcut_style`. Also copy an optional `opts.styleArm` into `style_arm` so `normal` and the `terse` control remain distinguishable even though both use internal style `normal`. Existing callers retain the new product default without changing arm labels or sealed records already on disk.

Do not add `normal` or `concise` to the sealed `LEGACY_ARMS`; those are styles, not efficacy arms.

- [ ] **Step 5: Neutralize the live comparison without rewriting the sealed default profile**

Parameterize, with the existing constant as the default:

```js
function codexProfileText(instructions = CODEX_PROFILE_INSTRUCTIONS) { /* existing body */ }

export function prepareCodexHome({
  arm,
  authPath = path.join(os.homedir(), '.codex', 'auth.json'),
  parentDir = os.tmpdir(),
  profileInstructions = CODEX_PROFILE_INSTRUCTIONS,
}) {
  // existing isolation
  const profileConfig = codexProfileText(profileInstructions);
}
```

Thread `profileInstructions` through `runOne` → `runCodex` → `prepareCodexHome`. Leave `CODEX_PROFILE_INSTRUCTIONS` byte-for-byte unchanged so Phase 11 reproduction and existing hashes keep their original default.

The live style driver uses this neutral base:

```js
export const LIVE_STYLE_PROFILE =
  'Implement the maintenance ticket in the current repository. Inspect the files, make the required changes, and run relevant checks. Do not commit or edit .codex.';
```

Only the `terse` control appends ` Be terse.`. The `concise` arm gets no extra profile prose; it receives Offcut's actual concise contract through the style state and SessionStart path.

- [ ] **Step 6: Implement a small guarded live driver**

`bench/live-style-lib.mjs` owns parsing, arm mapping, and counterbalanced scheduling. `bench/live-style.mjs` reuses `runOne`, the existing five live tickets, `CODEX_MODEL_ID`, isolated homes, task acceptance, and `bench/live-runs/`. Every job calls `runOne` with `arm: 'full'`, `style: mapping.offcutStyle`, `styleArm: job.arm`, and the neutral or terse-control `profileInstructions`; style labels must never be passed as Phase 11 arm names.

Each console/manifest result must include:

```js
{
  task,
  style_arm,
  rep,
  run_id,
  task_passed,
  input_tokens,
  cache_read_input_tokens,
  cache_creation_input_tokens,
  noncached_input_tokens:
    input_tokens == null || cache_read_input_tokens == null
      ? null
      : Math.max(0, input_tokens - cache_read_input_tokens),
  output_tokens,
  reasoning_output_tokens,
  model_turns,
  completed_tool_calls,
  failure_kind,
}
```

Write only to `bench/live-runs/` and a new `bench/live-style-<task>.jsonl`. Never append to Phase 11 manifests or sealed reports.

- [ ] **Step 7: Add the qualitative completeness gate**

Document that a style arm is not acceptable merely because `output_tokens` is lower. For every accepted task, a blind reviewer must confirm that the final response preserves:

1. what changed or the final result;
2. verification actually run and its outcome;
3. a material caveat or uncertainty when present;
4. the next action when one remains;
5. exact errors, warnings, security notes, or confirmation text when the ticket produces them.

The release decision requires `concise` to beat or match the one-line `terse` control on answer completeness and show a meaningful median improvement over `normal` in at least one cost dimension without regressions in task acceptance, model turns, or tool calls. Record cache reads/writes separately; never report `input_tokens` alone as savings.

- [ ] **Step 8: Verify that no model call occurred**

Run:

```powershell
node --test tests/live-style.test.js tests/live-reuse.test.js tests/phase11.test.js
node bench/live-style.mjs busy-helper
```

Expected: tests pass, and the second command prints a plan/refusal without starting Codex because the two execution flags are absent. `bench/live-runs/` and live manifests must remain byte-identical after the refusal check.

Do not execute the paid form during implementation. It requires a later explicit user decision:

```powershell
node bench/live-style.mjs busy-helper --reps 2 --execute --i-understand-this-runs-models
```

---

## Task 6: Adversarial closure and full verification

**Files:**

- Verify only: all files changed by Tasks 1–5
- Do not modify: `docs/development/EFFICACY-RESULTS.md`, sealed Phase 11 run artifacts, unrelated dirty files

- [ ] **Step 1: Search for contract duplication and forbidden approaches**

Run:

```powershell
rg -n "No tool preamble|OFFCUT STYLE|concise on|concise off|model_verbosity|outputStyle|verbosity" hooks skills AGENTS.md README.md docs/development bench tests
```

Expected:

- `No tool preamble` appears only inside the conditional concise contract and tests, never `SESSION_FOOTER` or `REMINDER`.
- `OFFCUT STYLE` is defined in the canonical/fallback contract, session marker, command confirmation, docs, and tests—not repeated per turn.
- no production code writes harness verbosity/output-style configuration.

- [ ] **Step 2: Attack state and lifecycle semantics**

Verify with automated tests that:

- corrupted or missing style state fails safe to `concise`;
- invalid commands do not mutate mode or style;
- two concurrent session IDs cannot change one another;
- resume/clear/compact retain the current session's style;
- a new fork/session starts concise;
- mode off remains silent even if style is concise;
- style normal keeps mode full/lite/strict active;
- subagents inherit the parent style without a new hook or permission vote;
- duplicate Cursor SessionStart delivery still emits one context block;
- Grok documentation claims only the AGENTS/user-prompt fallback that current evidence supports.

- [ ] **Step 3: Run all focused suites**

Run:

```powershell
node --test tests/hooks.test.js tests/contract.test.js tests/cursor.test.js tests/phase4.test.js tests/phase7.test.js tests/phase8.test.js tests/phase9.test.js tests/live-style.test.js tests/live-reuse.test.js tests/phase11.test.js
```

Expected: 0 failures. On Windows, POSIX statusline tests may be skipped only if included by the selected suite.

- [ ] **Step 4: Run the full suite**

Run:

```powershell
node --test tests/*.test.js
```

Expected: 0 failures and only the two already-known `statusline.sh` POSIX-CI skips on Windows. Compare the final count with the pre-change baseline of 301 total, 299 passed, 2 skipped; the total must increase by the new tests.

- [ ] **Step 5: Verify generated and sealed boundaries**

Run:

```powershell
node scripts/build-agents-md.js
node --test tests/contract.test.js tests/phase11.test.js
git diff -- docs/development/EFFICACY-RESULTS.md
git status --short
```

Expected:

- generator reports `Wrote AGENTS.md` and a second generation produces no content difference;
- contract and Phase 11 tests pass;
- sealed efficacy report diff is empty;
- status shows the pre-existing dirty work plus this feature's intentional files only;
- no commit exists and no model-backed live style run was executed.

- [ ] **Step 6: Report without an efficacy claim**

Report:

- concise style is default while Offcut is active;
- `/offcut concise off` disables response styling only for that session;
- `/offcut off` still disables Offcut itself;
- no harness configuration changed;
- all deterministic tests and host contracts passed;
- token savings remain unproven until the separately approved live comparison is executed and passes the completeness gate.
