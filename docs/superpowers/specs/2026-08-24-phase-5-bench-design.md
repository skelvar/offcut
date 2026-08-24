# Phase 5 bench design

**Goal:** Measure whether Offcut changes what Claude Code builds, with an
experiment that can honestly report no effect.

## Experiment

| Field | Value |
|---|---|
| Host | Claude Code (print mode) |
| Arms | `off`, `full` |
| Runs | 5 per task per arm, arms interleaved |
| Tasks | 4 plain-Node utilities (see below) |
| Model | Exact ID recorded per run (never a marketing alias) |

### Tasks

1. `config-fallback` — ordered file → env → defaults loader
2. `retry-backoff` — retry a flaky call with backoff
3. `ttl-cache` — in-memory cache with TTL
4. `shared-validate` — one validation rule used by two callers

Each task: pristine `repo/`, byte-identical `prompt.txt`, programmatic
`accept.mjs` that can fail.

## Harness

```
bench/tasks/<id>/{repo/,prompt.txt,accept.mjs,meta.json}
bench/run.mjs
bench/score.mjs
bench/stub-agent.mjs
bench/schedule.mjs
bench/RESULTS.md
bench/runs/          # gitignored opaque dirs
bench/manifest.jsonl # opaque-id → arm (sealed until after score)
```

### Isolation (asserted)

- `OFFCUT_STATE_DIR` = empty per-run temp dir; assert empty at start
- Pristine copy of task repo per run (never reuse a working tree)
- Identical prompt bytes across arms; sha256 recorded
- Hooks delivered via per-run `--settings` JSON with absolute `node "…"` commands
  (same form as `tools/install.mjs`); do not depend on global install
- Fixture repos contain no Offcut docs / AGENTS.md / skills

### Scoring (blind)

`score.mjs` reads only an opaque run directory: `diff.patch`, `accept.json`,
and the post-run worktree listing. It does not read arm labels. Metrics:

- `task_passed` (gate)
- files created, deps added, exported unused, abstraction layers, config keys,
  lines added / removed

Failed accepts are listed separately and excluded from size medians.

### Dry-run

`--stub lean|elaborate` replaces Claude with a scripted agent that applies a
fixed patch. Validates isolation, interleaving, blind scoring, and RESULTS
generation before any paid call.

## Out of scope

No changes to `hooks/`, `skills/`, or `scripts/scan.mjs`. No scoreboard
command, README badge, or CI job that spends model money.
