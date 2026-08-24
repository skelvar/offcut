# Phase 7 — Signals against real code

Task specification for the implementing agent. Read this and `bench/SIGNALS.md`
(especially "Real-code corpus results") before writing code.

---

## The situation

Phase 6 fixed or deleted the signals that were producing false positives, and
scored every survivor **0/40** on the bench corpus. That number was real and it
was misleading.

The bench corpus is four tasks whose accepted solutions are 10–30 lines,
single-module, and comment-free. Two false positives were found *after* Phase 6
merged, by pointing the signals at real code:

- `speculative-abstraction` fired on Offcut's own `hooks/signals.js`, because
  the comment "an interface / abstract class with exactly one" parses as an
  abstract class named `with`. Fixed in review by stripping comments.
- `bench/realcode.mjs` then scanned **1655 files** of published third-party code
  and Offcut's own source: **51.1% of files produce a finding.**

A tool that flags half of all real files is not usable, whatever its message
says.

## What the measurement actually shows

The noise is not spread across the signal set. It is one signal.

| signal | rate on 1655 real files | verdict |
|---|---:|---|
| **config-for-constant** | **47.9%** (100% of `.json`) | broken |
| single-call-wrapper | 3.7% | borderline |
| speculative-abstraction | 0.6% | holds |
| new-config-surface | 0.5% | holds |
| new-dependency | 0.5% | holds |
| unused-default-param | 0.2% | holds |
| large-first-write | 0.0% | holds |
| exported-unused | 0.0% | **not measured** |

**This is good news and it should shape the work.** The structural signals
survived 1655 files of ordinary code. Do not redesign the approach. Fix one
signal, measure one that was never exercised, and check one borderline case.

## Scope

```
hooks/signals.js       fix/delete config-for-constant; add file-type applicability
scripts/scan.mjs       stop applying language-specific signals to every text file
bench/realcode.mjs     extend: build a per-project corpus so exported-unused is exercised
bench/SIGNALS.md       updated rates, before and after
tests/phase7.test.js
```

**Do NOT build:** resilience fixes (Phase 8), new signals, new hosts, paid
benchmark runs, or message rewording. A better-phrased wrong answer is still
wrong.

---

## The three jobs

### 1. `config-for-constant` — delete or restrict

It fires on every `.json` file, 65% of `.py`, 39% of `.sh`, and on markdown
whose example blocks contain `NODE_ENV=` or `PORT=`.

Two compounding faults: the scanner has no language awareness, and the check is
a syntax match (`ALLCAPS =`, `"key":`) that cannot distinguish a config file
from a file that mentions config.

**Deleting it is a legitimate and probably correct outcome.** Before trying to
save it, state what it would need to be right: knowing the value is never read
anywhere, in a language whose config conventions you can parse. If that is not
available at scan time, delete it — the same reasoning that retired `new-file`.

If you keep it, it must drop below **2%** on `bench/realcode.mjs` while still
firing on a positive example that is more convincing than the current one-line
`export const MAX_RETRIES = 3;`.

### 2. File-type applicability — a structural gap, not one signal's bug

Every signal is JS/TS-shaped. The scanner feeds it `.py`, `.json`, `.md`,
`.sh`, `.yaml`, `.txt`. That is why one bad check turned into 793 findings.

Give signals an explicit applicability — the same treatment `contexts` and
`shapes` already get. A signal that reasons about `export`/`interface`/
`function` should not run on JSON or Markdown at all.

This is cheap and it prevents the next version of this bug.

### 3. `exported-unused` was never actually exercised

`realcode.mjs` passes `corpus: null`, and after Phase 6 that signal is silent
without a corpus by design. **Its 0.0% means "not run", not "clean."**

Extend `realcode.mjs` to build a per-project corpus (concatenate each project's
own files, not all 1655 together — cross-project references are meaningless),
then report its real rate. It may turn out to be the second broken signal;
`SIGNALS.md` already records that it is scope-dependent by construction.

Also check `single-call-wrapper` at 3.7% — sample a dozen fires by hand and say
whether they are real. 3.7% is low enough to keep and high enough to doubt.

---

## Method

**Measure before changing.** `node bench/realcode.mjs` takes seconds and needs
no model calls. Record the before number for anything you touch.

Both corpora must pass, and they test different things:

- `node bench/fp.mjs` — 40 labeled negatives; any fire is definitively wrong
- `node bench/realcode.mjs` — 1655 unlabeled real files; the *rate* is the signal

Real code is unlabeled, so a single fire there is not proof of a bug. The rate
and its trend are what matter. Do not tune against individual findings.

---

## Definition of done

- [ ] `config-for-constant` deleted, or below 2% on the real-code corpus with a
      convincing positive example
- [ ] Overall files-with-findings rate below **10%** (from 51.1%)
- [ ] Signals declare file-type applicability; no JS-shaped signal runs on
      JSON or Markdown
- [ ] `realcode.mjs` builds per-project corpora; `exported-unused` has a real
      measured rate, not 0.0%-because-unexercised
- [ ] `single-call-wrapper`'s fires sampled by hand, verdict written down
- [ ] Every surviving signal still fires on its positive example
- [ ] `bench/fp.mjs` still 0/40 for every survivor
- [ ] All 112 existing tests pass
- [ ] Every fix has a regression test that fails against the unfixed code

---

## On the stopping condition

Phase 6 asked whether the write-time deterministic-signal approach has a
ceiling. The real-code corpus answers it, and the answer is **not yet**.

Seven of eight signals fire on 3.7% of real files or less, after a
comment-stripping fix. That is a working detector set with one broken member,
not a failed approach.

If this phase gets the overall rate under 10% with signals that still fire on
genuine over-engineering, the detector works and the open question moves back to
Phase 5's finding — whether an advisory hook message can change what the agent
builds. **That is the real remaining risk, and it is a product question, not a
signal one.**

If instead the rate stays high once `exported-unused` is properly measured and
file-type gating is in place, then the ceiling is real and the honest move is to
publish the negative result.

---

## Working agreement

- Branch: `phase-7-realcode`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Prefer deleting a signal over rescuing it. Two signals have now been retired
  on evidence; that is the process working, not a setback.
- This project has been wrong seven times by reading absence of a negative
  signal as success — most recently a 0/40 score that meant the corpus was too
  easy. Assume there is an eighth.
- Open a PR against `main` with before/after rates from both corpora and a plain
  statement of whether the detector is now usable.
