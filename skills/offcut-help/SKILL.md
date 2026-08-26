---
name: offcut-help
description: >
  Explain Offcut modes, commands, and how to turn it off. Use when the user
  asks how Offcut works, what /offcut modes mean, what review/audit do, or
  invokes /offcut-help. Do not use for reviewing a diff, auditing a repository,
  implementing features, or answering unrelated coding questions.
license: MIT
compatibility: Text only. No Node.js required. Touches no mode state.
metadata:
  version: "0.1.0"
  author: xyzbk
---

# Offcut help

Commands are not modes. Answer from this card; do not change Offcut state.

## Modes (persistent)

Stored under `~/.offcut/` (override with `OFFCUT_STATE_DIR`). Change how every
turn behaves until switched.

| Mode | Behavior |
|---|---|
| `full` | Reminder every turn (default) |
| `lite` | Reminder every third turn |
| `strict` | Reminder every turn; escalate new dependencies on hosts that honor it |
| `off` | Silent |

```text
/offcut full
/offcut lite
/offcut strict
/offcut off
/offcut default lite    # persist for new sessions
```

Deactivate: `/offcut off`, `stop offcut`, or `normal mode`.

## Commands (one-shot)

Invoked as skills. **Touch no state.** Leave the mode exactly as found.

| Command | Does |
|---|---|
| `/offcut-review` | Run signals against a diff via `scripts/scan.mjs --diff` |
| `/offcut-audit` | Run signals across files via `scripts/scan.mjs <paths>` |
| `/offcut-help` | This card |

Automatic invocation uses each skill's `description`. The `UserPromptSubmit`
hook only parses mode switches — it does not detect "review" / "audit" intent.

## Mode vs scan

The persistent mode never initiates a repository scan. It reacts to the turn
and the write in front of it. An explicit review/audit command is the user
asking for a scan.

## Hosts (short)

- Claude Code / Codex: hooks deliver the persistent mode (see `docs/development/HOSTS.md`).
- Grok Build: hooks run but discard the output Offcut needs — use `AGENTS.md`
  for the ruleset. Command skills may still work when discovered (see README /
  `docs/development/HOSTS.md`).
