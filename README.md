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
(with a Windows `where node` guard). That is required: `${CLAUDE_PLUGIN_ROOT}`
is not set for settings/hooks-dir installs, and Grok silently ignores an `args`
array. See `HOSTS.md`. Hooks load at session start — open a **new** session
after installing.

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
| Claude Code | Tier 1 — measured 2026-08-24 | Full mode via hooks |
| Codex | Tier 1 — measured 2026-08-24 | Same config; snake_case payload |
| Grok Build | Tier 1 — measured 2026-08-24 | Same config; **camelCase** payload |
| Cursor | **Untested** | Deferred; different config schema |
| ChatGPT / other skill hosts | Tier 2 — skill only | No persistent mode |
| AGENTS.md readers | Tier 3 — instructions only | Generated file |

A host is never listed as supported without a probe run. Vendor documentation
alone is not enough — Grok's payload dialect disagrees with its own config docs.

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
