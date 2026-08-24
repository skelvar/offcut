# Offcut

**Ask what the cheapest thing that works is. Every turn. Before the code lands.**

Offcut is a persistent mode for coding agents, delivered through lifecycle hooks.
The instruction text is the payload. The hooks are the product: the challenge is
re-asked every turn (and, in a later phase, again before a write).

## Install

Requires **Node.js** on `PATH`. Zero runtime dependencies.

### Claude Code

```bash
# from a clone of this repo, or add it as a marketplace
claude plugin marketplace add ./   # or your fork URL
claude plugin install offcut
```

The plugin wires `adapters/claude/hooks.json` automatically via
`.claude-plugin/plugin.json`.

### Codex

Install the same PascalCase hooks config. Codex accepts the Claude-shaped
`hooks.json` unchanged:

```bash
# point Codex at adapters/claude/hooks.json using its hooks install path
# (see Codex docs for project vs user hooks)
```

Copy or symlink `adapters/claude/hooks.json` into the Codex hooks location, and
ensure the `node …/hooks/*.js` paths resolve (set `CLAUDE_PLUGIN_ROOT` or
`PLUGIN_ROOT` to this repo root, or edit the paths).

### Grok Build

Grok Build also accepts the same PascalCase config. Install
`adapters/claude/hooks.json` as a project or user hook file. Grok sends a
**camelCase** payload at runtime — Offcut's `hooks/host.js` detects that from
the payload and adapts. Do not rewrite the config to camelCase event keys.

```bash
# e.g. project hooks
cp adapters/claude/hooks.json .grok/hooks/offcut.json
# ensure CLAUDE_PLUGIN_ROOT or PLUGIN_ROOT points at this checkout
```

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

| Mode | Reminder |
|---|---|
| `full` (default) | Every turn |
| `lite` | Every third turn |
| `strict` | Every turn (write-time escalation lands in Phase 2) |
| `off` | Silent |

```text
/offcut full
/offcut lite
/offcut strict
/offcut off
/offcut default lite    # persist for new sessions
```

Deactivate: `/offcut off`, `stop offcut`, or `normal mode`.

State lives in `~/.offcut/` (`active`, `default`, `turn`). Override with
`OFFCUT_STATE_DIR` for tests.

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
