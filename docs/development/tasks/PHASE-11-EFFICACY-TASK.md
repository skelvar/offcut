# Phase 11 — Preregistered Offcut efficacy study

This file is the design of record. It must be committed before any paid run.
Phase 11 asks:

> When a real Offcut opportunity exists, does shipped `full` mode cause the
> final accepted implementation to be target-free, compared with `off` mode?

This is an enriched efficacy study. The fixtures are selected to contain a
measurable opportunity, so their target prevalence is not an estimate of
prevalence in ordinary software work.

## Frozen environment and ceiling

- Host: Claude Code `2.1.243`
- Confirmatory model: `claude-sonnet-5`
- Effort: `low`
- Product: shipped Offcut `v0.2.0`, unchanged
- Seed: `offcut-efficacy-2026-08-27`
- Hard aggregate ceiling: `$35.00`; this is a ceiling, not a spending target
- Optional directional replication: `claude-haiku-4-5-20251001`, only after a
  positive confirmatory result and only if the same ceiling permits it

No discovery run enters the confirmatory efficacy estimate.

## Candidate corpus contract

A later preregistration commit will add exactly 12 future real-ticket JS/TS
fixtures:

- 4 `new-dependency`
- 5 `speculative-abstraction`
- 1 `large-first-write`
- 1 `new-config-surface`
- 1 `unused-default-param`

Prompts must not mention Offcut or brevity and must not prescribe an
implementation. Every fixture directory under `bench/efficacy-tasks/<id>/`
must contain:

```text
prompt.txt
meta.json
repo/
accept.mjs
measure.mjs
stubs/lean.mjs
stubs/target.mjs
```

`meta.json` names the task ID, category, `target_signal`, and `target_phase`.
`accept.mjs <worktree>` checks only ticket correctness. `measure.mjs
<opaque-input>` prints JSON containing boolean `target_present`; its input
contains only `diff.patch`, `work/`, and `accept.json`.

Each stub receives the worktree path, applies its implementation, and prints
JSON with an `operations` array. Every operation is a realistic Claude
`Write` or `Edit` shape with `tool_name` and `tool_input`. The lean and target
stubs must both pass acceptance. Lean must measure target-absent; target must
measure target-present.

## Stage 0 — self-test

`node bench/efficacy.mjs --selftest` uses no model and no network. For both
stubs it:

1. applies the implementation in an isolated fixture repository;
2. runs acceptance and the blind task-specific measure;
3. replays the emitted `Write`/`Edit` operations from a fresh repository
   through the shipped pre- and post-write logic; and
4. proves the target stub produces the expected hook exposure wherever the
   shipped signal supports that tool shape.

Pre-write and post-write exposures are labeled separately. A final-diff-only
signal, if one is ever admitted to this corpus, must be labeled as such rather
than represented as live hook exposure.

## Discovery

Discovery is `off` only.

1. `discovery12`: all 12 tasks, reps 1 and 2, for 24 runs.
2. `discovery3`: give a task rep 3 only when at least one of its first two
   total runs both passes acceptance and is target-positive.
3. A task qualifies only when all three total runs exist, the target is
   present in at least 2/3, and acceptance passes in at least 2/3.

The denominator remains all three total runs. A failed accept does not vanish
from either criterion. API, host, and infrastructure attempts are preserved
but are not completed model-run outcomes.

If no task qualifies, stop after discovery and publish the null result.

## Qualifier cap

At most six tasks proceed. Selection is deterministic:

1. maximize the number of distinct signal categories;
2. within that constraint prefer higher discovery target count; then
3. sort ties by ascending
   `SHA-256(seed + NUL + task_id)`.

This rule is also used to preselect at most three Haiku tasks from discovery
only. Treatment effects are never used for replication selection.

## Confirmatory schedule

Each qualifier receives fresh `off` and `full` runs, eight reps per arm. Six
qualifiers therefore produce at most 96 runs. Within every task/rep block,
both arms occur once and their order is determined from
`SHA-256(seed + NUL + task_id + NUL + rep)`.

A completed but broken run remains its assigned outcome. The Phase 5
schedule's destructive failed-run resumption is not used.

## Outcomes and blinding

The primary run outcome is:

```text
accept passed AND task-specific target absent
```

Every other result, including an acceptance failure with a small or
target-absent diff, is primary failure. Report target prevalence and
acceptance separately.

The task-specific measure receives only the opaque diff, opaque worktree, and
acceptance result. It never receives arm, transcript, Offcut state, execution
order, or schedule position. Arm joins happen only from the sealed efficacy
manifest after raw-result commit.

Secondary descriptive fields are:

- actual Offcut signal fired, cleared, and survived;
- files created and lines added/removed;
- input, output, cache-read, and cache-creation tokens;
- `total_cost_usd` and duration.

Offcut's own signals are secondary product description, not the
task-specific target judgment.

## Estimand and positive-claim rule

The confirmatory estimand is the equal-task-weighted difference in primary
success probability, `full - off`.

The 95% interval is preregistered as a blocked randomization interval. For
each candidate additive effect from `-1.000` through `1.000` in steps of
`0.001`, subtract the candidate effect from treated outcomes, swap treatment
labels independently within every task/rep block, and use the absolute
equal-task-weighted mean arm difference as the statistic. Use 200,000
Monte-Carlo assignments generated from the frozen seed. Retain candidates
with two-sided randomization `p >= 0.05`; report the hull of retained values.
Tasks are the equally weighted clusters, so a task with more usable-looking
outputs cannot dominate. Assigned failures remain zeros.

A positive claim is permitted only when:

1. this 95% interval excludes zero in the favorable direction; and
2. the equal-task-weighted `full` acceptance rate is no more than 10
   percentage points below `off`.

Otherwise report no positive efficacy claim.

## Attempts, retries, and budget

Paid execution requires `--execute`. Retry only API, host, or infrastructure
errors, at most three attempts for a planned run. Model failure and
acceptance failure are outcomes, not retry reasons. Preserve every opaque run
directory and every attempt.

`bench/efficacy-cost.jsonl` is append-only and records every attempt. Never
reset, truncate, or delete it. All attempt costs count. Before a paid call:

1. compute remaining ceiling from the entire ledger;
2. require remaining budget to be greater than `1.2 ×` the largest observed
   attempt cost;
3. cap the first call at `min(remaining, $1.00)`; and
4. pass the resulting remaining allowance through Claude's
   `--max-budget-usd`.

If first-call telemetry alone exceeds the total ceiling, preserve the attempt
and stop. The same rule applies to any later telemetry anomaly.

Arm mapping is append-only in `bench/efficacy-manifest.jsonl`. Raw opaque
artifacts remain under `bench/runs/`.

## Commit gates

There are three mandatory evidence gates:

1. **Harness + fixtures before paid:** commit this preregistration, harness,
   measures, and all fixtures before the first model call.
2. **Raw discovery before qualifier selection:** commit every discovery
   attempt, both append-only ledgers, and raw run artifacts before computing
   qualifiers.
3. **Raw confirmatory before report:** commit every confirmatory attempt and
   raw artifact before joining arms or producing conclusions.

The runner checks the applicable raw-result gate before confirmatory or Haiku
planning. The user separately approved the preregistration/raw-result commits
and pushes, but Phase 11 harness work itself performs no push.

## Commands

```text
node bench/efficacy.mjs --selftest
node bench/efficacy.mjs --print-plan [--stage discovery12|discovery3|confirm|haiku]
node bench/efficacy.mjs --stage discovery12 --execute
node bench/efficacy.mjs --stage discovery3 --execute
node bench/efficacy.mjs --stage confirm --execute
node bench/efficacy.mjs --stage haiku --execute
```

`--selftest` and `--print-plan` make no model call. Every paid stage requires
the explicit execution flag.

## Product defects

If the benchmark exposes a product defect, preserve all `v0.2.0` data as
collected. Fix the product with test-driven development, then use fresh
holdout tasks and runs for any post-fix claim. Never reinterpret or overwrite
the original data.
