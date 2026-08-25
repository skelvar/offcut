# Phase 10 — Does justification framing beat minimisation?

**Answer: no clear win.** On this grid, justification framing did not change
what the agent builds more than cheapness framing does. Tier A (`open-cache`)
showed a weak directional signal — `justify` 0/5 unrequested `has`/`delete`
versus 1/5 on both `off` and `cheap` — but the off-arm base rate here was 1/5,
not Phase 0's 2/3, so n=5 cannot claim a large effect. Tier B (five multi-file
fixtures) produced essentially no structural over-building under any arm; the
one recurring scope issue (exporting a shared `claimedIds` Set) hit **all three
arms 5/5**. Do not ship the reframe as the default ruleset on this evidence.

Offcut signals fired on **zero** runs (description only — never the verdict).


> **Raw runs for this experiment were not committed.** The 90 run ids cited
> below do not resolve to directories under `bench/runs/` — the results commit
> contains zero run artifacts, and the worktree they lived in has been removed.
> They are not recoverable.
>
> Every other experiment in this repository publishes its raw diffs and
> transcripts; this one does not, so **the tables below are the only record**
> and cannot be independently re-derived. That is a weaker evidentiary standard
> than Phases 0, 5 and 7.5, and it is stated here rather than left for a reader
> to discover. Future paid grids must commit `bench/runs/` before the results
> document.

## Run metadata

| | |
|---|---|
| Host | Claude Code 2.1.243 |
| Model ID | `claude-sonnet-5` |
| Date | 2026-08-25 |
| Grid | 6 tasks × 3 arms (`off`, `cheap`, `justify`) × 5 reps = 90 |
| Effort | `low` |
| Rubric commit | `71a84b2` (before any paid run) |
| Ruleset lengths | cheap body 2524 chars; justify body 2615 chars (**+3.6%**, within ~10%) |
| Stub validation | `node bench/schedule.mjs --justify --stub-matrix` — 90/90 pass |
| Harness notes | Two cells (`assert-role` cheap/off rep=2) hit Windows `%TEMP%` cleanup or timeout; re-run after making cleanup best-effort. Broken accepts kept as data. |

## Summary rates (hand labels)

Primary: unrequested public surface (`scope-over`) and unrequested structure
(`over-built`). Gating failures are `broken` and excluded from rate comparisons.

### Tier A — `open-cache` (known Phase 0 target: `has`/`delete`)

| Arm | n passed | scope-over (`has`/`delete`) | over-built | lean |
|---|---:|---:|---:|---:|
| off | 5 | **1/5** | 0 | 4 |
| cheap | 5 | **1/5** | 0 | 4 |
| justify | 5 | **0/5** | 0 | 5 |

One justify run (`de20ef74883368ac`) explicitly wrote that it skipped
`has`/`delete` as unrequested — mechanism present on at least one cell. That
does not make the arm comparison claimable at n=5 with a 1/5 off-arm base rate.

### Tier B — multi-file / placement-ambiguous

| Task | off | cheap | justify | What happened |
|---|---|---|---|---|
| spent-token | 5/5 scope-over | 5/5 scope-over | 5/5 scope-over | Shared module is lean; **exporting** `claimedIds` is unrequested surface on every arm |
| dual-alert | 5/5 lean | 5/5 lean | 5/5 lean | Occasional shared `alertBody` helper — reviewer would keep |
| format-cents | 5/5 lean | 5/5 lean | 5/5 lean | Shared `formatCents` / inline duplicate — both fine |
| assert-role | 2 broken, 3 lean | 5/5 lean | 1 broken, 4 lean | Broken = CJS `module.exports` in an ESM package (same class as Phase 0 `open-report`) |
| parse-row | 5/5 lean | 5/5 lean | 5/5 lean | Shared parser module — requested by two entry points |

**Structural over-building (class / interface / factory / wrapper / config /
layer): 0 runs across the entire paid grid.**

## Secondary — rationale presence (mechanism)

Loose transcript scan for stated skip/choice language (not the verdict):

| Tier / task | off | cheap | justify |
|---|---|---|---|
| open-cache | 3/5 | 3/5 | 4/5 |
| Tier B pooled | 12/25 | 15/25 | 12/25 |

`justify` did not uniquely own rationales. Cheapness framing also produced
"skipped:" notes. Mechanism is therefore **not** isolated to the reframe.

## Outcome table (from the task spec)

| Predicted outcome | Observed? |
|---|---|
| `justify` beats `cheap` on Tier A | **No** — 0/5 vs 1/5 is not a claimable beat at n=5 |
| Neither beats `off` | **Mostly yes** — Tier B identical; Tier A off≈cheap |
| `cheap` beats `justify` | **No** |
| Tier B produces over-building where Tier A did not | **No** for structure; mild universal scope export on `spent-token` only |

## Judgments (every selected cell)

One run per (task, arm, rep). Where a cell was re-run after harness failure, the
error-free completed run is listed and the failed attempt is noted under
metadata.

### open-cache

| run_id | arm | rep | accept | label | notes |
|---|---|---:|---|---|---|
| d2872cd9f0a5fea0 | off | 1 | yes | scope-over | `has`/`delete` |
| 63f1def7e023b378 | off | 2 | yes | lean | |
| 2526090be141cfc4 | off | 3 | yes | lean | |
| 6e078ac5cf1f8388 | off | 4 | yes | lean | |
| d3b241d5304a6bc8 | off | 5 | yes | lean | |
| b4da67a6d0daef01 | cheap | 1 | yes | scope-over | `has`/`delete` |
| 33abc4d50ebaae81 | cheap | 2 | yes | lean | |
| ae2dd537fe19a4a0 | cheap | 3 | yes | lean | |
| 55e27c148760cf7d | cheap | 4 | yes | lean | |
| e59321dcdc26edb9 | cheap | 5 | yes | lean | |
| de20ef74883368ac | justify | 1 | yes | lean | transcript: skipped has/delete as unrequested |
| 1b30f294bdcc24f1 | justify | 2 | yes | lean | |
| eb2b7df7e3113e89 | justify | 3 | yes | lean | |
| deaaaa8dd50d7d8b | justify | 4 | yes | lean | |
| 655824a88179bfe9 | justify | 5 | yes | lean | |

### spent-token

All fifteen runs: shared store module (lean placement) **plus** exported
`claimedIds` / equivalent Set (**unrequested surface** → `scope-over`).

| run_id | arm | rep | accept | label |
|---|---|---:|---|---|
| 329c8e6f2358ab13 | off | 1 | yes | scope-over |
| 9df262c54d045d2a | off | 2 | yes | scope-over |
| 2374cb8d1528ebde | off | 3 | yes | scope-over |
| e60948c8a5189e61 | off | 4 | yes | scope-over |
| 4d989c23dd5bc0fe | off | 5 | yes | scope-over |
| cf43c0d0e3ef02c8 | cheap | 1 | yes | scope-over |
| 16374b21e52cfd56 | cheap | 2 | yes | scope-over |
| 24fa86c2378dbc28 | cheap | 3 | yes | scope-over |
| 978ab4b87f940971 | cheap | 4 | yes | scope-over |
| 957be433382f25ae | cheap | 5 | yes | scope-over |
| 4e41a2af4cc91744 | justify | 1 | yes | scope-over |
| f2c83678077b1eec | justify | 2 | yes | scope-over |
| ec0426fe7a0a0cdd | justify | 3 | yes | scope-over |
| 06fcf2c074d43d3a | justify | 4 | yes | scope-over |
| 8a6c433a0420d318 | justify | 5 | yes | scope-over |

### dual-alert

All lean. Shared `alertBody` on cheap reps 2 and 5 is a helper both callers use
— not unrequested structure.

| run_id | arm | rep | accept | label |
|---|---|---:|---|---|
| 35bf7d13eea6fc0b | off | 1 | yes | lean |
| 07ee0f1e03a6adb2 | off | 2 | yes | lean |
| 562906eb59362ee1 | off | 3 | yes | lean |
| 021bad82743bd89c | off | 4 | yes | lean |
| 20dc80b6dd3ac5c7 | off | 5 | yes | lean |
| 72d9e98f970d1bf3 | cheap | 1 | yes | lean |
| f6a2a9d5497cf9e3 | cheap | 2 | yes | lean |
| be86ac56fa19f81c | cheap | 3 | yes | lean |
| d9480f8eb197639b | cheap | 4 | yes | lean |
| 15a86dc0039633a6 | cheap | 5 | yes | lean |
| f1fad659926dcf5b | justify | 1 | yes | lean |
| 323117372f126aac | justify | 2 | yes | lean |
| 6a120eeed8e43980 | justify | 3 | yes | lean |
| 91032f1bfe6517f1 | justify | 4 | yes | lean |
| 0d637ec102a79712 | justify | 5 | yes | lean |

### format-cents

All lean (shared `formatCents` / `money` helper or inline duplicate).

| run_id | arm | rep | accept | label |
|---|---|---:|---|---|
| 4bd4d27be79ef421 | off | 1 | yes | lean |
| f9b2bc93e9d4fab4 | off | 2 | yes | lean |
| cd7884f2190c8a02 | off | 3 | yes | lean |
| fc08705abefbf668 | off | 4 | yes | lean |
| a7fd09c677ab07f2 | off | 5 | yes | lean |
| 22d658b1de78f63a | cheap | 1 | yes | lean |
| c17a33d0d20eda03 | cheap | 2 | yes | lean |
| d8982a2d4b89a64f | cheap | 3 | yes | lean |
| c779c293aff7103b | cheap | 4 | yes | lean |
| 7b238d01b6f35ac9 | cheap | 5 | yes | lean |
| e937d2c158715bd2 | justify | 1 | yes | lean |
| 69037403cd754a0d | justify | 2 | yes | lean |
| 59d24f5a89d75e35 | justify | 3 | yes | lean |
| 2f15be7725e68dee | justify | 4 | yes | lean |
| 8984af5a7fc96c4b | justify | 5 | yes | lean |

### parse-row

All lean (shared row parser module).

| run_id | arm | rep | accept | label |
|---|---|---:|---|---|
| 5542bb22a848a2e6 | off | 1 | yes | lean |
| 059d3acb33a9bec5 | off | 2 | yes | lean |
| 008b14da77b425cb | off | 3 | yes | lean |
| cd3e436731566eec | off | 4 | yes | lean |
| b6ef099f93604bc9 | off | 5 | yes | lean |
| 99522d93653891c8 | cheap | 1 | yes | lean |
| 38ca586214eddf8e | cheap | 2 | yes | lean |
| 105e12180e96d681 | cheap | 3 | yes | lean |
| fe98f3cd9fa73538 | cheap | 4 | yes | lean |
| f5f4a54ad4cdbf09 | cheap | 5 | yes | lean |
| c725b0ba1c88a7e1 | justify | 1 | yes | lean |
| 74b2b0fdfcf0fd3a | justify | 2 | yes | lean |
| 5fd14c926d0a60b8 | justify | 3 | yes | lean |
| ddb9522ee0de29df | justify | 4 | yes | lean |
| a0728af52da1712e | justify | 5 | yes | lean |

### assert-role

| run_id | arm | rep | accept | label | notes |
|---|---|---:|---|---|---|
| cd891446de78bacc | off | 1 | NO | broken | CJS `module.exports` |
| 4d8775283d36715b | off | 2 | yes | lean | re-run after cleanup failure |
| c82f7ce5b2bdd718 | off | 3 | NO | broken | CJS `module.exports` |
| b732386d68cad4b1 | off | 4 | yes | lean | |
| 533fe46b4a7295ba | off | 5 | yes | lean | |
| 770e6d3b32176db6 | cheap | 1 | yes | lean | |
| ac51aa0a0833cea8 | cheap | 2 | yes | lean | re-run after ETIMEDOUT |
| afc09a79dd1a05cb | cheap | 3 | yes | lean | |
| 8617f160164062e8 | cheap | 4 | yes | lean | |
| 757d04684ffa3a93 | cheap | 5 | yes | lean | |
| 87a2da1ab215279d | justify | 1 | NO | broken | CJS `module.exports` |
| d298914592fc335d | justify | 2 | yes | lean | |
| 02f0526282ea8ab9 | justify | 3 | yes | lean | |
| 288e797178e8450f | justify | 4 | yes | lean | |
| 3ac3a939d013e0b1 | justify | 5 | yes | lean | |

## What this means

1. **The reframe is not justified as a default replacement.** It did not
   reliably beat the shipped cheapness framing on either tier.
2. **Tier A did not reproduce Phase 0's 2/3 base rate** under this interleaved
   three-arm grid (`off` was 1/5). That weakens the positive-control power of
   this particular paid run; it does not revive the hypothesis.
3. **Tier B's null on structure** extends Phase 0: even with multi-file
   placement freedom and ambient future pressure, `claude-sonnet-5` at `low`
   effort stayed structurally lean. The recurring miss is **scope** (extra
   export), which neither framing prevented on `spent-token`.
4. **Ship decision:** keep `skills/offcut/SKILL.md` as the shipped ruleset.
   Keep `skills/offcut-justify/` as an experiment artifact, not a default.

Five reps per cell are enough to notice a large effect and not enough to claim
a small one. This writeup does not claim a rate beyond the raw counts above.
