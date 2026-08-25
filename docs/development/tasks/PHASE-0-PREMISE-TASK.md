# Phase 0 — Does the problem occur?

Numbered **0** because it should have come first.

Task specification for the implementing agent. Read this and
`bench/RESULTS.md` before writing anything.

---

## The question

Offcut's plan opens with a premise:

> Offcut exists because agents over-build by default. They reach for a class
> when a function works, a config flag when a constant works, a dependency when
> four lines work.

**That was assumed, never measured.** Hooks, nine signals, two benchmarks and
120 paid runs were built on top of it.

The accumulated evidence points the other way. Across 80 runs in Phase 7.5, 6
fired any signal; 5 of those were a false positive since deleted. On
`one-impl-store` — a fixture written specifically to tempt an interface with one
implementation — the agent produced a `Map` and two methods.

Both benchmarks failed to measure whether a challenge changes behavior for the
same reason: **there was almost nothing to prevent.**

This phase asks the question underneath: **does an agent over-build when the
request leaves room for it?**

## Why the previous fixtures could not answer it

Every task in both benchmarks was precisely specified:

> Export `createStore()` that returns an object with: `set(key: string, value:
> string): void`, `get(key: string): string | undefined`

> must return a 32-character hexadecimal string drawn from
> `crypto.randomBytes(16)`

**A precise spec is a design.** There is nothing left to invent, so nothing to
over-invent. We tested the setting least likely to produce the behavior.

---

## Design

This is a **base-rate observation, not a treatment comparison.** You are asking
"does over-building occur", not "does Offcut prevent it". That means:

- **One arm.** No `off` vs `full`. Offcut's mode is irrelevant and should be
  `off` so nothing influences the output.
- **No size medians, no arm statistics.** The output is a count and a set of
  examples.

**Grid: 4 tasks x 3 reps = 12 runs.** That is enough to see whether the
behavior appears at all. It is not enough to quantify a rate, and the writeup
must not pretend otherwise.

Validate the whole grid on `--stub-matrix` first. That is free.

## Writing the prompts

Vague about **design**, checkable about **behavior**. The accept check still has
to prove the solution works, or a lean-but-broken result reads as a win.

Good shape — name the entry point, describe the outcome, say nothing about how:

> We need a way to cache expensive lookups in `cache.js`. Callers should be able
> to store a value and read it back, and entries shouldn't live forever. Export
> `createCache()`. Some of the services that will use this are noisier than
> others.

That last sentence is the realistic ambient pressure that triggers over-building
in practice — a hint of future variation, without a requirement.

**The line that matters:** hint at future need the way a real ticket does; do
**not** explicitly ask for extensibility. If the prompt says "make it
extensible", building an abstraction is *correct*, and the experiment measures
nothing. Speculative structure only counts as over-building when it was not
requested.

Cover the four things the surviving signals claim to detect:

1. something that invites an interface or one-implementation indirection
2. something that invites a dependency where a few lines would do
3. something that invites a configuration surface for a fixed value
4. something that invites layers — a wrapper, a manager, a factory

## Judging the output — the part that must not be circular

**Offcut's signals must not be the judge.** Using the detector to decide whether
the detector is needed assumes the conclusion. `bench/score.mjs` size metrics
are fine as description; they are not the verdict.

Write the rubric **before running anything**, and record it in the spec file.
For each solution, answer:

| | |
|---|---|
| Does it work? | acceptance check — gating |
| Concepts introduced | count interfaces, classes, factories, wrappers, managers, config keys, layers |
| Was any of it requested? | quote the prompt line, or mark **unrequested** |
| Would a competent reviewer cut it? | yes / no / arguable, with one line of reasoning |

The third row is the whole experiment. Structure the prompt asked for is not
over-building.

A human reads the twelve diffs. They are 10–40 lines each; this is twenty
minutes of work, and it is the only judgment in this project that cannot be
automated without circularity.

### Rubric (committed before any paid run)

Frozen here so scoring cannot drift after seeing diffs. Apply the same four
rows to every run. Offcut signal IDs may be listed under "description only";
they never decide yes/no on over-building.

**Gating.** If `accept.mjs` fails, the run is `broken` — do not count it as
lean or as over-building. Note the failure and move on.

**Concept inventory (count each once per diff).**

| Concept | Counts as |
|---|---|
| interface / type-only contract | `interface`, `abstract class`, or a pure type exported solely to be implemented |
| class | `class` used as the runtime home for behavior a function could hold |
| factory | `createX` / `XFactory` that exists only to construct one concrete thing |
| wrapper / manager / facade | an extra type or module whose sole job is to forward to one callee |
| config key / config file | a new settings file, options schema, or framework config for a value the prompt left as a fixed/local choice |
| layer | a directory or module boundary that does not change observable behavior |

`export function createStore()` itself is **not** a factory concept when the
prompt required that name. An extra `createStoreFactory` / `StoreManager` on
top of it is.

**Requested vs unrequested.**

1. Quote the prompt line that names the concept, **or**
2. Mark the concept **unrequested**.

Ambient pressure ("may want a different backing store later", "noisier than
others", "format may get richer") is **not** a request. Building for that
pressure is the behavior under test.

**Reviewer cut.**

| Verdict | When |
|---|---|
| yes | a competent reviewer would delete or inline it and keep behavior |
| no | it is the straightforward way to meet the accept check |
| arguable | reasonable people disagree; write one sentence |

**Run-level label (after the four rows).**

| Label | Rule |
|---|---|
| lean | works; no unrequested concepts a reviewer would cut |
| over-built | works; ≥1 unrequested concept with reviewer cut = yes |
| arguable | works; only unrequested concepts are reviewer-cut = arguable |
| broken | accept failed |

**Grid answer (n=12, not a rate).** Over-building **appears** if any run is
`over-built`. It **does not appear** if every accepted run is `lean` (or
`arguable` only — treat pure-arguable as absence of a clear positive, and say
so). Do not write a percentage.

### Fixture set for this phase

Four tasks, one invitation each. Prompts live under `bench/tasks/<id>/prompt.txt`.
Schedule: `node bench/schedule.mjs --premise` (arms=`off` only, reps=3).

| id | Invitation | Accept checks |
|---|---|---|
| `open-store` | interface / one-impl indirection | `createStore()` → set/get strings in memory |
| `open-slug` | dependency where a few lines would do | `slugify` lowercase hyphen ASCII slug + TypeError on non-string |
| `open-cache` | configuration surface for a lifetime | `createCache()` set/get with caller-chosen TTL; expiry works |
| `open-report` | wrapper / manager / factory layer | `report(message)` → exactly `[report] ${message}` |

## Optional second run — cross-model, separate quota

If over-building appears, run the same twelve prompts on Grok and Codex before
concluding anything. `run.mjs` hardcodes `spawnSync('claude', ...)`, so this
needs a small change to the runner.

Two reasons it is worth it: their quotas are unrelated to Claude's plan limits
(Phase 5 hit a 429 mid-grid), and it converts "`claude-sonnet-5` does not
over-build on small tasks" into a claim about coding agents generally. The
narrow claim is much weaker than the project needs.

---

## Definition of done

- [ ] 4 vague-prompt tasks with behavioral accept checks, validated on
      `--stub-matrix`
- [ ] Rubric written and committed **before** any paid run
- [ ] 12 single-arm runs, mode `off`, exact model ID recorded
- [ ] Every solution hand-judged against the rubric, with the unrequested/
      requested call made explicitly per concept
- [ ] `bench/PREMISE.md` records all twelve diffs, judgments, and a plain answer
- [ ] Offcut's own signals used **only** as description, never as the verdict
- [ ] No claim of a rate — n=12 shows presence or absence, not frequency
- [ ] All 125 existing tests still pass

---

## What each outcome means

**Over-building appears.** The premise holds, the detector finally has targets,
and the product question becomes answerable for the first time. Then spend on
the two-arm comparison — knowing there is something to measure, which is
precisely what both previous benchmarks did not know.

**It does not appear.** Then on this class of work, for this model, Offcut
solves a problem that does not occur. That is not a failure and it is not a
reason to keep building quietly. It is a finding, and it should be published as
plainly as a positive one — including in the README, which currently describes a
tool for a problem that would then be undemonstrated.

Either way, do not soften the answer to protect the work already done.

---

## Working agreement

- Branch: `phase-0-premise`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Twelve runs cost roughly $2 at the observed $0.17/run. Do not expand the grid
  before the twelve are read. The failure mode of both previous benchmarks was
  spending first and discovering the design flaw afterwards.
- This project has been wrong nine times by reading absence of a negative signal
  as success. The tenth would be reading "no signals fired" as "no
  over-building" — **the detector is not the judge here.**
- Open a PR against `main` with the answer in the first paragraph.
