# Offcut competitive receipt

Status: **NOT CLAIMABLE** (review_pending)

Acceptance gate: **pass**
Completeness gate: **pending_or_failed**

| Arm | Runs passed | Output tokens | Noncached input | Lines added |
|---|---:|---:|---:|---:|
| baseline | 2/2 | 1890.5 | 19771 | 11.5 |
| terse | 2/2 | 1760 | 18854.5 | 12 |
| caveman | 2/2 | 1483.5 | 16287 | 17 |
| ponytail | 2/2 | 1434.5 | 22322.5 | 12 |
| offcut | 2/2 | 1228.5 | 24442.5 | 17 |

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

Receipt SHA-256: `525bd79dc8fa86b87fb685c8b475b41ffad5dd180058b402fbd4e4413bf9cc67`
