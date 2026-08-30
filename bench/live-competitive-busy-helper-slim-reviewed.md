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

- Warm cache metrics are unavailable for at least one arm.

Receipt SHA-256: `e975b16ae0775162390b6d3e82817d53d23457e0bcb9857ac20ee5112186db86`
