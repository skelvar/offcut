# Offcut Close exploratory result

One matched Cursor task was run with `grok-4.6`, reasoning effort `xhigh`, an
18-turn ceiling, isolated configuration, the same checkout and core task, and
no web access. The final external oracle is pinned as
`f9752a740aee63275d2160b10077fc13948ddd3eaa50feb9ea57966e5c8acd12`.

| Arm | Final oracle | Turns | Tools | Evaluators | Test commands | Time | Cost |
|---|---:|---:|---:|---:|---:|---:|---:|
| Ordinary completion | fail | 6 | 11 | 0 | 1 | 138 s | $0.0225 |
| Initial Close protocol | fail | 13 | 39 | 2 | 4 | 333 s | $0.0916 |
| Optimized Close protocol | fail | 11 | 35 | 1 | 2 | 314 s | $0.0855 |
| Completion + one strong review | pass | 12 | 27 | 1 | 3 | 462 s | $0.0896 |

| Arm | Input | Cache read input | Output |
|---|---:|---:|---:|
| Ordinary completion | 31,965 | 62,848 | 6,179 |
| Initial Close protocol | 138,956 | 272,384 | 20,795 |
| Optimized Close protocol | 143,754 | 215,168 | 17,972 |
| Completion + one strong review | 137,131 | 170,112 | 27,961 |

The strong reviewer found a reachable synchronous `store.create` failure and
return path that both Close variants missed. It repaired the service boundary
and added durable regression tests. The final oracle passes only that arm.

No arm exhibited repeated reopen/fix rounds on this task. Both Close variants
reported one repair cycle, so this run supplies no evidence that Close reduces
looping. Fewer turns in optimized Close than the strong-review arm cannot offset
the missed required behavior.

The original oracle was corrected twice during adversarial review: first to
remove an unstated object-key-order requirement, then to prevent a partial
repair from deadlocking and to cover the synchronous failure/retry path. Raw
summaries are retained; each arm's `rescore.txt` records its outcome against the
final oracle.

This is exploratory evidence from one task, not a general model or cost claim.
It is enough for the accepted decision gate: Close did not beat one good review
on independently verified required behavior. The prompt prototype therefore
remains only in the benchmark and is not distributed as an Offcut command.
