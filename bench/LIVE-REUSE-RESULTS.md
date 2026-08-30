# Live reuse results

**Status:** exploratory qualitative evidence, not Phase 11 efficacy evidence.

The 16 historical Codex/Sol runs were rechecked on 2026-08-29 with the shared
Save-control acceptor. Fourteen pass. Both `match-sign-in` arms fail because
they disable Save but never render the explicitly requested `Saving` label.
The acceptance fix removed three harness false negatives; it did not rewrite
the original `accept.json` files.

## Five-ticket grid

| Ticket | `off` | `full` | `off` noncached | `full` noncached | tools `off/full` |
|---|---:|---:|---:|---:|---:|
| `async-action-pattern` | pass | pass | 16,942 | 27,302 | 5 / 5 |
| `busy-helper` | pass | pass | 20,724 | 32,874 | 5 / 5 |
| `labels-later` | pass | pass | 22,034 | 21,303 | 4 / 5 |
| `match-sign-in` | fail | fail | 39,953 | 33,471 | 5 / 5 |
| `next-week-toolbar` | pass | pass | 22,641 | 10,365 | 5 / 5 |
| **Total** | **4/5** | **4/5** | **122,294** | **125,315** | **24 / 25** |

Gross input was 418,998 (`off`) versus 460,675 (`full`), a 9.95% increase.
After subtracting cache-read input, the difference was 2.47%. Each arm used
five model turns. `match-sign-in` was the only architectural split, but both
outputs failed acceptance, so it is not an accepted comparison.

The older three-ticket set now passes 6/6. It is not pooled with the grid
because prompts and execution time differ.

## Limits

- One replicate per historical arm; the historical runner always ran `off`
  first. The current runner supports `--reps 2` and reverses arm order on the
  second replicate.
- No one-line “be terse” arm exists, so these runs cannot support a token-saving
  claim.
- Codex/Sol only. The Grok-off fixtures are contaminated and are excluded.
- No model rerun was needed for this correction. Future artifacts go under
  `bench/live-runs/`, separate from sealed `bench/runs/` evidence.

Conclusion: the live grid is useful for inspecting construction choices, not
for claiming efficacy or token savings. It does not justify a new hook.
