# Offcut competitive receipt

Status: **NOT CLAIMABLE** (not_comparable)

Acceptance gate: **pass**
Completeness gate: **pending_or_failed**

| Arm | Runs passed | Output tokens | Noncached input | Lines added |
|---|---:|---:|---:|---:|
| baseline | 2/2 | 1255 | 19781 | 17 |
| terse | 2/2 | 1292 | 14602 | 17 |
| caveman | 2/2 | 1373.5 | 20752 | 17 |
| ponytail | 2/2 | 1346 | 17229 | 17 |
| offcut | 2/2 | 1745 | 24130.5 | 16 |

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
- Provider telemetry is missing or a run ended with a model failure.

Receipt SHA-256: `48eda6505c5ea0a7e042bf5feb7f8441ae66b6127533b7c7f76ae3b2a2b31cab`
