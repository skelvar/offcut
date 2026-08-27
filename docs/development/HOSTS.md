# HOSTS.md — Offcut real-harness verification

Dated results from Phase 3. A host counts as verified only when a challenge was
observed in a real session. Installing successfully is not verification.

---

## Environment

| Field | Value |
|---|---|
| Date started | 2026-08-24 |
| Date closed | 2026-08-27 (Cursor v0.2 follow-up) |
| OS | Windows |
| Node | v24.16.0 |
| Claude Code | 2.1.240 |
| Codex | 0.149.1 |
| Grok Build | 1.0.5 (5115b46bc9) [stable] |
| Cursor | 3.17.19 |
| Branch | `phase-3-real` |
| Repo | `D:\rightseam` |

Synthetic suite: started at **75/75**, ended at **79+/79+** after Phase 3 tests
(`node --test tests/*.test.js`).

Install path used for E2E: `node tools/install.mjs` (absolute single-string
commands). Uninstall verified clean afterward.

---

## Known-unverified #1 — `${CLAUDE_PLUGIN_ROOT}` path resolution

### Measurement (2026-08-24)

Across **261** prior probe entries plus fresh measure runs, hook subprocess env
contained only:

- Claude (settings.json hooks): `CLAUDECODE`, `CLAUDE_PROJECT_DIR`
- Grok (`~/.grok/hooks/`): `GROK_SESSION_ID`, `CLAUDE_PROJECT_DIR` (leak)

**`CLAUDE_PLUGIN_ROOT` and `PLUGIN_ROOT` never appeared** for settings/hooks-dir
installs. Empty expansion → `node /hooks/activate.js` → fail-open, no challenge.

Claude Code docs: `${CLAUDE_PLUGIN_ROOT}` is for **plugin-installed** hooks. Not
re-measured under `claude plugin install` in this phase.

### Fix

Packaging only — hook scripts unchanged for path concerns:

1. `adapters/claude/hooks.json` — single `command` string with `${CLAUDE_PLUGIN_ROOT}` for plugin installs.
2. `tools/install.mjs` — absolute paths as `node "…/hooks/….js"` for Claude settings / Codex / Grok.

Status: **fixed for settings installs.**

### Plugin-install path — measured (Phase 7.5, 2026-08-24/25)

Installed a throwaway plugin (`offcut-root-measure`) whose SessionStart /
UserPromptSubmit hooks run `node "${CLAUDE_PLUGIN_ROOT}/hooks/mark.js"` and
append env to `~/.offcut-plugin-root-mark.json`.

Observed on Claude Code after `claude plugin install`:

```json
"CLAUDE_PLUGIN_ROOT": "C:/Users/bash/.claude/plugins/cache/offcut-root-measure/offcut-root-measure/0.0.1/",
"PLUGIN_ROOT": null,
"CLAUDECODE": "1"
```

`${CLAUDE_PLUGIN_ROOT}` **expands and is present in the hook subprocess env** on
the plugin-install path. `PLUGIN_ROOT` was absent. Offcut's
`adapters/claude/hooks.json` form is therefore correct for plugin installs.
Also verified `claude plugin install offcut@offcut` from this repo (after
removing a temporary `.grok/skills` junction that caused Windows `EPERM` on
symlink during install). Measure plugin uninstalled afterward; mark file kept
as evidence.

Status: **closed — plugin path measured; placeholder works.**

---

## Known-unverified #2 — Windows / `args` command form

### Measurement (2026-08-24) — controlled A/B

Harness: `tools/measure-command-form.mjs` → `~/.offcut-cmd-form-mark`.
Undo verified before relying on installs.

| Host | Single-string `node "…/script" LABEL` | `command:"node"` + `args:[script, LABEL]` |
|---|---|---|
| Grok 1.0.5 | **fires** | **silent fail** — write succeeds, no mark |
| Claude 2.1.240 | **fires** | **fires** |
| Codex 0.149.1 | proven by prior probes + later measure | **fires** (`CODEX-WRITE-EDIT`) |

**Grok ignores `args`.** Nested `cmd /c "where node && node …"` works on Grok but
**fails silently under Claude Code** (bash spawn + nested quoting). Final installer
uses plain `node "abs"` on every host; missing Node fails open.

Hooks load at **session start** on Grok — mid-session file drops are invisible
until a new session.

Status: **fixed — single-string absolute commands.**

---

## Known-unverified #3 — `permissionDecision`

### Grok (prior + confirmed)

Only `allow`|`deny`. `ask`/`escalate` ignored. `host.js` degrades escalate to
`additionalContext`.

### Claude 2.1.240 (headless `-p`, `--permission-mode default`, 2026-08-24)

Temporary PreToolUse probe returning each value:

| Value | Write completed? | Observation |
|---|---|---|
| `ask` | **No** | Surfaced to the model as `<error>perm-probe:ask</error>` — hard block in print mode, not an interactive prompt. `additionalContext` still delivered. |
| `escalate` | **No** | Probe ran, but decision appears **ignored**; model saw the host's normal permission-deny message instead. No `PERM_PROBE` text. |
| `defer` | **No** | Probe ran; no clear decision feedback in print output. |
| `allow` | **Yes** | Write succeeded; `additionalContext` delivered alongside. |

**Keep `permissionDecision: "ask"` for Claude/Codex escalate** — it is the value
Claude honors. Interactive TUI prompt UI was not observed (headless only).

### Codex 0.149.1 (2026-08-24 follow-up)

Temporary PreToolUse probe, `codex exec -s workspace-write` (no approvals bypass):

| Value | Probe ran? | Write completed? |
|---|---|---|
| `ask` | yes | **yes** (`WRITE_OK`) |
| `escalate` | yes | **yes** (`WRITE_OK`) |

Codex did **not** block on `ask` or `escalate` in this configuration. Write-time
`additionalContext` still works (challenge E2E). Keeping `permissionDecision:
"ask"` for Codex is harmless here — strict-mode escalate still carries
`additionalContext` in the same payload.

Status: **Claude: keep `ask`. Codex: `ask`/`escalate` non-blocking in measured
exec mode; context delivery is what matters. Interactive TUI prompt UI
unverified on both.**

---

## Known-unverified #4 — Real truncation

`toolInputTruncated` appears as a key on Grok PreToolUse (always present in
schema). Attempts to force `true`:

- Grok: model would not place 20k–200k bodies into a write call (~1.2k max observed).
- Claude: 100k read-then-Write hung past 10 minutes without a completed measure line; killed.

Status: **retired (Phase 7.5)** — threshold still unknown after repeated
attempts (Grok: model refuses to place 20k–200k bodies in a write call;
Claude: 100k read-then-Write hung past 10 minutes). Flag handling stays covered
by synthetic `toolInputTruncated` payloads in unit tests. **Do not claim a
real-world size.** Re-open only if a host documents a truncation threshold or a
reliable way to force `toolInputTruncated: true` appears.

---

## Grok additionalContext gap (discovered in Phase 3)

Grok docs (`10-hooks.md`):

- `SessionStart` / `PostToolUse`: **stdout ignored**
- `UserPromptSubmit`: **observe-only — stdout ignored**
- `PreToolUse`: documents `allow` / `deny` / `updatedInput` only

Empirical: a PreToolUse hook that returned distinctive
`additionalContext: "OFFCUT_CTX_PROBE_VISIBLE_7f3a9c"` **ran** (mark file written)
but the model reported `NO_CTX`. Offcut write hooks also recorded `fired-*`
signals while the model reported `NO_OFFCUT_CHALLENGE`.

**Grok runs Offcut hooks but does not deliver `additionalContext` to the model
on the events Offcut uses.** Challenge-in-transcript is **not** achievable on
Grok with the current emit shape. Leave as an honest gap (Phase 4+ may need a
Grok-specific delivery path that does not use `deny`).

---

## Other findings

### Codex `apply_patch` tool_input shape

Measured PreToolUse payload:

```json
{ "tool_name": "apply_patch", "tool_input": { "command": "*** Begin Patch\n*** Add File: …\n+…\n*** End Patch" } }
```

Path and content live inside `command`, not `file_path` / `patch` / `input`.
`extractWriteFields` was blind → no signals. **Fixed** in `hooks/signals.js`
(regression test added). After the fix, Codex produced observed challenges.

### Mode commands

- **Claude `-p "/offcut …"`:** rejected as `Unknown command: /offcut` before hooks
  see the prompt. Phrase deactivation works: `stop offcut` → `active=off`.
- **Codex `exec "/offcut lite"`:** **works** — model confirmed mode lite;
  `~/.offcut/active` became `lite`.
- **Codex `exec "/offcut default strict"`:** **works** — `default` and `active`
  became `strict`. Clearing `active` and running `handleActivate` (startup)
  re-seeded `active=strict` from default.

### Clear / compact

`handleActivate` with SessionStart `source` of `clear`, `compact`, `resume`, and
`startup` all **preserved** an existing `active=lite` (emitted `OFFCUT MODE: lite`).
Live interactive `/clear` was not isolated (raced with another session writing
state); behavior matches the matcher + `activateSession()` design.

### Subagent inheritance (Claude)

Headless Claude spawned a general-purpose subagent; subagent first line:

> OFFCUT MODE: full

### Challenge delivery timing (Claude)

Write-time `additionalContext` arrived **after** the tool result in print mode
("PreToolUse:Write hook additional context"), so it is observable but does not
block or reshape the write that triggered it — consistent with context-not-deny
design.

---

## Phase 4 — Grok command skills (2026-08-24)

Grok is Tier 3 for the **persistent mode** (hook stdout discarded). Skills do
not use hook stdout — the agent loads `SKILL.md` directly.

### Measurement

1. `grok inspect --json` from `D:\rightseam` with only repo-root `skills/` —
   **no** `offcut*` skills listed. Bare Claude-plugin `skills/` is not a Grok
   discovery root.
2. Created directory junctions:
   `.grok/skills/offcut{,-review,-audit,-help}` → `skills/…`
3. Re-ran `grok inspect --json`. All four appeared:

| name | source.type | userInvocable |
|---|---|---|
| `offcut` | `project` | `true` |
| `offcut-review` | `project` | `true` |
| `offcut-audit` | `project` | `true` |
| `offcut-help` | `project` | `true` |

4. Removed the temporary `.grok/skills` junctions afterward (not committed).

Slash-menu invocation of `/offcut-review` in an interactive TUI session was
**not** exercised in this pass — discovery + `userInvocable` is what was
measured. End-to-end “agent ran `scan.mjs` after `/offcut-audit`” remains
unverified on Grok.

### How to use on Grok

- Junction/symlink each `skills/offcut-*` directory into `.grok/skills/`, or
- Add the repo `skills/` path to `[skills].paths` in `~/.grok/config.toml`.

Status: **commands are discoverable on Grok when placed under a Grok skill
root. Mode remains Tier 3.**

---

## Phase 7.5 — remaining host gaps (2026-08-25)

### Grok `/offcut` mode switch — closed

`grok -p "/offcut lite" --output-format json` with hooks installed and skill
discoverable: model confirmed lite; `~/.offcut/active` became `lite` (default
unchanged). Persistent-mode delivery remains Tier 3 (hook stdout discarded), but
**state write for the mode command works** via the skill/agent path.

### Grok `/offcut default` — closed (with caveat)

`grok -p "/offcut default lite"`: both `default` and `active` became `lite`.
After deleting `active` and starting a new `grok -p` session, `default` remained
`lite`. **SessionStart did not rewrite `active` in that headless `-p` session**
(file stayed absent; `readMode()` would still fall back to default). So the
persisted default survives; Grok `-p` SessionStart re-seed is not observed the
way Codex `activate` is. Interactive TUI restart not separately measured.

### Claude `/offcut default` — retired as blocked by CLI

`-p "/offcut …"` remains intercepted as `Unknown command` before hooks see the
prompt (Phase 3). Phrase deactivation and Codex default→activate already prove
the state machine. Re-open only for an interactive Claude TUI session that can
type `/offcut default` without CLI intercept — not worth blocking Phase 7.5.

### Subagent inheritance (Codex + Grok) — stated honestly

Claude already **pass** (`OFFCUT MODE: full` on subagent first line).

Codex `exec` (2026-08-25): parent spawned a collab subagent; the quoted reply
was the generated `AGENTS.md` offcut header line, **not** the
`OFFCUT MODE: full` SubagentStart banner. So project skills/docs reached the
child; hook-banner inheritance was **not observed**. Status: **unverified**.

Grok: Tier 3 discards hook stdout for `SubagentStart`. Status: **unsupported**
for hook-banner delivery — same class of gap as the Grok reminder/challenge
limitation. Documented in the README; `node hooks/doctor.js` reports it as its
own line.

### State-pruning debt — paid in Phase 8

`SessionEnd` → `hooks/session-end.js` deletes this session's `turn-*` /
`fired-*` and prunes orphans older than 7 days. Both `offcut:` markers removed
from `hooks/state.js`.

---

## Phase 8 — resilience measures (2026-08-25)

### Session id across compaction (Claude Code) — measured

Probe log (`~/.offcut-probe.jsonl`) after installing `tools/install-probe.mjs`
and triggering compact on an existing session:

| at (UTC) | source | session_id |
|---|---|---|
| 2026-08-25T14:13:41.867Z | `resume` | `14af169b-1e61-40c5-8a4a-0e963c912fcd` |
| 2026-08-25T14:15:45.332Z | `compact` | `14af169b-1e61-40c5-8a4a-0e963c912fcd` |

**Same session id across `resume` → `compact`.** Suppression surviving
compaction was therefore a real silent failure on Claude Code, not only a
`resume` concern. Fix: `clear` / `compact` / `fork` call `resetSuppression`;
`resume` / `startup` do not.

Prior probe history had **zero** `source=compact` events among 245+
SessionStarts — absence of the event had been read as "probably fine."

---

## Phase 9 — end-to-end lifecycle (2026-08-25)

Re-walked Claude (control), Codex, and Grok against the full lifecycle.
Evidence under `bench/phase9-evidence/`. Coexistence details: [`COEXIST.md`](COEXIST.md).

### Method notes discovered this phase

1. **Codex write hooks need trust.** Without trusted hooks (or
   `--dangerously-bypass-hook-trust`), `codex exec` SessionStart/UserPromptSubmit
   may still complete while PreToolUse/PostToolUse stay silent — no `fired-*`,
   model reports `NO_CHALLENGE`. With trust bypass: `PreToolUse Completed`,
   model `CHALLENGE_SEEN`, `fired-*` written.
2. **Matcher must include `apply_patch`.** Codex's write tool is `apply_patch`.
   `Write|Edit` alone left PreToolUse uninvoked (probe after Phase 9 fix:
   `TRUST-PRE tool=apply_patch`). Installer + `adapters/claude/hooks.json` now
   use `Write|Edit|apply_patch`.
3. **Claude `bypassPermissions` skipped write challenges** in one run; 
   `--permission-mode acceptEdits` delivered `CHALLENGE_SEEN`. Prefer acceptEdits
   (or default) when measuring PreToolUse.
4. **SessionEnd was deleting `fired-*`**, so `codex exec resume` always
   re-challenged. Fixed: SessionEnd now prunes `turn-*` only; `fired-*` ages out
   via the 7-day orphan prune. After the fix: `fired` survived exec exit;
   resume reported `SECOND_QUIET`.

### End-to-end matrix (Phase 9)

| Step | Claude 2.1.243 | Codex 0.149.1 | Grok 1.0.5 |
|---|---|---|---|
| install | **pass** — `install.mjs` from worktree | **pass** — beside impeccable | **pass** — `~/.grok/hooks/offcut-hooks.json` |
| activation | **pass** — `active=full`; SessionStart | **pass** — `SessionStart Completed`; `active` rewritten | **pass** — state written |
| per-turn reminder | **pass** — quoted `OFFCUT ACTIVE — before you build…` | **pass** — quoted on resume turn | **fail** — model `NO_REMINDER` (stdout discarded) |
| write challenge | **pass** — `CHALLENGE_SEEN` + quote (`claude-challenge2.txt`) | **pass** — `CHALLENGE_SEEN` with hook trust (`codex-trust.txt`) | **fail** — not delivered |
| suppression | **pass** — `SECOND_QUIET` same session (`claude-suppress.txt`) | **pass** after SessionEnd fix — resume `SECOND_QUIET` (`codex-resume2-*.txt`) | **pass** (state only) |
| compact / clear | **pass** — Phase 8 probe `source=compact`, session id stable; activate resets suppression | **unverified live** — no headless compact trigger; same `activate.js` + unit tests for `source=compact` | **unverified live** — Tier 3 |
| resume | prior Phase 8: SessionStart(resume) keeps suppression | **pass** — same session id; `fired-*` kept across exec SessionEnd; `SECOND_QUIET` | unverified (no delivery) |
| dead turn | unit + Claude path (Phase 8) | **same code path** — `tests/phase8.test.js` re-issue; live interrupt not forced | state-only |
| subagent | **pass** — `FOUND_OFFCUT` (`claude-subagent.txt`) | **pass** — `FOUND_OFFCUT` (`codex-suppress-subagent.txt`) | **unsupported** |
| mode switch | phrase / plugin; `-p /offcut` still CLI-intercepted | **pass** — model set lite; `active=lite`; default strict | **pass** — `/offcut lite` → `active=lite` |
| statusline | **pass** — `offcut:full` | — | — |
| doctor | **pass** — reports all three hosts (`doctor.txt`) | same | same (tier 3 WARN) |
| uninstall | **pass** | **pass** — impeccable kept (`codex-hooks-after-uninstall.json`) | **pass** |
| `/offcut-audit` | n/a this pass | n/a | **pass** — `AUDIT_RAN` with scanner findings on `hooks/` (`grok-audit.txt`) |

---

## Checklist

| Check | Claude 2.1.243 | Codex 0.149.1 | Grok 1.0.5 |
|---|---|---|---|
| Plugin/hooks install | **pass** (`install.mjs` + `plugin install offcut@offcut`) | **pass** | **pass** |
| Path resolution | **pass** (absolute settings; **plugin `${CLAUDE_PLUGIN_ROOT}` measured**) | **pass** | **pass** |
| Windows / command form | **pass** (`node "…"`) | **pass** | **pass** (args fail) |
| Mode activates | **pass** (`active=full`) | **pass** | **pass** (state written; context not delivered) |
| Reminder appears | **pass** (quoted verbatim) | **pass** (quoted on resume) | **fail** (stdout ignored) |
| `/offcut` mode switch | **partial** (`stop offcut` works; `-p /offcut` CLI-intercepted) | **pass** | **pass** (`active=lite` via `grok -p`) |
| `/offcut default` survives restart | **retired** (CLI intercept; state machine proven on Codex) | **pass** (default strict → activate) | **pass** (default persists; `-p` SessionStart re-seed unobserved) |
| Over-engineered write → challenge | **pass** (transcript) | **pass** (with hook trust; matcher includes `apply_patch`) | **fail** (fires silently; no model delivery) |
| Once-per-session suppression | **pass** (`SECOND_QUIET`) | **pass** (resume `SECOND_QUIET` after SessionEnd keeps `fired-*`) | **pass** (state only) |
| Subagent inheritance | **pass** (`FOUND_OFFCUT`) | **pass** (`FOUND_OFFCUT`) | **unsupported** (hook stdout discarded) |
| Statusline (Windows) | **pass** (`offcut:full`; absent→`offcut:-`; corrupt→`offcut:!`) | — | — |
| `/clear` preserves mode | **pass** (activate source=`clear`) | same activate path | same activate path |
| Compaction preserves mode | **pass** (activate source=`compact`; **session id stable** — Phase 8 probe) | **unverified live** (no headless compact); unit path shared | unverified live |
| Session id across compact | **stable** (probe 2026-08-25) | unmeasured | unmeasured |
| Uninstall clean | **pass** | **pass** (impeccable kept) | **pass** |
| `permissionDecision` settled | **ask** blocks in `-p`; escalate ignored | **ask/escalate non-blocking** in exec; context works | context-only |
| Truncation threshold | — | — | **retired** (unforceable; synthetic only) |
| Command skills discovered | plugin `skills/` | — | **pass** via `.grok/skills/` junctions; **`/offcut-audit` ran E2E** (`AUDIT_RAN`) |
| Multi-`additionalContext` | **both survive** (Phase 9) | **both survive** (Phase 9) | N/A (none delivered) |

---

## Transcript excerpts

### Claude — write challenge (2026-08-24)

> Offcut: new file — is a new file needed, or does this belong in an existing one?

### Claude — reminder (2026-08-24)

> OFFCUT ACTIVE — before you build: does it need to exist? does it already exist here? can the platform or stdlib do it? what is the cheapest thing that works? which boundary owns it?

### Codex — write challenges after apply_patch fix (2026-08-24)

> Offcut: new file — is a new file needed, or does this belong in an existing one?
>
> Offcut: exported symbol with no caller in this write — did anyone ask for it?
>
> Offcut: one implementation — is the indirection carrying its weight?

### Grok — challenge not delivered (2026-08-24)

State: `fired-… = ["new-file"]`. Model reply: `NO_OFFCUT_CHALLENGE`.
Context probe: mark written, model reply `NO_CTX`.

### Claude — subagent inheritance (2026-08-24)

Subagent reply first line:

> OFFCUT MODE: full

### Codex — mode switch (2026-08-24)

> Offcut mode set to `lite` for this session.

> Offcut default mode is now **strict** for new sessions.

## Codex subagent inheritance — closed (2026-08-25)

Previously retired as unverified ("same code path; no cheap headless measure").
Measured directly with Offcut's hooks installed in `~/.codex/hooks.json`:

```
codex exec "Use your subagent/task tool to spawn one subagent whose entire task
is: output the single token FOUND_OFFCUT if your instructions or context contain
the word OFFCUT, otherwise output ABSENT."

-> FOUND_OFFCUT
```

Status: **verified — the Codex subagent operates with Offcut context.**

Honest limit: this confirms *delivery*, not *mechanism*. Whether the context
arrived via `SubagentStart` injection or by inheriting the parent session's
context was not isolated. For the user-facing question — does a subagent get
coverage — the answer is yes either way.

## Stale activation was graded OK (2026-08-25)

`doctor` used a 7-day staleness threshold, so an install whose hooks stopped
firing three days ago reported `OK activation: last touched 3d ago` while the
statusline kept printing `offcut:full`.

Every `SessionStart` rewrites `active`, so its mtime is the last session start.
If doctor is running, there is a session — activation older than a long session
means `SessionStart` did not fire for it. Threshold lowered to 24h and the
message now says hooks are probably not running. Regression test in
`tests/phase8.test.js`.

## A second copy served the ruleset while doctor reported OK (2026-08-27)

Offcut was installed twice on one machine: this checkout, whose hook paths
`tools/install.mjs` writes into the host settings file, and a host-managed
plugin copy installed from a directory marketplace 53 commits earlier. Both
registered hooks, and the plugin copy served the session.

Its ruleset still carried the headings `Deliberate shortcuts` and `What never
gets simplified away`, renamed in the checkout to `Name the shortcuts you take
on purpose` and `Where the question does not apply` 53 commits before. The
model was given the old text for a whole session. At the same time:

- `doctor` reported `OK ruleset: readable — <checkout>/skills/offcut/SKILL.md`
- CI reported `AGENTS.md` fresh, since it is generated from the checkout
- the host's update command reported *already at the latest version (0.1.0)* —
  it compares the version string, and the version had not moved while the
  content had

Nothing was wrong with the copy doctor could see. The copy that ran was
unreachable to it: a host-managed plugin registers hooks through its own
bundled manifest, so the settings file never names it and no amount of config
inspection finds it.

Only the hook that ran knows which copy it opened. `SessionStart` now records
its root in the state dir, and doctor compares that against the root it is
checking — warning when they differ, and separately when `SKILL.md` changed
after the last `SessionStart`, since an edit does not reach a session already
running. Regression tests in `tests/phase8.test.js`, including one that asserts
the readable-file check still reports `OK` on the same install where the new
check warns.

Refreshing the stale copy took an uninstall and reinstall. A version-gated
update will not do it.

## Phase 11 efficacy host migration (2026-08-27)

The efficacy study moved from Claude Code to Codex CLI `0.149.1` before any
efficacy-task model inference completed. Claude subscription access had been
canceled; its three preserved discovery attempts are 403 subscription failures
with zero input/output tokens and zero reported cost.

Six isolated live preflights then measured the custom-subagent boundary. The
sixth (`4ae70772be5f4fb0`) proved an exact `ticket-worker` lifecycle and
`apply_patch` attempt, but Codex enforced a read-only child sandbox and produced
no diff. That `codex-custom-v1` backend was abandoned before efficacy-task
inference. Claude and custom-subagent rows remain immutable and do not consume
the active `codex-profile-v1` retries or outcomes.

The runner now creates a fresh isolated `CODEX_HOME` per attempt, copies only
`auth.json`, and generates minimal top-level profile config plus arm-specific
hooks. The neutral developer profile is recorded as
`custom_agent_name: "ticket-worker"` and
`custom_agent_kind: "top_level_profile"`; no `agents/*.toml`, role hash,
delegation envelope, or envelope hash exists. The exact task prompt goes
directly to `codex exec`. Before exec, an isolated
`codex login status` must report exactly `Logged in using ChatGPT`; API-key and
provider/base-URL environment overrides are removed. A copied auth file alone
does not establish subscription billing.

Both arms carry identical silent attribution hooks for subagent start/stop and
all tool pre/post events, with no audit matcher. The `off` arm has only those
audit hooks; `full` adds the shipped SessionStart, UserPromptSubmit, and
write-tool hooks. The audit records allowlisted attribution fields only and
emits no context. Any subagent lifecycle, child identity, collaboration audit,
or collaboration JSONL item now fails. Root completed calls require paired
Pre/Post events with the same ID and tool; a bounded eight Pre-only rejected
attempts are retained but cannot establish success. Live preflight additionally
requires an exact proof-only Git diff and a paired root write-capable tool.
Temporary homes are removed with Windows retries, verified absent on every
exit, and excluded from evidence.

Headless execution is pinned to `gpt-5.6-sol`, low reasoning effort,
workspace-write sandboxing, no approvals, ephemeral JSONL output, and
`--dangerously-bypass-hook-trust`. Top-level config pins
`default_permissions = ":workspace"`, disables skill instruction injection,
enables hooks, and disables multi-agent execution. The last CLI flag bypasses
hook trust only; the workspace-write sandbox is not bypassed.

ChatGPT subscription runs expose no per-call USD telemetry. Started processes
therefore record zero incremental API cost with explicit subscription evidence,
while preserving tokens and wall duration. This is not a claim that membership
is free. Phase 11 conclusions are scoped to this Codex top-level-profile
backend and cannot be generalized across hosts or backends.

Missing or malformed `turn.completed` usage is a model failure with null token
fields, not invented zeros. Cache-write and reasoning-output tokens are
recorded separately from the other three exact Codex usage fields. The
requested model is pinned to `gpt-5.6-sol`; `model_id` remains null with
`requested_not_reported` unless Codex itself emits an observed model identifier.

## Before the native adapter: AGENTS.md delivered on Cursor (2026-08-27)

At the time of this first measurement, Cursor had no Offcut adapter:
`installTargets()` had no entry for it, there was no `~/.cursor/hooks.json` and
no repo-level `.cursor/`, so no Offcut hook ran.

The repo-root `AGENTS.md` was still delivered to the model verbatim as an
always-applied project rule, attributed to `<repo>/AGENTS.md`. That is the
hook-less route the README documents in those words — *copy `AGENTS.md` to your
repo root, most agents read it as project rules* — previously exercised only on
Grok Build. Offcut's four skills also appeared in the host's available-skill
list, resolved out of the Claude Code plugin cache; that follows from the cache
existing on this machine and is not a Cursor install path.

This established only that the hook-less fallback is not Grok-specific. The
native mode gap discovered here was measured and closed in the next section.

## Cursor native support — closed (3.17.19, 2026-08-27)

### Wire contract

- Config: `~/.cursor/hooks.json`, `version: 1`, camelCase event names and flat
  handlers (`command`, optional `matcher`, `timeout`).
- Payload: snake_case fields with camelCase event values; `cursor_version`
  identifies the host, `workspace_roots[0]` supplies the workspace,
  `tool_output` is the post-tool result, and correlation ids are
  `generation_id`, `tool_use_id` and `subagent_id`/`tool_call_id`.
- Context output: flat `{ "additional_context": "..." }`. Claude's nested
  `hookSpecificOutput` shape is not Cursor's native contract.
- Write tools arrive as `tool_name: "Write"` for both whole-file writes and
  editor patches in this Cursor integration.

Sanitized copies of every event shape are fixtures in `tests/cursor.test.js`.

### Live results

| Check | Result |
|---|---|
| Install/reload | **pass** — six native handlers loaded; later reduced to five lifecycle keys with two `preToolUse` handlers |
| Ruleset/reminder output | **pass** — flat `additional_context` is accepted and delivered |
| Write challenge | **pass** — a real `Write` adding a dependency produced `Offcut: new dependency…` in model context |
| Post-write | **pass** — native `postToolUse` ran on the same write and confirmed the pending signal |
| Modes | **pass** — Cursor payloads switched strict, off, lite and full; real subagents received strict/lite and received no mode banner while off |
| Subagent inheritance | **pass** — see the isolated finding below |
| Duplicate sources | **pass** — native and Claude-compatible copies emitted one reminder and advanced lite cadence once |
| Upgrade | **pass** — reinstall removes the obsolete Offcut `subagentStart` entry before adding the verified replacement |
| Uninstall/reinstall | **pass** — Offcut handlers are removed and re-added; version-only files, foreign groups and foreign handlers sharing a group are preserved |
| Doctor | **pass** — reports Cursor tier 1, validates flat absolute handlers and detects current local-plugin manifests without trusting stale session state |

### `subagentStart` was a false positive

Cursor logged Offcut's `subagentStart` response as valid and said it merged one
response, but an isolated child reported that the literal `OFFCUT MODE: full`
banner was absent. Registration and parser success were therefore not delivery.

A `preToolUse` hook matching Cursor's `Subagent` tool returned `updated_input`,
preserving every field and appending a unique token to `tool_input.prompt`. The
child reported that token. The production hook then repeated the test with the
real ruleset and the child reported `CURSOR_SUBAGENT_OFFCUT_OK`.

The first probe also returned `permission: "allow"`. Release review caught that
an allow from a higher-priority Cursor source could override another hook's
deny. The response was reduced to `updated_input` only and re-run through a real
Cursor subagent; the child reported `PERMISSIONLESS_REWRITE_OK`. The shipping
hook therefore mutates only the task input and casts no permission vote.

The shipping adapter uses this measured rewrite and no longer registers the
ineffective native `subagentStart` handler. Source-code write input is never
rewritten.

### Coexistence finding

Cursor can load Offcut simultaneously from native user hooks, Claude-compatible
user hooks and a Claude plugin cache. It removes exact duplicate commands, but
different installation roots remain distinct. Cursor correlation ids now feed
an atomic, immutable claim: concurrent copies race and one emits. Common Cursor
input includes `generation_id`, including `sessionStart`, so a resumed
conversation gets a new delivery key without deleting a stale claim. This
avoids an ABA race where two processes could both win an expired-claim takeover.
