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

## Review findings (2026-08-25)

### The 40-run corpus is necessary but not sufficient

0/40 is real, and it is weaker evidence than it looks. All four bench tasks
produce 10–30 line solutions with no comments, no prose, and one module. A
signal can score 0/40 and still misfire constantly on ordinary code.

Dogfooding proved it: scanning Offcut's own `hooks/` and `scripts/` produced
**9 findings**, one of which was a genuine false positive the corpus could
never have caught.

**`speculative-abstraction` fired on `hooks/signals.js` because of a comment.**
The line

```
// Only structural indirection: an interface / abstract class with exactly one
```

parses as an abstract class named `with`. The signal matched prose describing
the pattern rather than the pattern. Bisected to lines 166–178 of the file.

Fixed by stripping line and block comments before structural matching
(`stripComments`). Verified: own source no longer fires, the positive corpus
still does, 0/40 unchanged, regression test fails against the unfixed code.

**Recommendation:** add a real-code negative corpus. Offcut's own source is the
cheapest one available and it is already in the repo — every signal change
should be scanned against it, not only against the bench runs.

### `exported-unused` is scope-dependent, by construction

Scanning `hooks/ scripts/ bench/lib.mjs` flags `hooks/state.js` exports as
unused. Adding `tests/` to the same scan clears them, because the callers live
there.

This is inherent to a corpus-based check: **an audit of a subdirectory will
report false dead exports for anything its callers reference from outside the
scan.** Not a bug to fix at this level, but `/offcut-audit` should say what was
in scope, and users should point it at a whole project rather than a folder.

### Two positive examples are thin

`large-first-write`'s example is 93 lines of literal
`// padding to exceed large-first-write threshold`, and `config-for-constant`'s
is the single line `export const MAX_RETRIES = 3;`. Both fire, and neither is
convincing evidence of over-engineering — they are the smallest inputs that
satisfy the check.

Both signals are 0/40 on negatives so they are not noisy, but their value is
unproven. If a real-code corpus shows either firing on ordinary code, delete it
rather than tuning it.

## Real-code corpus results (2026-08-25)

`node bench/realcode.mjs` — 1655 files across Offcut's own source and every
installed third-party plugin. Published, reviewed code.

**51.1% of files produce at least one finding.** Broken down, the noise is not
distributed — it is one signal:

| signal | files fired | rate | verdict |
|---|---:|---:|---|
| config-for-constant | 793 | **47.9%** | **broken — see below** |
| single-call-wrapper | 62 | 3.7% | borderline, investigate |
| speculative-abstraction | 10 | 0.6% | holds up |
| new-config-surface | 9 | 0.5% | holds up |
| new-dependency | 8 | 0.5% | holds up |
| unused-default-param | 4 | 0.2% | holds up |
| large-first-write | 0 | 0.0% | holds up |
| exported-unused | 0 | 0.0% | **not measured** (see caveat) |

### `config-for-constant` fires on 100% of JSON files

Every one of 411 `.json` files. 65% of `.py`. 39% of `.sh`. It matched a
markdown scaffold doc because an example block contained `NODE_ENV=`,
`PORT=`, `DATABASE_URL=`.

Two compounding faults:

1. **No file-type gating.** The signals are JS-shaped; the scanner applies them
   to `.py`, `.json`, `.md`, `.sh`, `.yaml`, `.txt` alike. A config file being
   full of config keys is not a finding.
2. **The check is a syntax match, not a semantic one.** `ALLCAPS =` appears in
   documentation, examples, shell scripts, and env templates.

A signal firing on half of all files carries no information regardless of how
its message is worded. It should be deleted or restricted to a scope where
"this constant is never read" is actually decidable.

### Caveat on `exported-unused`

`realcode.mjs` passes `corpus: null`, and after the Phase 6 fix that signal is
silent without a corpus by design. **Its 0.0% here means "not exercised", not
"clean."** It needs a separate measurement that builds a cross-file corpus per
project. Do not read this row as a pass.

**Closed in the Phase 7 section below.** `realcode.mjs` builds a per-project
corpus and `exportedUnusedExercised` is asserted true, so the signal can no
longer report clean without having run. Measured there at 6 files, 0.4%.

### What this settles about the stopping condition

The ceiling is **not** where it looked. Seven of eight signals fire on ≤3.7% of
real files; the structural ones (`speculative-abstraction`, `new-dependency`,
`unused-default-param`) survived 1655 files of ordinary code after the
comment-stripping fix.

The approach is viable. **One signal is broken and one is untested.** That is a
much smaller problem than "text-level checks cannot work", and it is fixable
without abandoning the design.

## Phase 7 — after real-code fixes (2026-08-25)

Before changing anything: `node bench/realcode.mjs` reproduced **51.1%** /
`config-for-constant` **47.9%** (same as the table above).

### What changed

1. **`config-for-constant` deleted.** Being right would require knowing a value
   is never read, in a language whose config conventions we parse. That is not
   available at scan time — same retirement reasoning as `new-file`.
2. **File-type applicability.** Every signal declares `extensions` (or `*`).
   `runSignals` skips non-matching paths. JS-shaped signals
   (`speculative-abstraction`, `exported-unused`, `new-config-surface`,
   `single-call-wrapper`, `unused-default-param`) no longer run on `.json` /
   `.md` / `.py` / `.sh`.
3. **`realcode.mjs` builds per-project corpora.** Offcut (hooks+scripts+bench+
   tests) is one project; each `~/.claude/plugins/cache/<plugin>/<version>` is
   its own. `exported-unused` is exercised.

### After

`node bench/realcode.mjs` — 1710 files, 20 projects:

**4.3% of files produce at least one finding** (was 51.1%).

| signal | files fired | rate | verdict |
|---|---:|---:|---|
| single-call-wrapper | 53 | 3.1% | keep — see sample below |
| new-dependency | 8 | 0.5% | holds up |
| exported-unused | 6 | 0.4% | **measured** — holds up |
| new-config-surface | 5 | 0.3% | holds up |
| unused-default-param | 5 | 0.3% | holds up |
| speculative-abstraction | 2 | 0.1% | holds up |
| large-first-write | 0 | 0.0% | holds up |

`bench/fp.mjs` remains **0/40** write-time and **0/40** diff-context. Every
survivor still fires on its positive example.

Markdown and Python fire rates dropped to **0%**. Remaining JSON fires are
`new-dependency` on real manifest edits (expected).

### `single-call-wrapper` hand sample (dozen JS/TS fires)

Before file-type gating, 11/62 fires were `.md` and 2 were `.sh` — examples of
code in docs, not wrappers. After gating, rate is 3.1% on JS/TS only.

Sampled matches (superpowers brainstorm server and tests):

| match | reading |
|---|---|
| `nextReconnectDelay` → `Math.min(...)` | real thin helper |
| `computeAcceptKey` → `crypto.createHash(...).digest(...)` | real one-liner |
| `generateToken` → `crypto.randomBytes(...).toString(...)` | real one-liner |
| `startServer` → `spawn(...)` | test helper wrapper |
| `isBootstrapSkillPath` → `String(...).includes(...)` | real thin predicate |
| `readPackageJson` → `JSON.parse(await readFile(...))` | real thin wrapper |
| `firstServerStarted` → `JSON.parse(...find...)` | test helper |

These are what the signal claims to find: functions whose body is a single
call. Many are conventional (crypto, test spawn). They are not parse accidents
like `config-for-constant` on JSON. **Keep** — rate is low enough to act on,
and the detector is matching the pattern. Duplicate plugin versions (6.2 / 6.3)
inflate the absolute count slightly.

### Stopping condition (Phase 7)

Overall real-code fire rate is under 10% with seven survivors that still hit
hand-written positives and stay silent on the 40 labeled negatives. The
write-time deterministic-signal approach is **usable** on this evidence.

The open question moves back to Phase 5: whether an advisory hook message
changes what the agent builds. That is a product question, not a signal one.

Re-run: `node bench/realcode.mjs` and `node bench/fp.mjs`.

## Review findings (Phase 7)

### Language coverage is now a cliff, and it is invisible to the user

File-extension gating is the right fix — ungated, the JS-shaped checks were 65%
noise on `.py` and 100% on `.json`. But it introduced a capability boundary
nothing surfaces.

Measured: a Python file containing a one-implementor `ABC` **and** a single-call
wrapper — textbook cases of two surviving signals — produces **no challenge at
all**. The identical structure as `.ts` fires normally.

| | covered | not covered |
|---|---|---|
| extensions | `.js .mjs .cjs .ts` (+ manifests) | `.jsx .tsx .py .go .rs .rb .php .java .kt .swift .sh .sql .css .html` |

What still works outside JS/TS: session activation, mode switching, the
statusline, and **the per-turn reminder** (language-agnostic, verified firing on
a Python prompt). What does not: the write-time challenge — the thing that
distinguishes Offcut from a rule file.

This is the same shape as the Grok Tier 1 error and the `offcut:full` badge:
**the mode reports healthy while its core feature is inert.** The gating stays;
the silence must be documented, and `doctor` (Phase 8) should report which
languages the current signal set covers.

### `single-call-wrapper`: right pattern, wrong conclusion

The hand sample is honest and the matches are real single-call wrappers — not
parse accidents. But the sample itself notes many are conventional:
`generateToken` → `crypto.randomBytes(...).toString(...)`, `computeAcceptKey` →
`crypto.createHash(...).digest(...)`.

Those are good code. The signal identifies the **pattern** correctly while the
pattern is not a **defect**. That is a different failure mode from
`config-for-constant` — a true positive that is not a finding — and it will not
show up as a parse bug.

Keeping it at 3.1% is defensible. Watch it: if users report it as noise, the
fix is deletion, not tuning, because there is no text-level way to tell a thin
helper worth having from one worth inlining.

### Corpus hygiene

`defaultProjectInputs` treated `temp_git_*/.git` as projects, feeding 48 git
internal files into the denominator (2.8%). `walkDir` skips `.git` as a child
but not as a scan root. Fixed; the rate moves 4.3% → 4.4%, which is the honest
number.

## Phase 7.5 — single-call-wrapper deleted (2026-08-25)

Paid re-benchmark (`bench/RESULTS.md`): on invite task `id-hex`, the accepted
lean solution is `return randomBytes(16).toString("hex")`. `single-call-wrapper`
appeared in the final diff on **9/9** passed runs and hooks challenged it on
**4/4** full-arm runs that fired. The flagged pattern **survived** (agent kept
the wrapper).

That matches the earlier hand sample: the detector matches the shape correctly;
the shape is conventional, not over-engineering. **Deleted.** No tune — there
is no text-level way to keep useful thin helpers while rejecting dead ones.
