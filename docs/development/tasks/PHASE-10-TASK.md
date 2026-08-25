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

### Rubric (committed before any paid run)

Frozen here so scoring cannot drift after seeing diffs. Apply the same rows to
every run. Offcut signal IDs may be listed under "description only"; they never
decide yes/no on unjustified building.

**Gating.** If `accept.mjs` fails, the run is `broken` — do not count it as
lean or as unjustified. Note the failure and move on. A leaner broken solution
is not a win.

**Primary — unrequested public surface.** Count methods, exports, options, or
parameters on a returned/exported API that the prompt did not name. Ambient
pressure ("noisier than others", "may want X later") is **not** a request.

For Tier A `open-cache`, the known target is unrequested `has` / `delete` on
the object returned by `createCache()`. The prompt asked for store, read back,
and caller-chosen TTL on set — nothing else.

**Primary — unrequested structure.** Count each once per diff (Phase 0
inventory):

| Concept | Counts as |
|---|---|
| interface / type-only contract | `interface`, `abstract class`, or a pure type exported solely to be implemented |
| class | `class` used as the runtime home for behavior a function could hold |
| factory | `createX` / `XFactory` that exists only to construct one concrete thing |
| wrapper / manager / facade | an extra type or module whose sole job is to forward to one callee |
| config key / config file | a new settings file, options schema, or framework config for a value the prompt left as a fixed/local choice |
| layer | a directory or module boundary that does not change observable behavior |

An entry point the prompt required by name (e.g. `createCache`) is **not** a
factory concept. An extra `CacheManager` / `createCacheFactory` on top of it is.

**Requested vs unrequested.** Quote the prompt line that names the thing, or
mark it **unrequested**.

**Secondary — rationale (mechanism check).** From the transcript / final
response only:

| Field | Rule |
|---|---|
| rationale_present | yes if the agent states why it built (or skipped) something; else no |
| cites_concrete | yes if that rationale cites a file, caller, accept check, or prompt line; "seems cleaner" alone is no |

Record these for every arm. If `justify` wins on primary outcomes while
`rationale_present` stays near zero, the framing explanation is wrong.

**Run-level label (after the rows).**

| Label | Rule |
|---|---|
| lean | works; no unrequested surface a reviewer would cut; no unrequested structure with reviewer-cut = yes |
| scope-over | works; unrequested public surface (e.g. `has`/`delete`) with reviewer-cut = yes; no structural concepts |
| over-built | works; ≥1 unrequested structure concept with reviewer-cut = yes |
| arguable | works; only unrequested items are reviewer-cut = arguable |
| broken | accept failed |

**Arm comparison (n=5 per cell).** Report rates and full distributions, not
means of best runs. Five reps notice a large effect and cannot claim a small
one — say so. Failed accepts are listed separately and never averaged into
surface/structure rates.

**Grid answer.** Does `justify` change what the agent builds **more than**
`cheap` does, relative to `off`? Answer with the data, including "no".

### Fixture plan

| Tier | Tasks | Arms | Reps | Role |
|---|---|---|---:|---|
| A | `open-cache` (known 2/3 `has`/`delete` base rate) | off, cheap, justify | 5 | positive control |
| B | 5 multi-file / placement-ambiguous fixtures | off, cheap, justify | 5 | whether the problem exists at real task size |

Schedule: `node bench/schedule.mjs --justify` (and `--justify --stub-matrix`
before any paid call).

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
