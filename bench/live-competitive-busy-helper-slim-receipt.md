# Offcut competitive receipt

Status: **NOT CLAIMABLE** (review_pending)

Acceptance gate: **pass**
Completeness gate: **pending_or_failed**

| Arm | Runs passed | Output tokens | Noncached input | Lines added |
|---|---:|---:|---:|---:|
| baseline | 2/2 | 1218.5 | 27091 | 17 |
| terse | 2/2 | 1292 | 14602 | 17 |
| caveman | 2/2 | 1373.5 | 20752 | 17 |
| ponytail | 2/2 | 1346 | 17229 | 17 |
| offcut | 2/2 | 1277.5 | 28834.5 | 16.5 |

## Cache

| Arm | Cold cache write | Warm cache read | Warm noncached input |
|---|---:|---:|---:|
| baseline | 0 | unavailable | unavailable |
| terse | 0 | unavailable | unavailable |
| caveman | 0 | unavailable | unavailable |
| ponytail | 0 | unavailable | unavailable |
| offcut | 0 | unavailable | unavailable |

## Warnings

- Blind answer-completeness review is incomplete or failed.
- Warm cache metrics are unavailable for at least one arm.

Receipt SHA-256: `37fb0e9acef2d789b04e2247add5bf1cc0c33f2fc343173c0d20f761e0f4a5b5`
