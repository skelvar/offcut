# Phase 1 — Make the mode work

Task specification for the implementing agent. Read this **and**
`offcut-implementation-plan.md` before writing code. The plan is the spec; this
file is the scope, the constraints, and the measured facts you must not
re-derive.

---

## What Offcut is

A persistent mode, delivered through agent lifecycle hooks, that forces one
question into every build decision: **what is the cheapest thing that actually
works, and where does it belong?**

The instruction text is the payload. The hooks are the product. Existing tools
in this space inject their ruleset once at session start and hope the model
remembers; Offcut re-asks every turn and again before a write. See plan §2.2.

## Scope of this phase

Build the mode: activation, persistence, mode switching, per-turn reminder,
subagent inheritance.

**Do NOT build in this phase:**

- `pre-write.js` / `post-write.js` — the write-time challenge is Phase 2
- Cursor support — Phase 3
- `/offcut review`, `/offcut audit`, `/offcut help` — Phase 4
- Any benchmark — Phase 5

Ship these files and nothing else:

```
skills/offcut/SKILL.md           the challenge, single source of truth
AGENTS.md                        generated from SKILL.md, never hand-edited
hooks/host.js                    adapter seam — owns ALL host divergence
hooks/state.js                   mode file read/write
hooks/rules.js                   ruleset loader + hardcoded fallback
hooks/activate.js                session start
hooks/prompt.js                  per-turn reminder + mode commands
hooks/subagent.js                subagent inheritance
hooks/statusline.sh
hooks/statusline.ps1
adapters/claude/hooks.json       also installs on Codex and Grok
plugin.json                      Agent Plugins 1.0
.claude-plugin/plugin.json
.claude-plugin/marketplace.json
scripts/build-agents-md.js       SKILL.md -> AGENTS.md
tests/hooks.test.js
tests/contract.test.js
evals/prompts.jsonl
.github/workflows/test.yml
README.md
LICENSE                          MIT
```

**Zero runtime dependencies.** Node standard library only. `node:test` for
tests. These hooks run on every turn and every write; startup cost is the budget.

---

## Measured host facts — do not trust vendor docs over this

These came from `tools/probe.mjs` running in real sessions on 2026-08-24. The
vendor documentation was **wrong** about the most important one. Build from this
table, not from docs.

### One config, three hosts

`adapters/claude/hooks.json` installs unchanged on Claude Code, Codex, and Grok
Build. All three accept PascalCase event keys, optional `matcher`, nested
`hooks` array, `type: "command"`, `timeout`.

### Two payload dialects

| | Claude Code | Codex | Grok Build |
|---|---|---|---|
| Event field | `hook_event_name` | `hook_event_name` | `hookEventName` |
| Event value | `PreToolUse` | `PreToolUse` | `pre_tool_use` |
| Key casing | snake_case | snake_case | **camelCase** |
| Tool name field | `tool_name` | `tool_name` | `toolName` |
| Tool name value | `Write`, `Edit` | `apply_patch` | `write` |
| Tool result | `tool_response` | `tool_response` | `toolResult` |
| Session | `session_id` | `session_id` | `sessionId` |
| Subagent event | `SubagentStart` | `SubagentStart` | `subagent_start` |
| Subagent id | `agent_id` | `agent_id` | `subagentId` |
| Subagent type | `agent_type` | `agent_type` | `subagentType` |
| Subagent type value | `general-purpose` | `default` | `general-purpose` |
| Unique keys | `prompt_id`, `session_title`, `duration_ms`, `effort` | `turn_id`, `model` | `workspaceRoot`, `isBackgrounded`, `timestamp`, `toolInputTruncated`, `toolResultTruncated` |

**Grok takes a PascalCase config and sends a camelCase payload.** Its own docs
describe only the config schema. An adapter written from the docs reads
`hook_event_name` off a Grok payload, gets `undefined`, and fails silently on
every event — no error, no crash, the hook just never does anything.

### Host detection: use the payload, never the environment

Codex sets **no** identifying environment variable. `CLAUDE_PROJECT_DIR` leaks
into Grok's environment. Env vars are absent when you need them and present when
they are wrong.

```js
// hooks/host.js
if (payload.hookEventName !== undefined) return 'grok';
if (String(payload.transcript_path || '').includes('.codex')) return 'codex';
return 'claude';
```

### Three more wire-only findings

1. **Codex prints hook lifecycle lines to its own stdout.** Anything a hook
   writes to stdout risks appearing in the user's transcript. Emit context
   through the documented JSON field; never `console.log` from a hook.
2. **Subagent type values differ per host** (`general-purpose` vs `default`) for
   an equivalent agent. **Never put an agent type in a matcher** — it will
   silently never fire on one host. Match everything, filter in `host.js`.
3. **Grok truncates tool payloads** and flags it with `toolInputTruncated` /
   `toolResultTruncated`. Not needed in Phase 1, but `host.js` must expose the
   flag so Phase 2 can honor it.

You can re-verify any of this yourself: `node tools/install-probe.mjs`, use a
harness, then `node tools/report-probe.mjs`, then
`node tools/install-probe.mjs --uninstall`.

---

## Two open decisions — defaults chosen, override only with a reason

### 1. How does `prompt.js` decide a prompt is a "build request"?

Plan §4.2 says skip the reminder on conversational prompts. It does not say how,
and a hook cannot call a model.

**Default: always inject, except when the prompt is an `/offcut` command or the
mode is `off`.** The reminder is under 60 tokens. Any keyword heuristic will be
wrong in both directions, and a wrong suppression is invisible — the mode just
quietly stops working. Ship the simple version, measure whether it is actually
annoying, add suppression only if it is.

If you disagree after building it, say so in the PR with what you observed.
Do not add a classifier without evidence it is needed.

### 2. `evals/prompts.jsonl` does not exist yet

Phase 1's acceptance criteria reference it, so it is part of this phase.

Write **negative cases first**, before the reminder logic. Twenty should-fire
build prompts, twenty should-stay-quiet prompts ("what does this function do?",
"rename this variable", "fix this typo", "explain the error", "summarize the
README", "format this file"). Writing negatives first stops the corpus from
being reverse-engineered to fit whatever you implemented.

Under the always-inject default, the quiet cases will fail. That is expected and
correct — they document intended behavior for when suppression is revisited.
Mark them `"expect": "quiet"` and let them report as known-pending rather than
deleting them or weakening them to pass.

---

## Hard constraints

**Failure contract — every hook, no exceptions (plan §4.6):**

- never block the session; bound the run with a timer and exit 0 on expiry
- exit 0 on any internal error, silently
- state-file writes are best-effort; a failed write degrades the mode, it does
  not fail the turn
- strip a UTF-8 BOM before parsing any JSON
- **never assume stdin closes.** A wrapper on some platforms swallows the piped
  payload so the `end` event never fires and the process hangs, which freezes
  the user's session. `tools/probe.mjs` shows the pattern: `end` handler, `error`
  handler, and an `unref()`ed timeout fallback.

A hook that hangs is the failure that gets a plugin uninstalled and never
reinstalled. Test it explicitly.

**Architecture:**

- **No hook script may contain a host name.** All divergence lives in
  `host.js` and `adapters/`. Add a CI check that greps for host identifiers
  outside those two paths and fails the build.
- `AGENTS.md` is generated. CI fails if it is stale relative to `SKILL.md`.
- `SKILL.md` frontmatter uses only Agent Skills standard fields: `name`,
  `description`, `license`, `compatibility`, `metadata`. `name` must be `offcut`
  and match its directory. `description` max 1024 chars, `compatibility` max 500.
  Body under 500 lines.
- Versions match across `plugin.json`, `.claude-plugin/plugin.json`,
  `marketplace.json`, and `metadata.version`. CI enforces it.

**Security (plan §12):** no network, no dependencies, no subprocesses, no
reading files beyond the state file and ruleset, no writing files beyond the
state file, no binaries. Validate the statusline path before embedding it in a
shell command and refuse if it contains shell metacharacters.

---

## Definition of done

- [ ] Mode activates on install in Claude Code, Codex, and Grok Build from the
      one config
- [ ] Survives `/clear` and context compaction (`SessionStart` matcher includes
      `compact`, `clear`, `fork`)
- [ ] `/offcut lite|full|strict|off` switches; `/offcut default <mode>` persists;
      "stop offcut" and "normal mode" deactivate
- [ ] Statusline reflects the current mode
- [ ] Per-turn reminder fires per the §1 default above
- [ ] Subagents inherit the mode on all three hosts
- [ ] Every hook satisfies the failure contract, with explicit tests for: hang,
      malformed JSON, empty stdin, BOM-prefixed payload, missing state file,
      unreadable ruleset
- [ ] Contract tests assert per-host output shapes, including the negative
      cases: Grok output never contains `hook_event_name`, Claude output never
      contains `hookEventName`
- [ ] No hook script contains a host name — enforced by CI
- [ ] `AGENTS.md` regenerates from `SKILL.md`; CI fails when stale
- [ ] Zero runtime dependencies
- [ ] README documents install per host, how to turn it off, and marks Cursor
      and every other host as untested

---

## Working agreement

- Branch: `phase-1-hooks`. Do not merge to `main`.
- Commit in logical steps, not one squashed commit.
- **Commit messages must contain no AI attribution** — no `Co-Authored-By`
  trailer, no "Generated with" footer. Author is the repo owner alone. This is a
  hard requirement.
- If you hit something the plan gets wrong, **stop and write it down in the PR
  description** rather than silently working around it. The plan has already
  been wrong once (the Grok payload) and that is worth catching early.
- When done, open a PR against `main` summarizing what was built, what you
  deviated from and why, and anything you could not verify.
