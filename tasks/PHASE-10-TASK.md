# Phase 10 — Does justification beat minimisation?

Task specification for the implementing agent. Read this, `bench/PREMISE.md`,
`tasks/PHASE-0-PREMISE-TASK.md`, and `tasks/PHASE-5-TASK.md` (harness
discipline) before writing code.

---

## The hypothesis

Offcut currently asks:

> What is the cheapest thing that actually works — and where does it belong?

The proposal is that this is the wrong question, and the right one is:

> **Is this change justified? Is it needed? Is there a better solution?**
> — supported by facts, not assertion.

### Why the current framing is suspect

Two independent lines of evidence.

**Ours.** Phase 0 found the agent already writes minimal code on this class of
work, so cheapness advice has little to bite on. Phase 5's spec needed an
explicit guard that "a smaller diff that fails the task is not a win", because
the framing pushes one direction. And the single real over-building we ever
measured — unrequested `has()` / `delete()` in 2 of 3 `open-cache` runs — was
**cheap, correctly placed, and unasked-for**. Questions 4 and 5 pass it;
only justification catches it. The hand-rubric itself reached for "YAGNI",
not "expensive".

**External.** Self-critique research finds the *rationale* is the active
ingredient, not the instruction: a critic re-reading work alongside the first
model's stated reasoning improved F1 by 0.04–0.25
([arXiv 2601.09905](https://arxiv.org/html/2601.09905)). A closed-loop framework
codifies each accepted correction as a persistent behavioral rule
([arXiv 2607.13091](https://arxiv.org/html/2607.13091v1)).

**This is a hypothesis, not a finding.** It is better supported than the
framing it replaces. It has not been tested.

## Why this is testable now, when nothing before was

Phases 5 and 7.5 both failed to answer the product question for the same
reason: **no target.** Almost nothing occurred that a challenge could prevent.

Phase 0 changed that. Unrequested API surface appeared in **2 of 3**
`open-cache` runs — a real, repeating, measurable behavior with a known base
rate. For the first time an intervention can be aimed at something that
actually happens.

---

## Design

**Three arms.** Two would only show that *some* ruleset beats none. Three
isolates whether the reframe beats the framing it replaces.

| Arm | Ruleset |
|---|---|
| `off` | none — baseline behavior |
| `cheap` | current shipped ruleset (cheapest-thing framing) |
| `justify` | reframed ruleset (justification framing) |

**Two fixture tiers.**

*Tier A — positive control.* `open-cache` and any Phase 0 fixture where
unrequested surface appeared. These have a known base rate. If `justify` cannot
move a behavior occurring at 2/3, the hypothesis is dead and the phase is over
cheaply.

*Tier B — where over-building plausibly lives.* Phase 0's blind spot was that
every fixture was small and single-file. Real over-engineering plausibly needs
design freedom. Write 4–6 tasks that are:

- multi-file, or requiring a decision about where code goes
- genuinely ambiguous about structure, precise about behavior
- framed as a real ticket, with ambient future pressure but **no** explicit
  request for extensibility (Phase 0's rule — if the prompt asks for it,
  building it is correct and the experiment measures nothing)

Tier B is the more important half. Tier A tells you whether the intervention
works; Tier B tells you whether the problem exists at the scale people care
about.

**Reps: 5 per cell.** Enough to see a large effect, not enough to claim a small
one. Say so in the writeup.

**Cross-model if the effect appears.** Grok and Codex have separate quotas, and
"sonnet-5 responds to justification framing" is a much weaker claim than "coding
agents do". Do this only after a positive result on Claude — do not spend on
three models to find nothing three times.

## The reframed ruleset

Build it as a **variant**, not a replacement. `skills/offcut/SKILL.md` stays
shipped and unchanged until the data says otherwise.

Questions 2, 3, 5 survive unchanged — they ask about verifiable facts. Rewrite
1 and 4, and add the fact requirement:

| Current | Reframed |
|---|---|
| Does this need to exist? | **Is this change justified?** Name what breaks without it. If you cannot name it, do not build it. |
| What is the cheapest thing that works? | **Is there a better solution?** Name the alternative you rejected and why it lost. |
| — | **Support it with facts.** Cite the file, the caller, the requirement line. "This seems cleaner" is not a fact. |

Keep both rulesets the same length. A longer ruleset that wins has confounded
attention with framing.

## Measurement

**Primary outcome — does the unjustified behavior occur?**

| Metric | |
|---|---|
| unrequested public surface | methods, exports, options nobody asked for — the Phase 0 finding |
| unrequested structure | interface, class, factory, wrapper, config surface, layer |
| task passed | gating — a leaner broken solution is not a win |

**Secondary — did the agent actually justify?** Record whether the response
contains a stated rationale, and whether it cites something concrete. This tests
the mechanism, not just the outcome: if `justify` wins while producing no
rationales, the effect came from somewhere else and the explanation is wrong.

**Rubric committed before any paid run.** This is the Phase 0 standard and it is
why that result is trustworthy. Offcut's own signals are descriptive only and
must never decide whether something was over-built — a detector judging whether
its own framing works is circular twice over.

**Blind scoring.** `score.mjs` must not read the arm.

---

## Definition of done

- [ ] Rubric committed before any paid run
- [ ] Reframed ruleset built as a variant; shipped `SKILL.md` untouched
- [ ] Both rulesets within ~10% of each other in length, stated
- [ ] Tier A: 3 arms × 5 reps on fixtures with a known base rate
- [ ] Tier B: 4–6 multi-file/ambiguous fixtures, 3 arms × 5 reps
- [ ] Unrequested surface **and** unrequested structure recorded per run
- [ ] Rationale presence recorded per run
- [ ] Hand-judged against the rubric; Offcut's signals descriptive only
- [ ] `bench/JUSTIFY.md` — every run, medians, distributions, plain conclusion
- [ ] A written answer to: **does justification framing change what the agent
      builds, more than cheapness framing does?** — including "no"
- [ ] All 164 tests pass

---

## What each outcome means

**`justify` beats `cheap` on Tier A.** The reframe works on a known target.
Ship it as the default ruleset and run Tier B properly.

**Neither beats `off`.** Rulesets do not change this behavior at all, which is
the strongest version of Phase 0's finding and should be published as such.

**`cheap` beats `justify`.** The current framing is right and the hypothesis was
wrong. Say so; the reframe was well-argued and still lost.

**Tier B produces over-building where Tier A did not.** Then Phase 0's null was
a fixture-scale artifact, and the premise holds at real task sizes. That is the
most consequential result available here, and it reopens everything.

---

## Working agreement

- Branch: `phase-10-justify`, off current `main`. Do not merge it yourself.
- Use an isolated worktree, as Phase 9 did.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages.** Author is the repo owner alone.
- Validate the whole grid on `--stub-matrix` before spending.
- Resources are not the binding constraint on this phase; **rigor is**. The
  failure mode is not spending too much, it is producing a number that does not
  mean what it appears to. That has happened twice: a null result from a broken
  detector, and a 4/5 survival rate resting entirely on a signal deleted in the
  same PR.
- Open a PR against `main` stating the answer in the first paragraph.
