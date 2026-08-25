# Phase 5 — Prove it changes behavior

Task specification for the implementing agent. Read this, `HOSTS.md`, and
`offcut-implementation-plan.md` §13 Phase 5 before writing code.

---

## The situation

Phases 1–4 are merged. The mode activates, persists, reminds every turn,
challenges before writes, and ships three commands. 97 tests pass. Two hosts are
verified with challenges observed in real transcripts.

**Nobody has shown that any of it makes the output better.** Every claim so far
is about mechanism — the hook fired, the context was delivered, the signal
matched. That is not the same as the code being smaller, simpler, or more
correct.

This phase answers one question: **does Offcut change what the agent builds?**

A "no" is a legitimate, publishable result. If the mode does not change
behavior, the honest move is to say so — not to add fixtures until a number
moves. Design the experiment so it can actually fail.

## Scope

```
bench/tasks/            task fixtures — starting repo + prompt + acceptance check
bench/run.mjs           runs one task under one arm, captures diff + transcript
bench/score.mjs         computes metrics from a completed run
bench/RESULTS.md        every run, including those that did not favor Offcut
```

**Do NOT build:** a scoreboard command, a README benchmark badge, new signals,
new hosts, or a CI job that runs paid model calls. Do not touch `hooks/`,
`skills/`, or `scripts/scan.mjs` — if the benchmark needs a product change,
that is a finding to report, not a change to slip in.

---

## The experiment

**Smallest thing that could change your mind.** Not a comprehensive benchmark:

- **one** task family, 3–5 tasks
- **two** arms: mode `off` and mode `full`
- **five** runs per task per arm
- **one** host (Claude Code — it has the most verified delivery)
- one model, **exact model ID recorded**, never a marketing alias

If that shows nothing, more fixtures will not rescue it. If it shows something,
expand deliberately in a later phase.

### Task family

Pick tasks where over-engineering is the *natural* failure, not an exotic one.
The canonical shape is a small feature request with an obvious elaborate
solution and a boring correct one — a config loader with ordered fallback, a
retry wrapper, a caching layer, a validation rule used by several callers.

Each task needs a **programmatic acceptance check** — a test that passes only if
the feature actually works. Without it you cannot tell a lean solution from a
broken one, and that distinction is the entire point.

---

## The metric trap, and how to not fall in it

**A smaller diff that fails the task is not a win.** The metric set must make
that impossible to report as one.

Report per run, always together:

| | |
|---|---|
| **Task passed** | acceptance check green — **gating** |
| Files created | |
| Dependencies added | |
| Exported symbols with no caller | |
| Abstraction layers introduced | interfaces, factories, wrappers |
| Config keys added | |
| Lines added / removed | |

**Rule: a run that fails the acceptance check is excluded from the size
comparison and reported separately as a failure.** Never average a broken run's
small diff into the result. If Offcut makes runs smaller *and* more likely to
fail, that is the headline finding, not a footnote.

Report medians and the full distribution, not means and not best runs. With
five runs, show all five.

---

## What will corrupt the result if you let it

### State bleed between runs

`~/.offcut/` holds `active`, `default`, `fired-<session>`, `turn-<session>`. The
once-per-signal-per-session rule means a stale `fired-*` file **suppresses
challenges in the next run**, silently weakening the Offcut arm.

Every run must start from a clean state dir. Set `OFFCUT_STATE_DIR` to a
per-run temporary directory — never touch the real one. Assert it is empty at
run start.

(Related observation, not this phase's job: after one day of development the
real state dir held 46 files. The `offcut:` marker in `state.js` names pruning
as the upgrade path. Log it as a finding; do not fix it here.)

### Repository bleed

Each run starts from an identical, pristine copy of the task repo. A git clone
or a copied directory per run — never a reused working tree, never `git
checkout` between runs.

### Prompt bleed

Both arms get the **byte-identical** prompt. The Offcut arm must not be told it
is being measured, must not be told to be concise, and must not have the
challenge text restated in the prompt. If the prompt mentions simplicity, you
are measuring the prompt.

### Scoring bias

The thing that scores a run must not know which arm produced it. Have `run.mjs`
write results to opaque directories and `score.mjs` compute metrics from the
diff alone. Any judgment that cannot be computed from the diff should be
recorded as a separate, clearly-labeled subjective column — not folded into the
numbers.

### Order effects

Interleave arms rather than running all of arm A then all of arm B. Model
behavior and service conditions drift over hours.

---

## Honesty requirements

These are not optional and they are the reason anyone would believe the result.

- **Publish every run**, including the ones that did not favor Offcut. A results
  file with only good runs is marketing.
- Record host version, exact model ID, date, and prompt for every run.
- If a run errored, crashed, or was retried, say so and say why.
- If the sample is too small to distinguish from noise, **say that** rather than
  reporting a direction. Five runs per cell is enough to notice a large effect
  and not enough to claim a small one.
- The README may claim nothing this phase did not measure. If the result is
  "no detectable effect," the README says that.

---

## Definition of done

- [ ] 3–5 tasks, each with a programmatic acceptance check that can fail
- [ ] Two arms × five runs per task, interleaved, one host, exact model ID
      recorded
- [ ] Per-run clean state dir and pristine repo copy, asserted not assumed
- [ ] Identical prompts across arms, verified byte-for-byte in the results
- [ ] Scoring computed from the diff, blind to arm
- [ ] `bench/RESULTS.md` has every run, medians, and full distributions
- [ ] Failed runs reported separately, never averaged into size metrics
- [ ] An explicit written conclusion, including "no detectable effect" if that
      is what the data shows
- [ ] All 97 existing tests still pass
- [ ] No changes to `hooks/`, `skills/`, or `scripts/scan.mjs`

---

## Working agreement

- Branch: `phase-5-bench`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Model calls cost money. Get the harness correct on a dry-run stub before
  spending on real runs.
- This project has been wrong four times by trusting something over
  measurement — a field name, a value, a host tier, and a scan that reported
  clean without scanning. The benchmark is where that failure mode is most
  expensive, because a wrong number is more convincing than a wrong doc.
- Open a PR against `main` with the conclusion stated plainly in the
  description, whichever way it went.
