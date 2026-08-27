# Phase 11 — Preregistered Offcut efficacy study

This file is the design of record. It must be committed before any paid run.
Phase 11 asks:

> When a real Offcut opportunity exists, does shipped `full` mode cause the
> final accepted implementation to be target-free, compared with `off` mode?

This is an enriched efficacy study. The fixtures are selected to contain a
measurable opportunity, so their target prevalence is not an estimate of
prevalence in ordinary software work.

## 2026-08-27 host migration amendment

Before any model inference completed, the user canceled the Claude
subscription and directed the study to move to Codex. The three preserved
Claude attempts all ended with subscription-disabled 403 responses, zero
tokens, and zero reported cost. They remain immutable historical evidence in
the manifest, cost ledger, and run directories.

The active execution contract is now:

- Backend: `codex-custom-v1`
- Host: Codex CLI `0.149.1` exactly
- Model: `gpt-5.6-sol`
- Reasoning effort: `low`
- Custom role: `offcut-efficacy-worker`
- Billing: ChatGPT subscription, recorded as zero incremental API billing with
  `billing_kind: "chatgpt_subscription"` and subscription cost evidence; this
  does not claim that ChatGPT membership is free

Each call uses a new isolated `CODEX_HOME` containing only a byte-for-byte copy
of the authenticated user's `auth.json`, minimal config, the named role, and
arm-specific `hooks.json`. The temporary home is always deleted and is never a
run artifact. The `off` arm has no hooks. The `full` arm uses the shipped hook
settings, including the `apply_patch` matcher. Both arms use the same
top-level delegation envelope and neutral role instructions. Their envelope,
config, role, and hook hashes are recorded.

An outcome is valid only when Codex JSONL contains a collaboration or
`spawn_agent` event naming the exact custom role. A final-message claim is not
proof. Missing role proof is a model failure. Tokens are aggregated from
`turn.completed` events, duration is wall time, and raw JSONL is preserved.
Authentication, API, and rate-limit failures remain distinct from model/tool
failures and known pre-call spawn failures.

Attempt keys and outcome loading are backend-scoped. The three legacy Claude
rows therefore neither complete nor exhaust any Codex cell. The same 12 tasks,
seed, discovery/adaptive-rep schedule, qualifier rule, confirmatory schedule,
estimand, and commit gates remain unchanged. Results support a claim only for
this Codex custom-agent execution contract; no cross-host claim is permitted.

The optional Haiku replication stage and the unused `$35` Claude API ceiling
are retired. The preregistered run-count ceiling remains: 24 initial discovery
runs, eligible rep 3 runs, and at most 96 confirmatory runs.

The no-model `--codex-preflight` checks the frozen local contract. The separate
`--codex-live-preflight --execute` makes one trivial isolated custom-role call,
requires event-level role proof, and records opaque evidence outside efficacy
outcomes. A successful live preflight cannot be repeated.

## Frozen environment and ceiling

The following is the original frozen host section, preserved as study history.
It is superseded operationally by the dated amendment above.

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
Measures identify category semantics independently of fixture-specific names
and ignore appearances in comments or strings. Seed repositories and prompts
contain only ticket-relevant product context.

Each stub receives the worktree path, applies its implementation, and prints
JSON with an `operations` array. Every operation is a realistic Claude
`Write` or `Edit` shape with `tool_name` and `tool_input`. The lean and target
stubs must both pass acceptance. Lean must measure target-absent; target must
measure target-present. Dependency targets use their added package when it is
available and retain a standard-library fallback so Stage 0 stays local.

## Stage 0 — self-test

`node bench/efficacy.mjs --selftest` uses no model and no network. For both
stubs it:

1. applies the implementation in an isolated fixture repository;
2. runs acceptance and the blind task-specific measure;
3. independently replays the emitted `Write`/`Edit` operations from a fresh
   repository and requires them to reproduce the stub's exact tree diff;
4. replays those operations through the shipped pre- and post-write logic; and
5. proves the target stub produces the expected hook exposure wherever the
   shipped signal supports that tool shape.

Pre-write and post-write exposures are labeled separately. A final-diff-only
signal, if one is ever admitted to this corpus, must be labeled as such rather
than represented as live hook exposure.

## Discovery

Discovery is `off` only.

1. `discovery12`: all 12 tasks, reps 1 and 2, for 24 runs.
2. Do not plan `discovery3` until every candidate has completed both initial
   reps.
3. `discovery3`: give a task rep 3 only when at least one of its first two
   total runs both passes acceptance and is target-positive.
4. Do not run qualification until every eligible rep 3 is complete.
5. A task qualifies only when all three total runs exist, the target is
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

The original design also applied this rule to an optional Haiku replication.
That optional stage was retired by the dated host migration amendment.

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
no model/API/host/infrastructure failure
AND accept passed
AND task-specific target absent
```

Every other result, including an acceptance failure with a small or
target-absent diff or a failed host process that left acceptable code, is
primary failure. Report target prevalence and acceptance separately.

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

For the active Codex backend, paid execution still requires `--execute`.
Retry only API, host, or infrastructure errors, at most three attempts for a
backend-scoped planned cell. Successfully started Codex processes record
subscription billing evidence and `total_cost_usd: 0`; token and wall-duration
telemetry remain mandatory. `ENOENT` and `EACCES` before process start remain
known-zero failures. Codex receives no `--max-budget-usd`.

The following Claude budget rules are retained as historical protocol and for
the legacy runner; they do not govern `codex-custom-v1`.

Paid execution requires `--execute`. Retry only API, host, or infrastructure
errors, at most three attempts for a planned run. Model failure and
acceptance failure are outcomes, not retry reasons. Preserve every opaque run
directory and every attempt. Attempt number and exhaustion are derived from
the append-only cost ledger's stage/task/arm/rep cell, so restarting the
process cannot reset retries. The legacy runner retains its three-call API
retry default; efficacy explicitly requests one host call per ledger attempt.

`bench/efficacy-cost.jsonl` is append-only and records every attempt. Never
reset, truncate, or delete it. All attempt costs count. Before a paid call:

1. compute remaining ceiling from the entire ledger;
2. require remaining budget to be greater than `1.2 ×` the largest observed
   attempt cost;
3. cap the first call at `min(remaining, $1.00)`; and
4. pass the resulting remaining allowance through Claude's
   `--max-budget-usd`.

Missing, negative, or non-finite `total_cost_usd` after a call may have started
is recorded as a telemetry anomaly, never coerced to zero, and stops all
further paid scheduling. A host failure is recorded at `$0` only when explicit
spawn evidence proves the Claude process never started; that evidence is
stored in the ledger and the attempt remains retryable. Host classification
alone is not evidence of zero cost. Known-zero pre-call failures do not consume
the conservative `$1.00` cap for the first call that actually starts.
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
   qualifiers. The gate also verifies all initial cells and every eligible
   adaptive rep 3 are complete.
3. **Raw confirmatory before report:** commit every confirmatory attempt and
   raw artifact before joining arms or producing conclusions.

The runner checks the applicable raw-result gate before confirmatory planning.
The user separately approved the preregistration/raw-result commits
and pushes, but Phase 11 harness work itself performs no push.

## Commands

```text
node bench/efficacy.mjs --selftest
node bench/efficacy.mjs --codex-preflight
node bench/efficacy.mjs --codex-live-preflight --execute
node bench/efficacy.mjs --print-plan [--stage discovery12|discovery3|confirm]
node bench/efficacy.mjs --stage discovery12 --execute
node bench/efficacy.mjs --stage discovery3 --execute
node bench/efficacy.mjs --stage confirm --execute
```

`--selftest` and `--print-plan` make no model call. Every paid stage requires
the explicit execution flag.

## Product defects

If the benchmark exposes a product defect, preserve all `v0.2.0` data as
collected. Fix the product with test-driven development, then use fresh
holdout tasks and runs for any post-fix claim. Never reinterpret or overwrite
the original data.
