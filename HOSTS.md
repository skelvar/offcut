# HOSTS.md — Offcut real-harness verification

Dated results from Phase 3. A host counts as verified only when a challenge was
observed in a real session. Installing successfully is not verification.

---

## Environment

| Field | Value |
|---|---|
| Date started | 2026-08-24 |
| Date closed | 2026-08-24 (follow-up same day) |
| OS | Windows |
| Node | v24.16.0 |
| Claude Code | 2.1.240 |
| Codex | 0.149.1 |
| Grok Build | 1.0.5 (5115b46bc9) [stable] |
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

## Checklist

| Check | Claude 2.1.240 | Codex 0.149.1 | Grok 1.0.5 |
|---|---|---|---|
| Plugin/hooks install | **pass** (`install.mjs` + `plugin install offcut@offcut`) | **pass** | **pass** |
| Path resolution | **pass** (absolute settings; **plugin `${CLAUDE_PLUGIN_ROOT}` measured**) | **pass** | **pass** |
| Windows / command form | **pass** (`node "…"`) | **pass** | **pass** (args fail) |
| Mode activates | **pass** (`active=full`) | **pass** | **pass** (state written; context not delivered) |
| Reminder appears | **pass** (quoted verbatim) | not separately quoted | **fail** (stdout ignored) |
| `/offcut` mode switch | **partial** (`stop offcut` works; `-p /offcut` CLI-intercepted) | **pass** | **pass** (`active=lite` via `grok -p`) |
| `/offcut default` survives restart | **retired** (CLI intercept; state machine proven on Codex) | **pass** (default strict → activate) | **pass** (default persists; `-p` SessionStart re-seed unobserved) |
| Over-engineered write → challenge | **pass** (transcript) | **pass** (transcript) | **fail** (fires silently; no model delivery) |
| Once-per-session suppression | **pass** (`fired-*` state) | **pass** (`fired-*`) | **pass** (state only) |
| Subagent inheritance | **pass** (`OFFCUT MODE: full`) | **unverified** (banner not observed in headless spawn) | **unsupported** (hook stdout discarded) |
| Statusline (Windows) | **pass** (`offcut:full`; absent→`offcut:-`; corrupt→`offcut:!`) | — | — |
| `/clear` preserves mode | **pass** (activate source=`clear`) | same activate path | same activate path |
| Compaction preserves mode | **pass** (activate source=`compact`; **session id stable** — Phase 8 probe) | same activate path | same activate path |
| Session id across compact | **stable** (probe 2026-08-25) | unmeasured | unmeasured |
| Uninstall clean | **pass** | **pass** (impeccable kept) | **pass** |
| `permissionDecision` settled | **ask** blocks in `-p`; escalate ignored | **ask/escalate non-blocking** in exec; context works | context-only |
| Truncation threshold | — | — | **retired** (unforceable; synthetic only) |
| Command skills discovered | plugin `skills/` | — | **pass** via `.grok/skills/` junctions (`grok inspect`); bare `skills/` miss |

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
