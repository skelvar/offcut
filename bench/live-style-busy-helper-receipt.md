# Offcut style receipt

Status: **NOT CLAIMABLE** (review_pending)

Acceptance gate: **pass**
Completeness gate: **pending_or_failed**

| Arm | Runs passed | Output tokens | Noncached input | Lines added |
|---|---:|---:|---:|---:|
| normal | 2/2 | 1292.5 | 45616 | 17 |
| terse | 2/2 | 1379 | 22816.5 | 16.5 |
| concise | 2/2 | 1351.5 | 21714 | 16.5 |

## Cache

| Arm | Cold cache write | Warm cache read | Warm noncached input |
|---|---:|---:|---:|
| normal | 0 | unavailable | unavailable |
| terse | 0 | unavailable | unavailable |
| concise | 0 | unavailable | unavailable |

## Warnings

- Blind answer-completeness review is incomplete or failed.
- Warm cache metrics are unavailable for at least one arm.

Receipt SHA-256: `a27c49b2b1a156f716f1183e63dbcf082f35cf3a955b17221146a505c50be815`
