# HOSTS.md — Offcut real-harness verification

Dated results from Phase 3. A host counts as verified only when a challenge was
observed in a real session. Installing successfully is not verification.

---

## Environment

| Field | Value |
|---|---|
| Date started | 2026-08-24 |
| OS | Windows |
| Node | v24.16.0 |
| Claude Code | 2.1.240 |
| Codex | 0.149.1 |
| Grok Build | 1.0.5 (5115b46bc9) [stable] |
| Branch | `phase-3-real` |
| Repo | `D:\rightseam` |

Synthetic suite at start of Phase 3: **75/75 passing** (`node --test tests/*.test.js`).

---

## Known-unverified #1 — `${CLAUDE_PLUGIN_ROOT}` path resolution

### Measurement (2026-08-24)

Reused existing `tools/probe.mjs` install (absolute single-string commands). Across
**261** prior probe entries, hook subprocess env contained only:

- Claude (settings.json hooks): `CLAUDECODE`, `CLAUDE_PROJECT_DIR`
- Grok (`~/.grok/hooks/`): `GROK_SESSION_ID`, `CLAUDE_PROJECT_DIR` (leak)

**`CLAUDE_PLUGIN_ROOT` and `PLUGIN_ROOT` never appeared** in any settings/hooks-dir
install. Confirmed again with `tools/measure-command-form.mjs` headless runs:
both fields stay `null` on Claude settings hooks and Grok hooks-dir hooks.

That is the silent-failure mode: `${CLAUDE_PLUGIN_ROOT}` expands empty
→ `node /hooks/activate.js` → fail-open, no challenge.

Grok docs (`~/.grok/docs/user-guide/10-hooks.md`): command strings support `${VAR}` /
`$VAR` expansion at run time; there is no documented `args` array. Empty var → bad path.

Claude Code docs: `${CLAUDE_PLUGIN_ROOT}` is for **plugin-installed** hooks. Not yet
re-measured under `claude plugin install` (settings-path installs are the Codex/Grok path).

### Decision (cheapest that works)

Packaging concern only — hook scripts unchanged:

1. `adapters/claude/hooks.json` keeps `${CLAUDE_PLUGIN_ROOT}` for Claude **plugin** install,
   but now as a **single `command` string** (no `args`).
2. `tools/install.mjs` (same safety contract as `install-probe.mjs`): backup, merge, tag,
   reversible — writes **absolute** paths as a single `command` string for settings /
   Codex / Grok installs.

Status: **fixed via installer; E2E activation still pending.**

---

## Known-unverified #2 — Windows / `args` command form

### Measurement (2026-08-24) — controlled A/B

Harness: `tools/measure-command-form.mjs` writes `~/.offcut-cmd-form-mark` on run.
Undo of measure hooks verified before each reliance (strip by tag; impeccable left on Codex).

| Host | Single-string `node "…/script" LABEL` | `command:"node"` + `args:[script, LABEL]` |
|---|---|---|
| Grok 1.0.5 | **fires** (mark=`STRING-FORM`) | **silent fail** — write succeeds, no mark |
| Claude 2.1.240 | **fires** | **fires** (mark=`ARGS-FORM`) |
| Codex 0.149.1 | (not re-run; string form already proven by prior probes) | **fires** (mark=`ARGS-FORM`) |

**Grok ignores `args`.** The previous `adapters/claude/hooks.json` shape would have
installed as bare `node` on Grok and done nothing — fail-open, no challenge.

Windows Node guard measured on Grok:

```text
cmd /c "where node >nul 2>&1 && node ""D:/…/script.mjs"" WIN-GUARD"
```

→ mark=`WIN-GUARD`. Missing `node` → `where` fails → hook exits non-zero → host fail-open.

Mid-session hook file drops are **not** picked up on Grok; hooks load at session start.
Fresh headless `grok -p` sessions were used for measurement.

Status: **fixed — adapter + installer use single-string (+ win32 where-guard).**

---

## Known-unverified #3 — `permissionDecision`

Grok (measured earlier, recorded in `host.js`): only `allow`|`deny`; `ask`/`escalate` ignored;
strict mode already degrades to `additionalContext`.

Claude / Codex: pending temporary hooks returning each candidate.

Status: **Claude/Codex unsettled.**

---

## Known-unverified #4 — Real truncation

Prior probe log: `toolInputTruncated` key appears on Grok PreToolUse payloads, but
**zero** entries with `toolInputTruncated: true`. Threshold unknown.

Status: **unverified — force oversized write pending.**

---

## Checklist (fill as we go)

| Check | Claude | Codex | Grok |
|---|---|---|---|
| Plugin/hooks install | | | |
| Path resolution | | | |
| Windows / command form | | | |
| Mode activates | | | |
| Reminder appears | | | |
| `/offcut` mode switch | | | |
| `/offcut default` survives restart | | | |
| Over-engineered write → challenge | | | |
| Once-per-session suppression | | | |
| Subagent inheritance | | | |
| Statusline (Windows) | | | |
| `/clear` preserves mode | | | |
| Compaction preserves mode | | | |
| Uninstall clean | | | |
| `permissionDecision` settled | | | |
| Truncation threshold | — | — | |
