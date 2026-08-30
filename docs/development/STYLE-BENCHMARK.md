# Offcut response-style benchmark

**Status:** implementation and deterministic checks are ready. No model-backed
style result has been produced, and Offcut makes no token-saving or competitor
win claim from this document.

## Question

Does Offcut's default concise style reduce user-visible response cost without
changing the work, breaking task acceptance, or omitting information a user
needs?

The comparison has three arms:

| Arm | Construction guidance | Response guidance |
|---|---|---|
| `normal` | Offcut full | normal prose |
| `terse` | Offcut full | the one-line control `Be terse.` |
| `concise` | Offcut full | Offcut's shipped concise contract |

This isolates response style. It is not a rerun of Phase 11 and does not alter
the sealed efficacy report.

## Run boundary

The command is plan-only unless both execution flags are present:

```powershell
node bench/live-style.mjs busy-helper --reps 2
node bench/live-style.mjs busy-helper --reps 2 --execute --i-understand-this-runs-models
```

The live form starts model calls and consumes account usage. Each replicate is
counterbalanced. Run tasks separately so an interrupted ticket cannot hide
which evidence is incomplete.

Raw model records, scored style rows, and receipts are separate non-sealed
artifacts under `bench/`. A newly generated receipt starts as **NOT CLAIMABLE**
because its answer review is pending.

## Claim gates

A result is not comparable unless every arm has the same number of runs and
every run passes the ticket's executable acceptance test. Lower token counts
cannot rescue a failed implementation.

Every accepted answer then needs a blind answer-completeness review. The
reviewer sees the answer without its arm label and marks whether it preserves:

1. the result or what changed;
2. verification actually run and its outcome;
3. material caveats or uncertainty when present;
4. the next action when one remains;
5. exact errors, warnings, security notes, and confirmation text when present.

Reviews are JSONL keyed by opaque run ID:

```json
{"run_id":"opaque-id","answer_completeness":"pass","reviewer_blinded":true}
```

Apply them without another model call:

```powershell
node bench/style-receipt.mjs bench/live-style-busy-helper.jsonl --reviews reviews.jsonl --out bench/live-style-busy-helper-reviewed
```

Only a balanced, fully accepted, fully reviewed receipt becomes claimable.
The receipt SHA-256 makes later edits visible.

## Measurements

The receipt reports dimensions, not a composite score:

- input, cache-read, cache-creation, noncached input, output, and reasoning
  tokens;
- model turns, completed tool calls, and duration;
- lines added, lines removed, and files created;
- task acceptance and answer completeness.

The first `turn.completed` event is the initial user-turn aggregate. It can
already contain cache reads from the model/tool loop. Later events are warm
only when the same Codex session is actually resumed and the transcripts are
combined in order. The current isolated live driver is ephemeral and normally
emits one event, so its warm-session row is explicitly unavailable. Cache reads
and writes still stay separate; gross input alone is never called a saving.

Offcut is eligible for a response-efficiency claim only if concise:

- matches the `terse` arm on task acceptance and blind completeness;
- improves at least one cost dimension over `normal` by a disclosed median;
- does not regress model turns or tool calls; and
- reports cold and warm cache evidence separately.

## Caveman and Ponytail

These installed skills solve different problems. Caveman compresses prose by
allowing fragments, dropped articles, and abbreviations. Ponytail governs the
implementation chosen and explicitly says it governs what is built, not how
the agent talks. A single "tokens saved" leaderboard would conflate response
compression with code minimalism.

A future public competitor arm must pin the exact source version and hash,
confirm redistribution/license terms, use the same tasks and model settings,
and pass the same acceptance and blind-completeness gates. Until that run
exists, Offcut does not say it beats Caveman or Ponytail. Its differentiator is
the auditable contract and receipt: readable concise prose, construction
cheapness, a user-controlled escape hatch, and cache-aware evidence rather
than an unsupported percentage.
