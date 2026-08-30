# Offcut Native Defaults and Competitive Proof Design

**Date:** 2026-08-30
**Status:** Approved for execution by the repository owner

## Objective

Make Offcut active by default through each supported harness's persistent native
instruction surface, keep hooks as lifecycle controls and a compatibility
fallback, and produce reproducible provider-reported evidence for concise output
and competitor comparisons.

This phase does not build a proxy, daemon, MCP server, output-style takeover, or
model-configuration layer. Those add runtime cost or couple Offcut to one
harness without improving its construction decisions.

## Acceptance contract

1. A valid native Codex plugin exists at `.codex-plugin/plugin.json`, with the
   default `hooks/hooks.json` entrypoint.
2. One installer makes the Offcut kernel persistent for every detected host:
   Codex, Claude Code, Cursor, and Grok Build.
3. Installing and uninstalling is reversible and preserves foreign content.
4. Hooks do not repeat the full kernel when native guidance is already present.
   They emit only session mode/style state. Hook-only installs retain the full
   fallback.
5. `/offcut off` overrides a persistent installation for the session, and
   `/offcut concise off` changes response style without disabling construction
   rules.
6. Doctor reports the native instruction source and duplicate or missing state.
7. A completed live concise-style benchmark has executable acceptance, blinded
   completeness review, provider token/cache metrics, and a receipt.
8. A completed head-to-head benchmark compares baseline, `Be terse.`, Caveman,
   Ponytail, and Offcut with exact source hashes and the same task/model/harness.
9. Claims remain scoped to measured tasks. Ponytail's published aggregate
   numbers are a target, not a result Offcut may copy or imply.

## Architecture

### Canonical kernel

`rules/offcut.md` owns the model-facing construction and response contract.
`scripts/build-agents-md.js` derives:

- root `AGENTS.md` for repository-native loading;
- `skills/offcut/SKILL.md` as a compatibility/marketplace wrapper; and
- `rules/offcut.mdc` for Cursor's native rule directory.

Generated artifacts carry a header and are checked byte-for-byte in tests. This
removes the skill as the source of truth while retaining compatibility with
hosts and marketplaces that discover skills.

### Native persistence

`tools/install.mjs` owns install/uninstall for both hooks and guidance:

| Host | Persistent native destination |
|---|---|
| Codex | active global `AGENTS.override.md`, otherwise `AGENTS.md` |
| Claude Code | `~/.claude/CLAUDE.md` |
| Cursor | `~/.cursor/rules/offcut.mdc` |
| Grok Build | `~/.grok/AGENTS.md` |

Shared Markdown files use a bounded managed block. Cursor uses a dedicated file.
Install creates only inside an already detected harness directory, makes a
backup before modifying an existing file, and uninstall removes only Offcut's
block or dedicated file.

The destinations follow the current official host surfaces: Codex global
AGENTS files, Claude user memory, Cursor user rules, and Grok global rules.
Grok plugin packaging stays Claude-compatible because Grok documents Claude
plugin compatibility; no undocumented `.grok-plugin` manifest is invented.

### Hook responsibility

Hooks own lifecycle state, strict write-time escalation, and compatibility:

- native guidance present + active: emit only `OFFCUT MODE` and `OFFCUT STYLE`;
- native guidance present + off: emit an explicit session override telling the
  model to ignore the installed kernel;
- native guidance absent + active: emit the complete kernel as today;
- native guidance absent + off: emit nothing as today;
- native guidance present: suppress routine per-turn reminders because the
  stable persistent prefix already carries the rules.

No harness verbosity or output-style setting is read or changed.

### Competitive evidence

The existing isolated Codex runner remains the execution boundary. A new driver
adds five arms with the same task, model, reasoning effort, permissions, and
acceptance script:

- `baseline`: no Offcut and no style instruction;
- `terse`: baseline plus exactly `Be terse.`;
- `caveman`: baseline plus the installed Caveman skill body;
- `ponytail`: baseline plus the installed Ponytail skill body;
- `offcut`: the shipped Offcut native/hook contract in concise mode.

The driver records source file, SHA-256, provider input/output/cache tokens,
duration, tool calls, turns, files changed, and LOC. Competitor bodies are read
from caller-supplied local paths and are not redistributed. An anonymized answer
bundle supports blinded completeness review. The receipt fails closed on
missing runs, failed task acceptance, failed reviews, or mixed workload/model.

## Claims policy

The receipt may say what happened in its exact workload. It may not say Offcut
improves prompt caching unless provider cache metrics improve, and it may not
claim to beat Ponytail's published 12-task result unless Offcut runs an
equivalent powered corpus and reaches the target. A losing or inconclusive
result is still a valid completed benchmark and directs the next optimization.

## Sources

- [Codex AGENTS.md](https://learn.chatgpt.com/docs/agent-configuration/agents-md)
- [Codex hooks and plugin roots](https://learn.chatgpt.com/docs/hooks)
- [Claude Code memory](https://code.claude.com/docs/en/memory)
- [Claude Code output styles](https://code.claude.com/docs/en/output-styles)
- [Cursor rules](https://prod.cursor.com/help/customization/rules)
- [Cursor plugins](https://prod.cursor.com/docs/reference/plugins)
- [Grok project and global rules](https://docs.x.ai/build/features/project-rules)
- [Grok skills, plugins, and marketplaces](https://docs.x.ai/build/features/skills-plugins-marketplaces)
- [Ponytail published benchmark](https://github.com/StarQuant/ponytail-skill)
- [Caveman limitations and measurements](https://github.com/JuliusBrussee/caveman/)

