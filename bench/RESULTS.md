# Phase 5 results

Every run is listed. Failed acceptance checks are excluded from size
medians and reported separately.

## Run metadata

- Host versions: 2.1.241 (Claude Code)
- Model IDs: claude-sonnet-5
- Dates: 2026-08-24
- Total runs: 40

## Prompt integrity

- **config-fallback**: identical prompt sha256 across arms (`2282461e0a2622ee7a477432d659394529c313f686d0569c4037760ee541da0c`); arms=off,full
- **retry-backoff**: identical prompt sha256 across arms (`90230ecd4023f2970dc3609c823ffc3ffd14fcd5532ef49a5c3cf0be3a007e69`); arms=off,full
- **shared-validate**: identical prompt sha256 across arms (`1a9027f23e190f5fdf58ef9cdaa4a6049740022a1c44f1be68435b05e1025047`); arms=full,off
- **ttl-cache**: identical prompt sha256 across arms (`381a5309ba9d5c30868deeaa15c68ecfa3bb0b556b1af64c9ca138595ce1f300`); arms=full,off

## All runs

| run_id | task | arm | rep | passed | files+ | deps+ | exp_unused | abstr | cfg+ | +lines | -lines | model |
|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 480f50bb45031dcb | config-fallback | full | 1 | yes | 0 | 0 | 0 | 0 | 1 | 16 | 2 | claude-sonnet-5 |
| 7a44129cb96071bf | config-fallback | off | 1 | yes | 0 | 0 | 0 | 0 | 1 | 16 | 2 | claude-sonnet-5 |
| ca5a944dbc59172c | config-fallback | full | 2 | yes | 0 | 0 | 0 | 0 | 1 | 16 | 2 | claude-sonnet-5 |
| 314a7b584d9b9e20 | config-fallback | off | 2 | yes | 0 | 0 | 0 | 0 | 1 | 17 | 2 | claude-sonnet-5 |
| 886d36237943d87e | config-fallback | full | 3 | yes | 0 | 0 | 0 | 0 | 1 | 14 | 2 | claude-sonnet-5 |
| 3e8ad0f6154dd3fa | config-fallback | off | 3 | yes | 0 | 0 | 0 | 0 | 1 | 16 | 2 | claude-sonnet-5 |
| 0cc0cd3690c79e30 | config-fallback | full | 4 | yes | 0 | 0 | 0 | 0 | 1 | 13 | 2 | claude-sonnet-5 |
| 0b3d536590ee1b45 | config-fallback | off | 4 | yes | 0 | 0 | 0 | 0 | 1 | 15 | 2 | claude-sonnet-5 |
| 777ab6d3e137f4d1 | config-fallback | full | 5 | yes | 0 | 0 | 0 | 0 | 1 | 17 | 2 | claude-sonnet-5 |
| 119213e2f77f6765 | config-fallback | off | 5 | yes | 0 | 0 | 0 | 0 | 1 | 17 | 2 | claude-sonnet-5 |
| 8c69e1e7742e8302 | retry-backoff | full | 1 | yes | 0 | 0 | 0 | 0 | 0 | 9 | 3 | claude-sonnet-5 |
| a0da7b19096c6624 | retry-backoff | off | 1 | yes | 0 | 0 | 0 | 0 | 0 | 9 | 3 | claude-sonnet-5 |
| 3d6c14a0aefc7d92 | retry-backoff | full | 2 | yes | 0 | 0 | 0 | 0 | 0 | 9 | 3 | claude-sonnet-5 |
| 0903398cd9c189b8 | retry-backoff | off | 2 | yes | 0 | 0 | 0 | 0 | 0 | 9 | 3 | claude-sonnet-5 |
| d9f37cd4ef0445ec | retry-backoff | full | 3 | yes | 0 | 0 | 0 | 0 | 0 | 9 | 3 | claude-sonnet-5 |
| a84359330ef25af3 | retry-backoff | off | 3 | yes | 0 | 0 | 0 | 0 | 0 | 11 | 3 | claude-sonnet-5 |
| d217d1933673ddae | retry-backoff | full | 4 | yes | 0 | 0 | 0 | 0 | 0 | 11 | 3 | claude-sonnet-5 |
| bdeda714c90033e5 | retry-backoff | off | 4 | yes | 0 | 0 | 0 | 0 | 0 | 9 | 3 | claude-sonnet-5 |
| c6c4a742499559ad | retry-backoff | full | 5 | yes | 0 | 0 | 0 | 0 | 0 | 11 | 3 | claude-sonnet-5 |
| 4d13a8d6620509f7 | retry-backoff | off | 5 | yes | 0 | 0 | 0 | 0 | 0 | 15 | 3 | claude-sonnet-5 |
| 9b717d11520b3707 | shared-validate | full | 1 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| 283d3616ad7a1cd1 | shared-validate | off | 1 | yes | 1 | 0 | 0 | 0 | 0 | 14 | 2 | claude-sonnet-5 |
| 73ad171b149f3781 | shared-validate | full | 2 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| 3f4fd80b3947c6b9 | shared-validate | off | 2 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| bc7284c85f3ab7c3 | shared-validate | full | 3 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| 05a332ee42bbdbb5 | shared-validate | off | 3 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| f232936e107b4f7b | shared-validate | full | 4 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| e3068477af497c9c | shared-validate | off | 4 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| 046c675b3bc821cc | shared-validate | full | 5 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| dfcce38ff3b49697 | shared-validate | off | 5 | yes | 1 | 0 | 0 | 0 | 0 | 13 | 2 | claude-sonnet-5 |
| 1a35ffaf11e46ecb | ttl-cache | full | 1 | yes | 0 | 0 | 1 | 1 | 0 | 33 | 3 | claude-sonnet-5 |
| 68c7e9c0057fbad5 | ttl-cache | off | 1 | yes | 0 | 0 | 1 | 1 | 0 | 33 | 3 | claude-sonnet-5 |
| 25dd69cd1e0fb443 | ttl-cache | full | 2 | yes | 0 | 0 | 1 | 1 | 0 | 33 | 3 | claude-sonnet-5 |
| 56e81882d0cb05c5 | ttl-cache | off | 2 | yes | 0 | 0 | 1 | 1 | 0 | 31 | 3 | claude-sonnet-5 |
| 51ff712b560c0fac | ttl-cache | full | 3 | yes | 0 | 0 | 1 | 1 | 0 | 23 | 3 | claude-sonnet-5 |
| 88f1f78cb52ed906 | ttl-cache | off | 3 | yes | 0 | 0 | 1 | 1 | 0 | 31 | 3 | claude-sonnet-5 |
| d5290afef81485e5 | ttl-cache | full | 4 | yes | 0 | 0 | 1 | 1 | 0 | 23 | 3 | claude-sonnet-5 |
| efc5588aebe8cb31 | ttl-cache | off | 4 | yes | 0 | 0 | 1 | 1 | 0 | 33 | 3 | claude-sonnet-5 |
| a086eaf6beaba06c | ttl-cache | full | 5 | yes | 0 | 0 | 1 | 1 | 0 | 22 | 3 | claude-sonnet-5 |
| 81ce3ae8764ed66a | ttl-cache | off | 5 | yes | 0 | 0 | 1 | 1 | 0 | 23 | 3 | claude-sonnet-5 |

## Failures (excluded from size comparison)

_None._

## Size metrics (passed runs only) — medians and full distributions

### config-fallback

**arm=off** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [1, 1, 1, 1, 1] median=1
- lines_added: [15, 17, 17, 16, 16] median=16
- lines_removed: [2, 2, 2, 2, 2] median=2

**arm=full** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [1, 1, 1, 1, 1] median=1
- lines_added: [13, 16, 17, 14, 16] median=16
- lines_removed: [2, 2, 2, 2, 2] median=2

### retry-backoff

**arm=off** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [9, 15, 9, 11, 9] median=9
- lines_removed: [3, 3, 3, 3, 3] median=3

**arm=full** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [9, 9, 11, 11, 9] median=9
- lines_removed: [3, 3, 3, 3, 3] median=3

### shared-validate

**arm=off** passed=5 failed=0

- files_created: [1, 1, 1, 1, 1] median=1
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [13, 14, 13, 13, 13] median=13
- lines_removed: [2, 2, 2, 2, 2] median=2

**arm=full** passed=5 failed=0

- files_created: [1, 1, 1, 1, 1] median=1
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [13, 13, 13, 13, 13] median=13
- lines_removed: [2, 2, 2, 2, 2] median=2

### ttl-cache

**arm=off** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 1, 1] median=1
- abstraction_layers: [1, 1, 1, 1, 1] median=1
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [31, 33, 23, 31, 33] median=31
- lines_removed: [3, 3, 3, 3, 3] median=3

**arm=full** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 1, 1] median=1
- abstraction_layers: [1, 1, 1, 1, 1] median=1
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [33, 33, 23, 22, 23] median=23
- lines_removed: [3, 3, 3, 3, 3] median=3

## Aggregate (all tasks, passed runs)

**arm=off** n=20
- files_created: [1, 0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1] median=0
- abstraction_layers: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0, 1] median=0
- config_keys_added: [0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- lines_added: [13, 9, 15, 17, 14, 17, 16, 13, 15, 31, 33, 16, 23, 31, 9, 11, 9, 13, 13, 33] median=15
- lines_removed: [2, 3, 2, 2, 2, 2, 2, 2, 3, 3, 3, 2, 3, 3, 3, 3, 3, 2, 2, 3] median=2.5

**arm=full** n=20
- files_created: [1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1] median=0
- dependencies_added: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0] median=0
- abstraction_layers: [0, 0, 1, 1, 0, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0] median=0
- config_keys_added: [0, 1, 0, 0, 0, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0] median=0
- lines_added: [13, 13, 33, 33, 9, 16, 23, 13, 17, 14, 9, 13, 22, 13, 11, 16, 11, 23, 9, 13] median=13
- lines_removed: [2, 2, 3, 3, 3, 2, 3, 2, 2, 2, 3, 2, 3, 2, 3, 2, 3, 3, 3, 2] median=2.5

## Conclusion

**No detectable effect** in this sample — and the reason is the signal set, not the mechanism (see below).

Offcut's mechanism worked: every `full` run wrote at least one `fired-*`
signal under the per-run state dir; every `off` run wrote none. Acceptance
passed on all 40 runs (0 failures either arm), so size comparisons are not
contaminated by broken lean diffs.

Across passed runs, medians do not separate the arms in a consistent direction:

| metric | off median | full median |
|---|---:|---:|
| files_created | 0 | 0 |
| lines_added | 15 | 13 |
| abstraction_layers | 0 | 0 |
| exported_unused | 0 | 0 |
| dependencies_added | 0 | 0 |
| config_keys_added | 0 | 0 |

Per-task, three of four tasks are essentially tied. `ttl-cache` shows a lower
`lines_added` median under `full` (23 vs 31) with identical abstraction and
export counts — interesting, not enough alone to claim an effect. Fail counts:
off=0, full=0.

### Every challenge issued was a false positive

The signals fired 30 times across the 20 `full` runs:

| signal | fires | of 20 runs |
|---|---:|---|
| `post:exported-unused` | 20 | **every run, every task** |
| `speculative-abstraction` | 5 | all ttl-cache |
| `new-file` | 5 | all shared-validate |

Checked against the prompts and the diffs, **none of them identified real
over-engineering**:

- **`ttl-cache`** — the prompt *specifies* `createCache({ defaultTtlMs = 1000 })`
  returning an object. `speculative-abstraction` flagged the factory the spec
  mandated. The implementation is a `Map`, an `isExpired` helper, and the four
  requested methods.
- **`shared-validate`** — the prompt says "Put the function where both callers
  can import it (a small shared module is fine)". `new-file` flagged the file
  the task asked for, and `post:exported-unused` flagged `isValidEmail` even
  though `register.js` and `invite.js` both import it **in the same diff**.
- **`post:exported-unused` fired on 20/20 runs.** Every task's deliverable is an
  exported function. A signal that fires on every input carries no information.

This reframes the headline. The output did not change because **the agent was
correct to ignore the advice**. That is the right outcome from a wrong input,
not a persuasion failure.

What the experiment actually establishes:

- the mechanism works — hooks fire, state is written, context is delivered
- the signal set does not — it flags spec-compliant code as over-engineering
- a tool that challenges correct code is worse than one that stays quiet,
  because it trains the reader to ignore it

**The number that matters now is the false-positive rate, and on this corpus it
is 30/30.** A future run should measure it directly rather than inferring it
from unchanged output, and no intervention should be tuned until the signals
identify something real — otherwise the experiment measures how effectively an
agent can be pushed into writing worse code.

Five runs per cell is enough to notice a large effect and not enough to claim
a small one. This experiment does not support claiming that Offcut makes agent
output smaller or simpler under these prompts on Claude Code + `claude-sonnet-5`.

## Findings (process)

- Real `~/.offcut/` can accumulate many `fired-*` / `turn-*` files; this bench
  always uses a fresh `OFFCUT_STATE_DIR` and never touches the real state dir.
  Pruning remains the upgrade path named by the `offcut:` marker in
  `hooks/state.js`.
- First paid batch hit Claude session rate limit (429) mid-grid; failed cells
  were discarded and re-run with `--resume-failed` after the limit reset.
  Published cells are the successful completions only (no rate-limit empties
  folded into size medians).
- Mid-experiment the harness switched to `--effort low` and zero inter-run
  pause to finish under the limit. Arms stayed interleaved, so the arm
  comparison remains paired; absolute style may differ across early vs late
  reps.
- Host recorded as Claude Code **2.1.241** (HOSTS.md Phase 3 used 2.1.240).
- Model ID recorded exactly: **`claude-sonnet-5`** (not a marketing alias).
