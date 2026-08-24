# Signal quality (Phase 6)

Measured with `node bench/fp.mjs` against the 40 accepted Phase 5 bench runs
(labeled negatives: any fire is a false positive) and `bench/corpus/positive/`
(hand-written true positives).

## Before (commit introducing `bench/fp.mjs`, unfixed signals)

Write-time simulation (matches hooks; no corpus):

| signal | fires-on-negative | rate |
|---|---:|---:|
| new-file | 10/40 | 25% |
| large-first-write | 0/40 | 0% |
| new-dependency | 0/40 | 0% |
| speculative-abstraction | 10/40 | 25% |
| config-for-constant | 0/40 | 0% |
| exported-unused | 30/40 | 75% |
| new-config-surface | 10/40 | 25% |
| single-call-wrapper | 0/40 | 0% |
| unused-default-param | 20/40 | 50% |

Phase 5 only recorded the first challenge per phase on `full` runs, so it under-
counted: `unused-default-param` and `new-config-surface` also fired on every
matching task but lost the race to an earlier signal.

## After (this branch)

Write-time simulation:

| signal | fires-on-positive | fires-on-negative | verdict |
|---|---|---:|---|
| large-first-write | yes | 0/40 | keep |
| new-dependency | yes | 0/40 | keep |
| speculative-abstraction | yes | 0/40 | keep (fixed) |
| config-for-constant | yes | 0/40 | keep |
| exported-unused | yes | 0/40 | keep on diff/repo only |
| new-config-surface | yes | 0/40 | keep (fixed) |
| single-call-wrapper | yes | 0/40 | keep |
| unused-default-param | yes | 0/40 | keep (fixed) |
| new-file | — | — | **deleted** |

Diff context (corpus from worktree) after: also **0/40** for every surviving
signal.

## What changed

### `new-file` — deleted

`pathExists === false` is a constant on creates, not a heuristic. The prompt
often asks for the file (`shared-validate`). No defensible form stays silent on
that task while still meaning something. Creating a file is not evidence of
over-engineering.

### `exported-unused` — not decidable at write time

Without a cross-file corpus, every module's public API looks unused inside its
own file (30/40 FP). Removed from `write` context. On diff/repo it now also
requires evidence of a multi-module program (`import` / `require` in the
corpus); a lone deliverable export is the API, not a dead symbol.

### `speculative-abstraction` — no longer fires on name shape

Dropped `createX` / `FooFactory` detection. Those matched `createCache` and
treated `new Map()` as "one implementation" (`ttl-cache`: 10/10 FP). Surviving
check: interface / abstract class with exactly one implementor in view.

### `new-config-surface` — frameworks, not `process.env`

`process.env` is often the requested surface (`config-fallback`: 10/10 FP).
Detector now flags config frameworks (`cosmiconfig`, `nconf`, `convict`,
`defineConfig`, …), not reading an env var.

### `unused-default-param` — unused in the file, not "no named call"

Previously fired when a defaulted param had no `name:` at a call site — true of
every options bag the prompts specified (`retry-backoff`, `ttl-cache`). Now
fires only when the defaulted name appears once in the file (never read).

## Stopping condition

False-positive rate on the negative corpus dropped from many signals firing on
25–75% of runs to **0/40** write-time and **0/40** diff-context, while each
surviving signal still fires on a hand-written positive example.

So the write-time deterministic-signal approach is **not** dead on this
evidence: the Phase 5 null result was a broken detector, not a ceiling. The
honest limit that remains: several judgments ("was this requested?", "is this
export dead vs public API?") are not decidable from one file at write time —
those signals were deleted or moved to diff/repo with corpus requirements
rather than approximated.

Re-run: `node bench/fp.mjs`.
