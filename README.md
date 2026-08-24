# Offcut

**Ask what the cheapest thing that works is. Every turn. Before the code lands.**

Offcut is a persistent mode for coding agents, delivered through lifecycle hooks.
The instruction text is the payload. The hooks are the product: the challenge is
re-asked every turn, again before a write, and once more after — naming what was
added that nobody asked for.

## Install

Requires **Node.js** on `PATH`. Zero runtime dependencies.

### All three hosts (recommended)

```bash
node tools/install.mjs            # merge into Claude / Codex / Grok configs
node tools/install.mjs --uninstall
```

The installer writes **absolute** script paths as a single `command` string
(`node "…/hooks/….js"`). That is required: `${CLAUDE_PLUGIN_ROOT}` is not set
for settings/hooks-dir installs, and Grok silently ignores an `args` array.
See `HOSTS.md`. Hooks load at session start — open a **new** session after
installing. Node.js must be on `PATH`; without it hooks fail open.

### Claude Code (plugin)

```bash
# from a clone of this repo, or add it as a marketplace
claude plugin marketplace add ./   # or your fork URL
claude plugin install offcut
```

The plugin wires `adapters/claude/hooks.json` automatically via
`.claude-plugin/plugin.json` (placeholder `${CLAUDE_PLUGIN_ROOT}`). Prefer
`tools/install.mjs` when sharing one checkout across Claude settings, Codex,
and Grok.

### Skill-only hosts (no hooks)

Hosts that discover Agent Skills but have no lifecycle hooks get
`skills/offcut/SKILL.md` on demand — **not** the persistent mode. There is no
per-turn reminder and no write-time enforcement on those hosts.

`AGENTS.md` is a generated Tier-3 projection of the same challenge for agents
that only read a project rules file.

### Statusline (optional)

```bash
# bash
hooks/statusline.sh

# Windows PowerShell
powershell -NoProfile -File hooks/statusline.ps1
```

Wire the script into your host's statusline setting. Output looks like
`offcut:full`. Paths with shell metacharacters in `OFFCUT_STATE_DIR` are refused.

## Modes

| Mode | Reminder | Write-time |
|---|---|---|
| `full` (default) | Every turn | Challenge via context; never blocks |
| `lite` | Every third turn | Same as full |
| `strict` | Every turn | Same, plus human prompt on new dependencies |
| `off` | Silent | Silent |

Write-time signals (deterministic, no model call): large first write, new
dependency, speculative abstraction, config-for-a-constant. After a write:
new config surface, single-call wrapper, unused default param. `exported-unused`
runs on diff/repo scans only (not decidable from a single write). `new-file` was
deleted in Phase 6 — creating a file is not evidence of over-engineering.
Each signal fires at most once per session. Truncated tool payloads stay silent.

```text
/offcut full
/offcut lite
/offcut strict
/offcut off
/offcut default lite    # persist for new sessions
```

Deactivate: `/offcut off`, `stop offcut`, or `normal mode`.

State lives in `~/.offcut/` (`active`, `default`, `turn-<session>`,
`fired-<session>`). Override with `OFFCUT_STATE_DIR` for tests.

## Commands (one-shot)

Commands are **not** modes. They run once, touch no Offcut state, and leave the
mode exactly as they found it. Invoked as Agent Skills (`/offcut-review`,
`/offcut-audit`, `/offcut-help`) — not via the `UserPromptSubmit` hook.

| Command | Does |
|---|---|
| `/offcut-review` | Apply signals to a unified diff via `scripts/scan.mjs --diff` |
| `/offcut-audit` | Apply signals across a file set / tree via `scripts/scan.mjs <paths>` |
| `/offcut-help` | Modes, commands, how to turn it off |

The scanner imports the same `hooks/signals.js` definitions the write hooks use.
Signals declare which contexts they apply to (`write` / `diff` / `repo`):
`large-first-write` never fires in a repo audit.

**Mode vs scan:** the persistent mode never initiates a repository scan. It
reacts to the turn and the write in front of it. An explicit review/audit
command is the user asking for a scan.

```bash
node scripts/scan.mjs --diff changes.diff
node scripts/scan.mjs hooks skills scripts
```

## What gets installed / created

| Path | Role |
|---|---|
| `skills/offcut/SKILL.md` | Challenge text (source of truth) |
| `skills/offcut-review/` | Diff review command |
| `skills/offcut-audit/` | Repo audit command |
| `skills/offcut-help/` | Help command |
| `scripts/scan.mjs` | Shared scanner for review/audit |
| `hooks/*.js` | Lifecycle hooks |
| `adapters/claude/hooks.json` | Hook wiring (Claude / Codex / Grok) |
| `AGENTS.md` | Generated; do not hand-edit |
| `~/.offcut/*` | Runtime mode state (created on first activate) |

Uninstall: remove the plugin / hooks config and delete `~/.offcut/`. Only Offcut
files are involved.

## Language coverage

The write-time challenge is JavaScript/TypeScript only.

| | |
|---|---|
| **Full** — reminder + write-time challenge | `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx`, plus dependency manifests |
| **Reminder only** — no write-time challenge | everything else: `.py` `.go` `.rs` `.rb` `.php` `.java` `.kt` `.swift` `.sh` `.sql` |

The signals are syntax-level checks written against JS/TS. Run against other
languages ungated they produced 65% false positives on Python and 100% on JSON,
so they are gated by file extension.

On a non-JS project Offcut still activates, switches modes, shows a statusline,
and re-asks the question every turn — but it will not challenge an individual
write. Measured 2026-08-25: a Python one-implementor `ABC` plus a single-call
wrapper produces no challenge, where the identical TypeScript does.

## Host support matrix

| Host | Status | Notes |
|---|---|---|
| Claude Code | Tier 1 — measured 2026-08-24 | Full mode. Challenge observed in a real transcript |
| Codex | Tier 1 — measured 2026-08-24 | Full mode. Challenge observed in a real transcript |
| Grok Build | **Tier 3** mode; **commands work** — measured 2026-08-24 | Hooks discard output; `AGENTS.md` for ruleset. Skills under `.grok/skills/` are discovered (see below) |
| Cursor | **Untested** | Deferred; different config schema |
| ChatGPT / other skill hosts | Tier 2 — skill only | No persistent mode |
| Other AGENTS.md readers | Tier 3 — instructions only | Generated file |

A host is listed as supported only when a challenge was **observed in a real
transcript**. Installing successfully is not verification, and vendor
documentation is not either — Grok's payload dialect contradicts its own config
docs, and its delivery behavior contradicts the tier we assumed.

### Grok Build is Tier 3, not Tier 1

Offcut's hooks install and run correctly on Grok — state is written, signals
fire, the statusline updates. **The model never sees any of it.** Grok's own
hook documentation says so:

> `UserPromptSubmit` is observe-only: grok ignores its exit code and its stdout

> For events like `SessionStart` or `PostToolUse`, stdout is ignored. Just exit
> 0 on success.

That removes the session ruleset, the per-turn reminder, and the post-write
check. Only `PreToolUse` reads stdout, and there only a `deny` decision is
reliably honored — which Offcut never issues by design.

Measured 2026-08-24: hook fired, `fired-… = ["new-file"]` written to state,
model replied `NO_OFFCUT_CHALLENGE`. A direct context probe replied `NO_CTX`.

**What to use instead for the mode:** Grok auto-loads `AGENTS.md` as project
rules, and Offcut generates that file. You get the always-on ruleset, without
modes or write-time challenges. Put `AGENTS.md` at your repo root — no hook
configuration needed.

**Commands on Grok:** skills are different from hooks — the agent loads them
directly, so nothing depends on hook stdout. Measured 2026-08-24 with
`grok inspect --json`: skills linked under `.grok/skills/` appear as
`source=project` with `userInvocable=true` (`offcut-review`, `offcut-audit`,
`offcut-help`). Bare repo-root `skills/` is **not** auto-discovered by Grok.
Wire them with directory junctions/symlinks into `.grok/skills/`, or add the
repo `skills/` directory to `[skills].paths` in `~/.grok/config.toml`. See
`HOSTS.md`.

## Does it change what the agent builds?

Phase 5 measured that on Claude Code with model `claude-sonnet-5`: four small
Node tasks, arms `off` vs `full`, five runs each, interleaved. Offcut fired on
every `full` run and on no `off` run. **No detectable effect** on size metrics
(files created, lines, abstractions, unused exports, deps, config keys) in that
sample — all 40 runs passed acceptance. Details: `bench/RESULTS.md`. Re-run with
`node bench/schedule.mjs` (costs model money; dry-run with `--stub-matrix` first).

## Develop

```bash
node --test tests/*.test.js
node scripts/build-agents-md.js
node scripts/scan.mjs --diff - < changes.diff
```

## Security

**Hooks** make no network calls, install no dependencies, spawn no subprocesses,
read only the state file and ruleset, and write only the state file / session
markers. No binaries ship in the plugin.

**Commands** are user-invoked and may read the repository because that is what
the user asked for. `scripts/scan.mjs` still makes no network calls, modifies no
files, spawns no subprocesses, and does not touch Offcut state. The persistent
mode never initiates a scan on its own.

## License

MIT
