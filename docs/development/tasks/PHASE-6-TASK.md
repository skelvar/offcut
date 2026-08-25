# Phase 6 — Signal quality

Task specification for the implementing agent. Read this and `bench/RESULTS.md`
(especially "Every challenge issued was a false positive") before writing code.

---

## The situation

Phases 1–5 are merged. The mechanism is verified: hooks fire, state is written,
context is delivered to the model on two hosts. 101 tests pass.

Phase 5 ran 40 paid runs and found no change in output. The reason was not that
the challenge failed to persuade. **Every challenge it issued was wrong.**

30 signals fired across 20 `full` runs. Checked against the prompts and diffs,
none identified real over-engineering:

| signal | fires | why it was wrong |
|---|---:|---|
| `post:exported-unused` | **20/20 runs** | flagged exports that were imported *in the same diff* |
| `speculative-abstraction` | 5/5 ttl-cache | flagged the factory **the prompt explicitly specified** |
| `new-file` | 5/5 shared-validate | flagged the shared module **the prompt asked for** |

The output did not change because the agent was **correct** to ignore the
advice. A tool that challenges correct code is worse than one that stays quiet:
it trains the reader to dismiss it, and then it cannot help when it is right.

**This phase fixes the signals or deletes them. Nothing else.**

## Diagnosis — why each one fires unconditionally

Read the implementations before changing them; the bug in each is small and
specific.

**`exportedUnused`** — it searches `view.corpus` when present, otherwise the
single file being written. In the **write** context (where the hooks actually
run) `corpus` is null, so "no caller" means "no caller *inside this one file*".
That is true of essentially every module's public API. The code comment already
anticipates this ("would fire on almost every export") but the corpus is only
supplied for `diff` and `repo`.

**`speculativeAbstraction`** — it treats any identifier matching `create[A-Z]\w*`
or `\w*Factory` as a factory, then fires when it cannot find an `implements`/
`extends` pairing. `createCache` matches on name alone. This is a naming
convention detector, not an abstraction detector.

**`new-file`** — the check is `view.pathExists === false`. It fires on every new
file, unconditionally. It is not a heuristic; it is a constant.

A signal that fires on nearly every input carries no information regardless of
how it is worded.

---

## You already have a free corpus — use it

`bench/runs/` holds 40 runs with diffs, prompts, and per-run metrics, committed
to the repo. Every task was completed correctly and passed its acceptance check.

**Therefore any signal firing on that corpus is a false positive, by
construction.** That is 40 labeled negative examples, runnable in milliseconds,
with zero model cost.

Build `bench/fp.mjs` (or extend `scan.mjs`) to replay the signal set over those
diffs and report the false-positive rate per signal. Run it on every change.

### You must also build a positive corpus

Without true positives, deleting every signal scores a perfect 0% false-positive
rate. That is the degenerate solution and the metric must make it visible.

Add `bench/corpus/positive/` — small, hand-written examples of the
over-engineering Offcut claims to catch: an interface with one implementation
and no second caller in sight, a genuinely dead export, a config key read
nowhere, a wrapper around a single call, a dependency added for four lines of
work.

Write them from the failure the signal is *supposed* to catch, not from the
regex you are about to write. If you cannot construct a convincing positive
example for a signal, that is strong evidence the signal should be deleted.

**Report both numbers together, always.** A signal is only useful if it fires on
the positive corpus and stays silent on the negative one.

---

## Deleting a signal is a correct outcome

This is not a failure mode, it is the expected result for at least one of them.

`new-file` in particular has no defensible form: "you created a file" is not
evidence of anything, and the prompt often asks for the file. Unless someone can
state a version that stays silent on `shared-validate`, delete it.

Prefer deleting a signal over weakening it into vagueness. Three signals that
are right are worth more than nine that are ignored.

---

## Scope

```
hooks/signals.js         fix or delete; adjust the view so checks get what they need
bench/fp.mjs             replay signals over the negative corpus, report rates
bench/corpus/positive/   hand-written true positives, one dir per signal
bench/SIGNALS.md         per-signal: fires-on-positive, fires-on-negative, verdict
tests/phase6.test.js
```

**Do NOT build:** resilience fixes (that is Phase 7), new hosts, intervention
experiments, or any paid benchmark run. Do not tune the message wording — a
better-phrased wrong answer is still wrong.

If a signal needs information the write context cannot provide — repo-wide
usage, for instance — say so plainly rather than approximating it. "This is not
decidable at write time" is a legitimate and valuable finding.

---

## Definition of done

- [ ] False-positive rate measured per signal against the 40-run corpus, before
      and after, recorded in `bench/SIGNALS.md`
- [ ] A positive corpus exists per surviving signal, and each surviving signal
      fires on it
- [ ] `post:exported-unused` either sees the whole change or is deleted — it may
      not ship at a 20/20 fire rate
- [ ] `speculative-abstraction` no longer fires on name shape alone
- [ ] `new-file` fixed or deleted, with the reasoning written down
- [ ] Every surviving signal has both numbers published; none is kept on
      intuition
- [ ] All 101 existing tests pass
- [ ] Every fix has a regression test that fails against the unfixed code

---

## The stopping condition

State it in the PR, honestly:

**If the false-positive rate does not drop sharply while at least some signals
still fire on real over-engineering, the write-time deterministic-signal
approach has a ceiling and the project should stop building.**

Every signal in the set is a text-level pattern match against one file at one
moment. It is entirely possible that "public API" versus "dead export", or
"requested structure" versus "invented structure", is not decidable from that
vantage point. If that is what the numbers show, say it.

That would not be a wasted project. The probe caught three vendor
documentations being wrong on the wire, the benchmark has blind scoring and
published evidence, and the negative result is real and reproducible. Most tools
in this space ship confident claims with none of that.

---

## Working agreement

- Branch: `phase-6-signal-quality`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Measure first, change second. The corpus is free and instant; there is no
  excuse for changing a signal without a before number.
- This project has been wrong six times by reading the absence of a negative
  signal as success — a field name, a value, a host tier, a scan that reported
  clean without scanning, a badge that reports healthy without checking, and a
  benchmark whose null result was actually a broken detector. Assume there is a
  seventh in here.
- Open a PR against `main` with the per-signal numbers in the description and a
  plain statement of whether the approach is working.
