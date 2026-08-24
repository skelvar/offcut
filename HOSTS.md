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

Status: **fixed for settings installs. Claude plugin-install path still unmeasured.**

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

Status: **unverified — threshold unknown. Flag handling remains tested only with
synthetic payloads. Do not claim a size.**

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

## Checklist

| Check | Claude 2.1.240 | Codex 0.149.1 | Grok 1.0.5 |
|---|---|---|---|
| Plugin/hooks install | **pass** (`install.mjs`) | **pass** | **pass** |
| Path resolution | **pass** (absolute) | **pass** | **pass** |
| Windows / command form | **pass** (`node "…"`) | **pass** | **pass** (args fail) |
| Mode activates | **pass** (`active=full`) | **pass** | **pass** (state written; context not delivered) |
| Reminder appears | **pass** (quoted verbatim) | not separately quoted | **fail** (stdout ignored) |
| `/offcut` mode switch | **partial** (`stop offcut` works; `-p /offcut` CLI-intercepted) | **pass** | unverified |
| `/offcut default` survives restart | unverified (CLI intercept) | **pass** (default strict → activate) | unverified |
| Over-engineered write → challenge | **pass** (transcript) | **pass** (transcript) | **fail** (fires silently; no model delivery) |
| Once-per-session suppression | **pass** (`fired-*` state) | **pass** (`fired-*`) | **pass** (state only) |
| Subagent inheritance | **pass** (`OFFCUT MODE: full`) | unverified | unverified |
| Statusline (Windows) | **pass** (`offcut:full` via `statusline.ps1`) | — | — |
| `/clear` preserves mode | **pass** (activate source=`clear`) | same activate path | same activate path |
| Compaction preserves mode | **pass** (activate source=`compact`) | same activate path | same activate path |
| Uninstall clean | **pass** | **pass** (impeccable kept) | **pass** |
| `permissionDecision` settled | **ask** blocks in `-p`; escalate ignored | **ask/escalate non-blocking** in exec; context works | context-only |
| Truncation threshold | — | — | **unverified** |

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
