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

Write-time signals (deterministic, no model call): new file, large first write,
new dependency, speculative abstraction, config-for-a-constant. After a write:
exported-unused, new config surface, single-call wrapper, unused default param.
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

## What gets installed / created

| Path | Role |
|---|---|
| `skills/offcut/SKILL.md` | Challenge text (source of truth) |
| `hooks/*.js` | Lifecycle hooks |
| `adapters/claude/hooks.json` | Hook wiring (Claude / Codex / Grok) |
| `AGENTS.md` | Generated; do not hand-edit |
| `~/.offcut/*` | Runtime mode state (created on first activate) |

Uninstall: remove the plugin / hooks config and delete `~/.offcut/`. Only Offcut
files are involved.

## Host support matrix

| Host | Status | Notes |
|---|---|---|
| Claude Code | Tier 1 — measured 2026-08-24 | Full mode. Challenge observed in a real transcript |
| Codex | Tier 1 — measured 2026-08-24 | Full mode. Challenge observed in a real transcript |
| Grok Build | **Tier 3** — measured 2026-08-24 | Hooks run but deliver nothing; use `AGENTS.md`. See below |
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

**What to use instead:** Grok auto-loads `AGENTS.md` as project rules, and
Offcut generates that file. You get the always-on ruleset, without modes,
commands, or write-time challenges. Install it by putting `AGENTS.md` at your
repo root — no hook configuration needed.

## Develop

```bash
node --test tests/*.test.js
node scripts/build-agents-md.js
```

## Security

Hooks make no network calls, install no dependencies, spawn no subprocesses,
read only the state file and ruleset, and write only the state file / session
markers. No binaries ship in the plugin.

## License

MIT
