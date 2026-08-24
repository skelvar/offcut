# Phase 5 results

Every run is listed. Failed acceptance checks are excluded from size
medians and reported separately.

## Run metadata

- Host versions: stub
- Model IDs: stub:elaborate; stub:lean
- Dates: 2026-08-24
- Total runs: 40

## Prompt integrity

- **config-fallback**: identical prompt sha256 across arms (`2282461e0a2622ee7a477432d659394529c313f686d0569c4037760ee541da0c`); arms=full,off
- **retry-backoff**: identical prompt sha256 across arms (`90230ecd4023f2970dc3609c823ffc3ffd14fcd5532ef49a5c3cf0be3a007e69`); arms=off,full
- **shared-validate**: identical prompt sha256 across arms (`1a9027f23e190f5fdf58ef9cdaa4a6049740022a1c44f1be68435b05e1025047`); arms=off,full
- **ttl-cache**: identical prompt sha256 across arms (`381a5309ba9d5c30868deeaa15c68ecfa3bb0b556b1af64c9ca138595ce1f300`); arms=full,off

## All runs

| run_id | task | arm | rep | passed | files+ | deps+ | exports∅ | abstr | cfg+ | +lines | -lines | model |
|---|---|---|---:|---|---:|---:|---:|---:|---:|---:|---:|---|
| 25fa17e1adaac58d | config-fallback | full | 1 | yes | 5 | 0 | 3 | 0 | 8 | 68 | 2 | stub:elaborate |
| 2c822d378ff492b4 | config-fallback | off | 1 | yes | 0 | 0 | 0 | 0 | 1 | 17 | 2 | stub:lean |
| 6c71639d84d35506 | config-fallback | full | 2 | yes | 5 | 0 | 3 | 0 | 8 | 68 | 2 | stub:elaborate |
| 41b274281817345a | config-fallback | off | 2 | yes | 0 | 0 | 0 | 0 | 1 | 17 | 2 | stub:lean |
| 777264b147a9c162 | config-fallback | full | 3 | yes | 5 | 0 | 3 | 0 | 8 | 68 | 2 | stub:elaborate |
| 7f21bb767c910596 | config-fallback | off | 3 | yes | 0 | 0 | 0 | 0 | 1 | 17 | 2 | stub:lean |
| 37b73043b957be4f | config-fallback | full | 4 | yes | 5 | 0 | 3 | 0 | 8 | 68 | 2 | stub:elaborate |
| 6eb7ae6591426be8 | config-fallback | off | 4 | yes | 0 | 0 | 0 | 0 | 1 | 17 | 2 | stub:lean |
| b63c82565666a893 | config-fallback | full | 5 | yes | 5 | 0 | 3 | 0 | 8 | 68 | 2 | stub:elaborate |
| 6163b0eb5d469cf9 | config-fallback | off | 5 | yes | 0 | 0 | 0 | 0 | 1 | 17 | 2 | stub:lean |
| af2dfbdc1f0cf48f | retry-backoff | full | 1 | yes | 2 | 0 | 1 | 1 | 0 | 48 | 3 | stub:elaborate |
| 4524e0c07f048a7e | retry-backoff | off | 1 | yes | 0 | 0 | 0 | 0 | 0 | 16 | 3 | stub:lean |
| 6757046620af432d | retry-backoff | full | 2 | yes | 2 | 0 | 1 | 1 | 0 | 48 | 3 | stub:elaborate |
| 0b6d436a2520f5f3 | retry-backoff | off | 2 | yes | 0 | 0 | 0 | 0 | 0 | 16 | 3 | stub:lean |
| f3f6b30028744ed5 | retry-backoff | full | 3 | yes | 2 | 0 | 1 | 1 | 0 | 48 | 3 | stub:elaborate |
| 3ba1a132122d016e | retry-backoff | off | 3 | yes | 0 | 0 | 0 | 0 | 0 | 16 | 3 | stub:lean |
| be240cb900a5b24e | retry-backoff | full | 4 | yes | 2 | 0 | 1 | 1 | 0 | 48 | 3 | stub:elaborate |
| 3addd4d2567a37f9 | retry-backoff | off | 4 | yes | 0 | 0 | 0 | 0 | 0 | 16 | 3 | stub:lean |
| 698ae6e84d8abe21 | retry-backoff | full | 5 | yes | 2 | 0 | 1 | 1 | 0 | 48 | 3 | stub:elaborate |
| e8f504b44ed9f58c | retry-backoff | off | 5 | yes | 0 | 0 | 0 | 0 | 0 | 16 | 3 | stub:lean |
| c61ba6fc38b884d1 | shared-validate | full | 1 | yes | 4 | 0 | 1 | 3 | 5 | 42 | 2 | stub:elaborate |
| 0c679d85d52bd7d7 | shared-validate | off | 1 | yes | 1 | 0 | 0 | 0 | 0 | 16 | 2 | stub:lean |
| 11fb4ef1fe8745c0 | shared-validate | full | 2 | yes | 4 | 0 | 1 | 3 | 5 | 42 | 2 | stub:elaborate |
| 6c4db89d8a1fb601 | shared-validate | off | 2 | yes | 1 | 0 | 0 | 0 | 0 | 16 | 2 | stub:lean |
| ab7460874b866353 | shared-validate | full | 3 | yes | 4 | 0 | 1 | 3 | 5 | 42 | 2 | stub:elaborate |
| 0bfb5bfbcff7d881 | shared-validate | off | 3 | yes | 1 | 0 | 0 | 0 | 0 | 16 | 2 | stub:lean |
| 8d0b33f28e2f58b3 | shared-validate | full | 4 | yes | 4 | 0 | 1 | 3 | 5 | 42 | 2 | stub:elaborate |
| a3994cdc18a34a5c | shared-validate | off | 4 | yes | 1 | 0 | 0 | 0 | 0 | 16 | 2 | stub:lean |
| a4010eaa291d5711 | shared-validate | full | 5 | yes | 4 | 0 | 1 | 3 | 5 | 42 | 2 | stub:elaborate |
| 2a6a34d28970ab6c | shared-validate | off | 5 | yes | 1 | 0 | 0 | 0 | 0 | 16 | 2 | stub:lean |
| cd183be4da290280 | ttl-cache | full | 1 | yes | 4 | 0 | 1 | 1 | 4 | 54 | 3 | stub:elaborate |
| 73b15013a4851a58 | ttl-cache | off | 1 | yes | 0 | 0 | 1 | 1 | 0 | 22 | 3 | stub:lean |
| fd6369702f282d39 | ttl-cache | full | 2 | yes | 4 | 0 | 1 | 1 | 4 | 54 | 3 | stub:elaborate |
| 4fc9d30b522d3999 | ttl-cache | off | 2 | yes | 0 | 0 | 1 | 1 | 0 | 22 | 3 | stub:lean |
| 199c55edd3b202f4 | ttl-cache | full | 3 | yes | 4 | 0 | 1 | 1 | 4 | 54 | 3 | stub:elaborate |
| 1709c8453ebb4f56 | ttl-cache | off | 3 | yes | 0 | 0 | 1 | 1 | 0 | 22 | 3 | stub:lean |
| 4dac233c43b6d707 | ttl-cache | full | 4 | yes | 4 | 0 | 1 | 1 | 4 | 54 | 3 | stub:elaborate |
| cf4218766f8bbfba | ttl-cache | off | 4 | yes | 0 | 0 | 1 | 1 | 0 | 22 | 3 | stub:lean |
| 0a1f4b1c6c6f0793 | ttl-cache | full | 5 | yes | 4 | 0 | 1 | 1 | 4 | 54 | 3 | stub:elaborate |
| 3751b561aec7462b | ttl-cache | off | 5 | yes | 0 | 0 | 1 | 1 | 0 | 22 | 3 | stub:lean |

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
- lines_added: [17, 17, 17, 17, 17] median=17
- lines_removed: [2, 2, 2, 2, 2] median=2

**arm=full** passed=5 failed=0

- files_created: [5, 5, 5, 5, 5] median=5
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [3, 3, 3, 3, 3] median=3
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [8, 8, 8, 8, 8] median=8
- lines_added: [68, 68, 68, 68, 68] median=68
- lines_removed: [2, 2, 2, 2, 2] median=2

### retry-backoff

**arm=off** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [16, 16, 16, 16, 16] median=16
- lines_removed: [3, 3, 3, 3, 3] median=3

**arm=full** passed=5 failed=0

- files_created: [2, 2, 2, 2, 2] median=2
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 1, 1] median=1
- abstraction_layers: [1, 1, 1, 1, 1] median=1
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [48, 48, 48, 48, 48] median=48
- lines_removed: [3, 3, 3, 3, 3] median=3

### shared-validate

**arm=off** passed=5 failed=0

- files_created: [1, 1, 1, 1, 1] median=1
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 0, 0] median=0
- abstraction_layers: [0, 0, 0, 0, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [16, 16, 16, 16, 16] median=16
- lines_removed: [2, 2, 2, 2, 2] median=2

**arm=full** passed=5 failed=0

- files_created: [4, 4, 4, 4, 4] median=4
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 1, 1] median=1
- abstraction_layers: [3, 3, 3, 3, 3] median=3
- config_keys_added: [5, 5, 5, 5, 5] median=5
- lines_added: [42, 42, 42, 42, 42] median=42
- lines_removed: [2, 2, 2, 2, 2] median=2

### ttl-cache

**arm=off** passed=5 failed=0

- files_created: [0, 0, 0, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 1, 1] median=1
- abstraction_layers: [1, 1, 1, 1, 1] median=1
- config_keys_added: [0, 0, 0, 0, 0] median=0
- lines_added: [22, 22, 22, 22, 22] median=22
- lines_removed: [3, 3, 3, 3, 3] median=3

**arm=full** passed=5 failed=0

- files_created: [4, 4, 4, 4, 4] median=4
- dependencies_added: [0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 1, 1] median=1
- abstraction_layers: [1, 1, 1, 1, 1] median=1
- config_keys_added: [4, 4, 4, 4, 4] median=4
- lines_added: [54, 54, 54, 54, 54] median=54
- lines_removed: [3, 3, 3, 3, 3] median=3

## Aggregate (all tasks, passed runs)

**arm=off** n=20
- files_created: [0, 1, 1, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0] median=0
- dependencies_added: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- exported_unused: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0] median=0
- abstraction_layers: [0, 0, 0, 1, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0] median=0
- config_keys_added: [0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 1, 0, 1, 0, 1, 0, 0, 0] median=0
- lines_added: [16, 16, 16, 22, 16, 17, 22, 16, 16, 17, 16, 22, 17, 16, 17, 22, 17, 16, 22, 16] median=16.5
- lines_removed: [3, 2, 2, 3, 2, 2, 3, 3, 3, 2, 3, 3, 2, 2, 2, 3, 2, 2, 3, 3] median=2.5

**arm=full** n=20
- files_created: [4, 4, 4, 5, 5, 4, 2, 2, 5, 5, 4, 4, 4, 2, 5, 2, 4, 4, 2, 4] median=4
- dependencies_added: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] median=0
- exported_unused: [1, 1, 1, 3, 3, 1, 1, 1, 3, 3, 1, 1, 1, 1, 3, 1, 1, 1, 1, 1] median=1
- abstraction_layers: [1, 3, 1, 0, 0, 1, 1, 1, 0, 0, 3, 3, 3, 1, 0, 1, 3, 1, 1, 1] median=1
- config_keys_added: [4, 5, 4, 8, 8, 4, 0, 0, 8, 8, 5, 5, 5, 0, 8, 0, 5, 4, 0, 4] median=4.5
- lines_added: [54, 42, 54, 68, 68, 54, 48, 48, 68, 68, 42, 42, 42, 48, 68, 48, 42, 54, 48, 54] median=51
- lines_removed: [3, 2, 3, 2, 2, 3, 3, 3, 2, 2, 2, 2, 2, 3, 2, 3, 2, 3, 3, 3] median=2.5

## Conclusion

**Dry-run / stub only.** These numbers validate the harness (isolation, blind scoring, failure gating). They are not evidence about Offcut. Paid Claude Code runs replace this section when executed.

## Findings (process)

- Real `~/.offcut/` can accumulate many `fired-*` / `turn-*` files; this bench always uses a fresh `OFFCUT_STATE_DIR` and never touches the real state dir. Pruning remains the upgrade path named by the `offcut:` marker in `hooks/state.js`.
