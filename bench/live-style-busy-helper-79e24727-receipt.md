# Offcut style receipt

Status: **NOT CLAIMABLE** (review_pending)

Acceptance gate: **pass**
Completeness gate: **pending_or_failed**

| Arm | Runs passed | Output tokens | Noncached input | Lines added |
|---|---:|---:|---:|---:|
| normal | 2/2 | 1044.5 | 36258 | 17 |
| terse | 2/2 | 1725 | 26735.5 | 11.5 |
| concise | 2/2 | 1265 | 16349.5 | 17 |

## Cache

| Arm | Cold cache write | Warm cache read | Warm noncached input |
|---|---:|---:|---:|
| normal | 0 | unavailable | unavailable |
| terse | 0 | unavailable | unavailable |
| concise | 0 | unavailable | unavailable |

## Warnings

- Blind answer-completeness review is incomplete or failed.
- Warm cache metrics are unavailable for at least one arm.

Receipt SHA-256: `b7c3a10027dda912a07c2a6aac903322e217971fed0c09d5fcac20880729b62c`
