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

- Backend: `codex-profile-v1`
- Host: Codex CLI `0.149.1` exactly
- Model: `gpt-5.6-sol`
- Reasoning effort: `low`
- Custom agent: top-level developer profile named `ticket-worker`
- Billing: ChatGPT subscription, recorded as zero incremental API billing with
  `billing_kind: "chatgpt_subscription"` and subscription cost evidence; this
  does not claim that ChatGPT membership is free

Nine isolated live preflights preceded efficacy-task inference. The sixth,
`4ae70772be5f4fb0`, proved that Codex 0.149.1's custom subagent executes under a
read-only sandbox even when its parent is workspace-writable: the exact worker
lifecycle and `apply_patch` attempt were audited, Codex rejected the write, and
the Git diff was empty. The `codex-custom-v1` design was therefore abandoned
before task inference. Its evidence and ledger rows remain immutable history
and cannot enter or consume `codex-profile-v1` cells.

Each call uses a new isolated `CODEX_HOME` containing a byte-for-byte copy of
the authenticated user's `auth.json`, minimal base `config.toml`, the named
`ticket-worker.config.toml` profile, arm-specific `hooks.json`, and an otherwise
empty user-home directory. Codex 0.149.1 identifies `--profile` as
`CONFIG_PROFILE_V2` and layers `$CODEX_HOME/<name>.config.toml`; a
`[profiles.ticket-worker]` table would not select the agent in this version. No
`agents/` role file exists. `HOME` and `USERPROFILE` point to the empty
directory; agent/skill home overrides are cleared, while `PATH` and system
directories are unchanged. This prevents ordinary home resolution from
reaching global user assets.
Before exec, `codex login status` runs inside that home with API-key and
provider/base-URL overrides removed and must report the exact ChatGPT
authentication status. A copied `auth.json` is not proof by itself. Artifacts
record only `auth_kind: "chatgpt"`.

Codex 0.149.1's modern permission precedence is pinned explicitly with
base and profile `default_permissions = ":workspace"`, while the CLI uses
`--profile ticket-worker --approve-for-me`.
The named profile contains the neutral `developer_instructions`, requested
model, and effort. Base config contains `[skills] include_instructions = false`,
`hooks = true`, and `multi_agent = false`. The fifth live preflight showed that
HOME isolation alone still allowed an attempted read of a global
`.agents/skills` path, so every run fails closed if transcript or stderr
references the absolute
`<original-user-home>/.agents/skills` or `.codex/skills` trees. Relative prose
and paths under the work directory or temporary isolated home are permitted,
and records expose `user_assets_isolated` without persisting path values.

The seventh live preflight, `dfe6220d68379d20`, proved the named profile loaded
but Windows Codex 0.149.1 still converted `--ask-for-approval never` into a
read-only write boundary. The active contract therefore uses the supported
`--approve-for-me` boundary, which routes write approval through Codex automatic
review while retaining workspace-write sandboxing. Records store
`approval_mode: "automatic_review"`. This arm-identical guardian/review path is
platform safety infrastructure, not a custom subagent or treatment component;
the root-only audit and no-collaboration requirements remain unchanged.

The eighth live preflight, `bb343c29e2cd1242`, then showed that Codex rejects
an explicit `--sandbox` together with `--approve-for-me`. Codex 0.149.1 help
defines automatic review itself as using workspace-write, so the active CLI
omits `--sandbox` and records
`effective_sandbox: "workspace-write (approve-for-me)"`. The profile's
`default_permissions = ":workspace"` remains as defense and configuration
evidence. The dangerous approvals-and-sandbox bypass remains forbidden.
The ninth, `927bff5b8f9afe54`, passed the named-profile write proof under the
active contract and was sealed before discovery.

Both arms include the same silent lifecycle audit hook on `SubagentStart`,
`SubagentStop`, `PreToolUse`, and `PostToolUse`. The tool hooks have no matcher,
so they audit Bash/shell and unknown tools as well as editor tools. They append
only nonsecret agent/event attribution to the per-run audit JSONL and never
record tool input or emit model context. The `off` arm contains only these
audit hooks. The `full` arm contains the identical audit hooks plus the shipped
Offcut hooks.

The temporary home is removed with Windows retries after every path, verified
absent, and never retained as an artifact. Cleanup residue fails loudly without
printing paths or authentication bytes. Codex receives the exact task prompt
directly; there is no delegation envelope or orchestration parent. Neither the
profile instructions nor task wrapping adds study or arm framing. Records
store `custom_agent_kind: "named_top_level_profile"`,
`custom_agent_name: "ticket-worker"`, and base-config, profile-config, and hook
hashes. There is no role hash or envelope hash.

The silent hook audit is now exclusionary attribution evidence. Any
`SubagentStart`, `SubagentStop`, child `agent_id`/`agent_type`, collaboration
tool audit, or collaboration JSONL item fails the run. Root tool events carry
no child identity. A completed root call requires exactly one matching
`PreToolUse` and `PostToolUse` with the same tool-use ID and tool name; Post-only
or inconsistent pairs fail. Pre-only calls are retained as rejected attempts,
with a frozen maximum of eight per run. The audit records no tool input. Final
acceptance, the Git diff, and valid telemetry remain independently required, so
rejected attempts cannot establish efficacy success.

Tokens are aggregated from valid `turn.completed` usage, including
`cache_write_input_tokens` as cache-creation tokens and
`reasoning_output_tokens` separately. All five Codex 0.149.1 usage fields must
be finite and nonnegative. Missing or malformed usage makes the run
non-successful and leaves token fields null; it is never coerced to zero.
Duration is wall time and raw JSONL is preserved. Error items, failed turns,
authentication, API, and rate-limit failures remain distinct from model/tool
failures and known pre-call spawn failures. Raw stderr is retained separately
from the JSONL transcript and contributes to failure detection; live-preflight
evidence records its exit code and a bounded, control-character-free diagnostic.
An exec process that exits unsuccessfully before `thread.started` or
`turn.started` is a host/infrastructure failure, while API-looking stderr keeps
API classification. Once either start event appears, missing usage remains an
unfavorable model/telemetry result. A ChatGPT-authenticated CLI exit before
inference records known-zero pre-inference evidence and no subscription billing
kind; verified `auth_kind` remains separate. Subscription evidence begins only
after inference is evidenced.

The exact hook-trust notice emitted as an `item.completed` error item is an
expected warning and is counted, not treated as turn failure. Every other error
item remains fatal.

The CLI and config pin the requested model to `gpt-5.6-sol`, but Codex 0.149.1
does not necessarily report the observed model in exec JSONL. Records therefore
store `model_requested: "gpt-5.6-sol"` and set `model_id` only when Codex emits
one; otherwise `model_id` is null with
`model_observation: "requested_not_reported"`.

Attempt keys and outcome loading are backend-scoped. Legacy Claude and
`codex-custom-v1` rows therefore neither complete nor exhaust any
`codex-profile-v1` cell. The same 12 tasks, seed, discovery/adaptive-rep
schedule, qualifier rule, confirmatory schedule, estimand, and commit gates
remain unchanged. Results support a claim only for this Codex top-level-profile
execution contract; no cross-host or cross-backend claim is permitted.

The optional Haiku replication stage and the unused `$35` Claude API ceiling
are retired. The preregistered run-count ceiling remains: 24 initial discovery
runs, eligible rep 3 runs, and at most 96 confirmatory runs.

The no-model `--codex-preflight` checks the frozen local contract. The separate
`--codex-live-preflight --execute` makes one trivial isolated top-level-profile
call and requires that profile to create one named proof file with exact
content under workspace-write. Success additionally requires a Git diff
containing only that file, no child/collaboration evidence, and at least one
paired root write-capable Pre/Post tool event; evidence stores proof and diff
hashes, not the temporary path. Successful-live-preflight refusal is scoped to
`codex-profile-v1`, so prior failed subagent preflights remain history. The live
preflight remains outside efficacy outcomes.

## 2026-08-27 post-study publication amendment

Raw discovery was sealed in commit
`4eeea606451623b3a0c18109f33b019413db81cb`. All 24 initial
`codex-profile-v1` cells completed. Acceptance passed in 22/24, but the
preregistered primary outcome remains the recorded 17/24 because five accepted,
target-free runs were marked `failure_kind: "model"` by the then-frozen parser.
Target prevalence was 0/24, so no rep-3 run was eligible, no task qualified,
and the preregistered rule stopped the study before confirmation.

Post-seal review found a classifier defect: Codex reports failed intermediate
`command_execution`, `file_change`, or tool items even when the transcript
later reaches `turn.completed`. The five affected discovery transcripts have
terminal `turn.completed`, valid usage, verified named-profile attribution,
accepted code, and no failed turn or unrecoverable error item. However, the
top-level Codex exit code was not persisted in the sealed run records or
manifest. They therefore cannot be declared fully corrected outcomes. The raw
manifest, metrics, run records, transcripts, and ledger remain immutable.

The parser is corrected prospectively. It records sanitized
`recoverable_tool_failures` metadata containing only item ID, item type, status,
and command exit code when available; command text and arguments are omitted.
Future run records and manifests persist `exit_code`. An intermediate failure
is recoverable only when that recorded process exit is zero, the turn completes
with valid usage, the named profile is verified, and no top-level failure or
unrecoverable error exists. A nonzero process exit, `turn.failed`, or
non-warning error remains fatal.

A clearly labeled transcript-based post-hoc upper bound asks what would happen
if those transcript conditions were treated as completion: primary success
would be 22/24 (91.67%). Because top-level exit status was not sealed, this does
not replace the authoritative frozen 17/24 outcome. It also cannot change the
stop decision because target prevalence remains 0/24.
Accordingly `positive_claim` is false, `efficacy_estimate` is null, and
`confirmatory_ran` is false. The result is no efficacy estimate—not evidence of
no effect. Enrichment failed for this model/profile, or the baseline was
already target-free; no `off` versus `full` claim is supported.

## 2026-08-27 no-opportunity confirmatory override

The user then directed remaining confirmatory execution. Discovery still has
no qualified tasks, so this is not the original efficacy estimand and cannot
support a positive Offcut claim.

It asks a different, labeled question:

> On tickets whose sealed baseline was already target-free, does shipped
> `full` mode change acceptance, size, or recorded failure versus `off`?

Rules for this override:

- Frozen discovery outcomes, including 17/24 primary success and 0/24 target
  prevalence, stay immutable.
- No discovery rep 3 is added.
- Select six tasks with the original cap rule (distinct categories first, then
  hash) treating every discovery target count as zero.
- Run a fresh `off`/`full` grid, eight reps per arm, 96 cells, same seed and
  blocked arm order.
- Backend remains `codex-profile-v1` with the `ticket-worker` named profile.
- `positive_claim` stays false. `efficacy_estimate` stays null.
- Report the override grid separately from discovery.

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
the legacy runner; they do not govern `codex-profile-v1`.

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
