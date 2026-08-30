# Offcut competitive receipt

Status: **CLAIMABLE** (claimable)

Acceptance gate: **pass**
Completeness gate: **pass**

| Arm | Runs passed | Output tokens | Noncached input | Lines added |
|---|---:|---:|---:|---:|
| baseline | 2/2 | 1218.5 | 27091 | 17 |
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

- Warm cache metrics are unavailable for at least one arm.

Receipt SHA-256: `6896637505bb355219129db205ec2da2b8a2b716f7637b2326c7e6c465048e2c`
