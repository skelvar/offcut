# RightSeam — Implementation Plan

**Project name:** RightSeam
**Skill identifier:** `right-seam`
**Tagline:** *The smallest coherent system, not the shortest local diff.*
**Plan version:** 2.0 — revised August 24, 2026
**Research cutoff:** August 23, 2026 · **Claims re-verified:** August 24, 2026
**Status:** Implementation-ready

---

## 0. What changed in v2.0

Version 1.0 defined RightSeam in relation to another skill — what it added, what
it deferred, where it differed. That framing is gone. RightSeam is defined by
the problem it solves, not by its position relative to anything else.

**RightSeam is a self-contained skill.** It carries its own minimality
discipline *and* its own boundary-selection discipline. It does not require,
depend on, or defer to any other skill. If a minimality skill happens to be
active too, RightSeam composes with it — but it must be complete alone.

Two further changes follow from re-verifying v1.0's claims against primary
sources (§3):

1. **Scope cut.** v1.0 specified roughly forty files for v0.1. This plan ships
   eight. The removed scaffolding is parked in §20, not deleted, and returns
   only when an evaluation demonstrates the need.
2. **Originality constraint made explicit.** See §2.

---

## 1. Executive decision

Build **RightSeam** as a standalone, open-source Agent Skill with one governing
rule:

> Choose the smallest **complete** implementation, and put it at the boundary
> that owns the responsibility. Eliminate incomplete and unsafe candidates
> first. Among candidates that are otherwise equivalent, prefer the smaller one.

RightSeam does two things usually treated as opposites, in a fixed order:

1. **Place it correctly.** Find the boundary where the requirement can actually
   be guaranteed, where every affected caller already passes, and where the next
   change to the same rule will naturally land.
2. **Then build it small.** Inside that boundary, prefer what already exists
   over what must be written, and write the least that satisfies the
   requirement.

The order is the product. Minimizing first yields locally tiny diffs that
scatter one rule across many files. Placing first, then minimizing, yields a
change that is small *and* has one owner.

So RightSeam may correctly choose a twelve-line change at a shared service over
six one-line patches at its callers — because the former creates one maintained
rule, one regression point, and one stable contract — while still insisting
that twelve lines is as small as that owner-level change should be.

---

## 2. Originality constraint

RightSeam is an original work. It is not a fork, rename, re-skin, or derivative
of any existing skill.

**Not permitted:**

- copying instruction text, phrasing, persona, or structure from another
  skill's `SKILL.md`, rules files, or documentation;
- copying source code from another skill's repository;
- reproducing another project's benchmark numbers, marketing claims, or example
  set;
- adopting another project's distinctive vocabulary — persona framing, named
  intensity modes, signature slogans — even in paraphrase.

**Permitted, and expected:**

- conforming to published specifications and JSON Schemas; implementing a
  documented manifest format is not copying;
- citing public issues, pull requests, and documentation as prior art, with
  attribution;
- independently reaching similar conclusions where the domain forces them,
  expressed in RightSeam's own words;
- comparing against other skills in benchmarks, provided the comparison is
  honest and the other skill's text is not vendored.

Where this plan describes behavior resembling an existing skill's, the
implementation must derive it from the requirement, not transcribe it from the
other project. Any contribution that vendors third-party instruction text is
rejected regardless of the source license.

---

## 3. Verification record

Every external claim in plan v1.0 was checked against a primary source on
August 24, 2026.

| Claim under test | Result |
|---|---|
| Agent Skills spec defines `name`, `description`, `license`, `compatibility`, `metadata` | **Confirmed.** All five standard; `allowed-tools` also exists (experimental) |
| `description` limit is 1024 characters | **Confirmed.** Draft measures 420 — passes |
| `compatibility` limit is 500 characters | **Confirmed.** Draft measures 119 — passes |
| SKILL.md budget is 500 lines / ~5000 tokens | **Confirmed.** A recommendation, not a hard limit |
| `name` must be kebab-case and match its directory | **Confirmed.** `right-seam` is valid |
| Agent Plugins 1.0 manifest shape | **Confirmed.** `$schema` and `name` required; manifest at plugin root; `skills/` auto-discovered |
| `skills/` discovery scans immediate children only | **Confirmed.** `skills/right-seam/SKILL.md` is correctly placed |
| Self-rooted marketplace using `"source": "./"` | **Confirmed in production.** v1.0 listed this as an open risk; resolved |
| An official validator exists | **Confirmed.** `skills-ref` v0.1.5, from the `agentskills/agentskills` reference repo (~24.6k stars) |
| The name `right-seam` is unclaimed | **Confirmed.** No npm package under either spelling; no substantive repo collision |
| Agent Plugins 1.0 has named production adopters | **Not confirmed.** The spec defines the contract but names no implementations. See §5.4 |

Two v1.0 assumptions did **not** survive:

- **The host matrix was over-claimed.** v1.0 asserted specific behavior for ten
  hosts. The portable-plugin spec names no adopters, so every row is an
  unverified claim needing a manual test. §11 reduces this to a supported tier
  and a best-effort tier.
- **The reference-file architecture was unjustified.** v1.0 mandated five
  `references/` files, yet its own draft `SKILL.md` was 114 lines and
  self-contained — nothing needed offloading. §12 ships one file.

Re-verify this table before release. Several of these sources are less than a
year old and the tooling moves quickly.

---

## 4. Why the name "RightSeam"

A **seam** is a boundary where behavior can be introduced, observed, replaced,
or tested without spreading the concern through the system. The "right seam" is
the layer that actually owns the responsibility.

- Authorization belongs at an enforceable boundary, not in every UI caller.
- Retry policy belongs around the operation that owns retries.
- Configuration fallback belongs in the loader, not at each call site.
- A formatting rule may belong in the UI adapter while the underlying
  calculation belongs in the domain layer.
- Two validators with identical current shape may belong to different seams,
  because they protect different contracts.

**Brand:** RightSeam · **Repository:** `rightseam` · **Skill name and
directory:** `right-seam`

The exact-name search in §3 found no conflicting tool or package. The phrase
"the right seam" appears descriptively in software writing, which supports the
metaphor. This is not trademark clearance.

---

## 5. The problem and its boundaries

### 5.1 The problem

Agents optimizing for the shortest diff reliably produce this failure:

```text
Locally small:
  add one special-case guard to each of six callers

Systemically smaller:
  enforce the rule once at the boundary all six already call
```

The first wins on per-file line count while losing on duplicated policy, places
that must change together, caller knowledge, behavior drift, unprotected
sibling callers, test duplication, and clear ownership.

The distinction RightSeam is built on: **reducing** complexity is not
**containing** it. A change can cut total line count while increasing the number
of places a maintainer must understand — and that trade is usually invisible at
review time, because each individual file looks smaller.

The clearest instance is a configuration loader with ordered per-key fallback.
Optimizing each call site for brevity produces local fallback chains and
behavior-bearing wrappers; the system needed one interface with a visible lookup
order. Every caller should be able to read one contract. Instead, each learns
part of the policy.

This plan does not treat that as proven. §19 Phase 2 exists to collect real
cases before the protocol is trusted.

### 5.2 What RightSeam is not

RightSeam does not depend on, extend, or defer to any other skill. Version 0.1
must also not become:

- a general architecture consultant that redesigns repositories,
- an automatic "centralize everything" or DRY enforcer,
- a replacement for root-cause debugging,
- a generic code reviewer or security reviewer,
- an always-on persona spending context on every task,
- a dependency manager, MCP server, dashboard, or memory system,
- a numeric "architecture score",
- a set of named intensity modes.

### 5.3 What RightSeam leads with

**Ownership.** "Prefer the complete solution over the short one" is a reasonable
principle that plenty of tools and reviewers already advocate; it is not a
product. Choosing *which boundary owns the responsibility* — and refusing to
centralize things that merely look alike — is the part that is specific,
testable, and hard to get right.

So the description, README, and evaluation corpus lead with owner selection.
Completeness stays a gate in the protocol because it is genuinely required, but
it is not the headline claim.

### 5.4 Distribution reality

The Agent Plugins specification is real and RightSeam conforms to it, but the
spec names no production adopters. Treat portable-plugin distribution as a bet,
not a channel. The Agent Skills directory convention is the reliable path and
must work standalone.

---

## 6. Product contract

### 6.1 The job

RightSeam helps an agent:

1. Recover the requested outcome and the invariants constraining it.
2. Determine whether the requested thing needs to be built at all.
3. Trace the real end-to-end flow.
4. Identify the current or natural owner of the responsibility.
5. Recognize when multiple implementation locations are genuinely viable.
6. Eliminate candidates that are incomplete, unsafe, incompatible, or based on
   invented requirements.
7. Compare survivors by whole-system reasoning burden.
8. Choose one coherent solution and one owner.
9. Build the least code that satisfies the requirement at that owner.
10. Verify the owner, affected callers, behavior, and public contract.
11. Report the decision and remaining uncertainty without claiming more than the
    checks established.

Steps 1–8 are the boundary discipline. Step 9 is the minimality discipline. Both
belong to RightSeam.

### 6.2 Activation

RightSeam should activate for prompts such as:

- "Should this validation live in the route, service, or repository?"
- "The one-line caller fix is smaller — would it create drift?"
- "Where should this shared fallback behavior live?"
- "Choose between these two implementation plans."
- "Fix the root problem without spreading guards through every caller."
- "This abstraction is longer, but does it contain real policy?"
- "We have frontend and backend copies of the same business decision."
- "Which layer should own retries, caching, authorization, or state
  transitions?"
- "Is this over-engineered?" / "What can we delete here?"

It should **not** activate for trivial edits with one obvious location:
renames, typos, formatting, adding a field to a DTO, removing an unused import,
explaining a function, or non-coding requests.

### 6.3 Composition with other skills

RightSeam is complete alone. When another skill is also active:

- **A minimality skill.** RightSeam selects the owner; the other may minimize
  within it. RightSeam's placement decision takes precedence over line-count
  pressure when the smaller local option scatters policy or drops required
  behavior.
- **A single-source-of-truth skill.** Those target existing duplication.
  RightSeam selects candidates before duplication exists, and will *decline* to
  unify code whose shapes match but whose contracts differ.
- **A debugging skill.** Reproduce and isolate the cause first. Use RightSeam
  once the cause is known and several valid fix locations remain.

Composition is opportunistic. Nothing in `SKILL.md` may assume another skill is
present.

---

## 7. The decision protocol

Five stages, applied in order. A candidate failing an earlier stage cannot
compensate by scoring well later. This is a lexicographic ordering, not a
weighted score — do not collapse it into a number.

### Stage 1 — Frame

Establish what is required before considering any implementation.

- **Outcome.** Observable behavior, acceptance criteria, compatibility
  requirements, explicit constraints, and behavior that must not change.
- **Invariants.** Authorization, data integrity and recovery, money and
  idempotency, privacy and secrets, concurrency and ordering, public API
  compatibility, migrations and persistence, accessibility, and any stated or
  already-enforced performance requirement.
- **Necessity.** Build only what the request and its invariants require. A
  requirement that is predicted but cannot be pointed to is not a requirement,
  and does not justify a design.

Any candidate dropping a stated invariant is eliminated here.

### Stage 2 — Locate

Trace the actual flow from entry point to side effect. Do not propose a location
before knowing the current one.

- Where is this decision made today?
- Which module already owns adjacent policy?
- Do all affected callers pass through a single boundary?
- Does an existing helper, service, registry, domain function, database
  constraint, or platform capability already cover this?
- Is the apparently shared logic actually the same responsibility?

### Stage 3 — Choose the owner

**Generate candidates only when a real choice exists.** For a task with one
obvious correct location, skip to Stage 4 and implement. Do not manufacture
alternatives to justify deliberating.

A real candidate set:

```text
A. Enforce it in the shared service every caller already uses.
B. Guard it in each of the six callers.
C. Make it a database constraint.
```

Not this:

```text
A. The obvious two-line change.
B. Introduce an event bus.
C. Rewrite as microservices.
```

**Eliminate incomplete candidates.** Reject any that implements only the
reported symptom, leaves known sibling paths broken, contradicts an acceptance
criterion, removes required validation or recovery, needs a migration it does
not provide, changes public behavior accidentally, or depends on an API that
does not exist.

**Select the natural owner.** The correct boundary is where every relevant
caller already routes, where the invariant can actually be guaranteed, which
exposes one boring contract, whose side effects are explicit, which can be
tested directly, and where the next change to this same rule will land.

**Compare survivors** by reasoning burden, not size: how many places answer the
same question; how many concepts, contracts, and configuration keys a maintainer
must hold; how many files must be read to understand the behavior; whether
ordinary-looking access triggers I/O or policy; what each caller must know; how
many places change together; what must be verified or migrated; and what happens
to concurrency, resources, and failure recovery.

**Only if two candidates remain materially equivalent** does size decide — fewer
lines, fewer files, fewer dependencies.

### Stage 4 — Build

Inside the chosen boundary, write as little as possible. Prefer, in order:

1. Something already in this repository — a helper, type, or pattern present.
2. A guarantee the platform can enforce: a database constraint, a type, a
   built-in element, a filesystem or protocol behavior.
3. The language's standard library.
4. A dependency already installed.
5. New code — the least that satisfies the requirement.

Add a new dependency or abstraction only when nothing above covers the
requirement. Prefer plain data and explicit composition over wrappers that hide
behavior; explicit I/O over hidden I/O; one stable public contract over several
convenient ones; thin adapters that translate shape without deciding policy.

Do not create an abstraction because a central location sounds architectural.
Prefer an existing owner. Create a new one only when the responsibility is real
and has multiple consumers or a stable domain boundary.

### Stage 5 — Verify

- Search the affected callers again.
- Run the project's own tests, builds, and type checks.
- Add focused regression evidence at the owner.
- Confirm the previously duplicated path or literal no longer controls behavior.
- Inspect the final diff for unrelated changes.
- State any material behavior that remains unverified.

Scale verification to risk. Verification is evidence, not decoration to be
minimized. Never claim more certainty than the checks establish.

---

## 8. Ownership rules

- Policy belongs to the domain, service, authorization, routing, configuration,
  or persistence boundary that can enforce it.
- UI may adapt and format. It must not become a second owner of business rules.
- Adapters translate shapes; they do not decide shared policy.
- Database constraints own invariants that application-level prechecks cannot
  guarantee under concurrency.
- Identical shape is not identical responsibility. Different contracts or
  lifecycles may correctly stay separate; forcing them together moves domain
  policy into a generic utility.
- A five-line helper is not simpler if ten callers must understand the policy it
  hides. A twelve-line owner can be simpler than six one-line caller patches.
- Do not move domain policy into a general-purpose `utils` module.

---

## 9. Evidence and honesty

Search before asserting that a symbol, path, or rule has no other users. Include
tests, fixtures, configuration, scripts, exports, and string references. Treat
dynamic or reflection-based use as unresolved unless disproved — absence of text
matches does not prove absence of callers.

When the repository does not establish an owner, say so and state what evidence
would settle it. Reporting an unresolved ownership question is a correct
outcome; guessing confidently is not.

---

## 10. Output contract

When RightSeam materially affects the decision, close with:

```text
Decision: <chosen approach>
Owner: <module, boundary, or contract that owns the responsibility>
Why: <why this is systemically simpler than the strongest rejected candidate>
Verification: <searches, tests, builds, or checks actually completed>
Residual: <material uncertainty, or "none known">
```

For planning-only requests:

```text
Recommended seam: <owner>
Rejected alternative: <strongest alternative, and what it distributes or hides>
Implementation shape: <smallest complete change>
Verification plan: <evidence required before calling it done>
```

Do not manufacture a receipt for a trivial change. Complete the work normally.

---

## 11. Host support

v1.0 asserted behavior for ten hosts. Since the portable-plugin spec names no
adopters, support is now tiered by what is actually verified.

**Tier 1 — verified before release.** Install, explicit invocation, implicit
activation, and uninstall are manually tested and recorded with client version
and date.

| Host | Install path | Invocation |
|---|---|---|
| Claude Code | `.claude/skills/right-seam` or plugin install | `/right-seam` |
| Any Agent Skills client | client's skills directory | client-specific |

**Tier 2 — best effort, documented as untested.** The portable manifest and the
standard skill layout should make these work. Each is marked "untested" in the
README until someone verifies it and records the result.

Codex, Cursor, VS Code / Copilot, Gemini CLI, OpenCode, Kiro, Grok Build.

Rule: **no host is claimed as supported in the README until a dated manual test
exists.** An untested host is listed as untested. This is cheaper than v1.0's
ten-host acceptance gate and honest about what is known.

---

## 12. Repository structure

v0.1 ships eight files. Everything else is parked in §20.

```text
rightseam/
├── skills/
│   └── right-seam/
│       └── SKILL.md          # the entire skill
├── plugin.json               # Agent Plugins 1.0
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── evals/
│   └── triggers.jsonl        # positive + negative activation cases
├── README.md
├── LICENSE
└── .github/workflows/test.yml
```

### 12.1 One file, one source of truth

`skills/right-seam/SKILL.md` is the only copy of the instructions. There are no
per-host rule files — no `.cursor/rules/`, no `.clinerules/`, no
`copilot-instructions.md`, no `.kiro/steering/`.

This is a deliberate trade, and both sides are real:

- **Cost.** Those files are how some hosts activate a rule natively. Without
  them, RightSeam only exists where Agent Skills is supported.
- **Benefit.** Duplicated prompt bodies drift. A published project following the
  copy-per-host pattern maintains eleven copies behind a drift-checking script
  whose own source comments propose generating them instead — and a single
  wording change there required touching 41 files.

For a skill whose entire value is a decision protocol that must stay coherent,
one authoritative copy is worth losing some hosts. Revisit if a Tier 2 host
proves valuable and offers no skills path.

### 12.2 No `references/` in v0.1

The spec supports `references/` and progressive disclosure, and the guidance is
sound *for skills that legitimately need more than 500 lines*. The draft in §16
is ~150 lines and self-contained. Splitting it would add file hops without
removing context cost.

Add a reference file when — and only when — an evaluation shows the agent
consistently missing a stage that more detail would fix. Then add the one file
that fixes it, with an explicit load condition ("read `references/X.md` when
…"), never a generic "see references/ for details."

---

## 13. Manifests

Both manifests implement published schemas. Conforming to a schema is not
copying (§2).

Root `plugin.json`:

```json
{
  "$schema": "https://agent-plugins.org/schemas/1.0.0/plugin.schema.json",
  "name": "right-seam",
  "version": "0.1.0",
  "description": "Choose the smallest complete implementation and place it at the boundary that owns it.",
  "author": { "name": "xyzbk" },
  "homepage": "https://github.com/xyzbk/rightseam",
  "repository": "https://github.com/xyzbk/rightseam",
  "license": "MIT",
  "keywords": ["agent-skills", "software-architecture", "refactoring", "code-quality"]
}
```

`.claude-plugin/plugin.json`:

```json
{
  "name": "right-seam",
  "version": "0.1.0",
  "description": "Choose the smallest complete implementation and place it at the boundary that owns it.",
  "author": { "name": "xyzbk" }
}
```

`.claude-plugin/marketplace.json` — the self-rooted `"source": "./"` shape is
verified working in production (§3):

```json
{
  "name": "right-seam",
  "description": "Choose the correct owner for a complete, maintainable change.",
  "owner": { "name": "xyzbk" },
  "plugins": [
    {
      "name": "right-seam",
      "source": "./",
      "description": "Place the change at the boundary that owns it, then make it small."
    }
  ]
}
```

Both hosts auto-discover `skills/right-seam/SKILL.md`. Do not add non-standard
fields. Version numbers must match across all three files and the skill's
`metadata.version`; CI enforces this.

---

## 14. Trigger evaluation

The one evaluation v0.1 keeps, because it is free to run, gates the description,
and catches the failure mode that makes a skill actively harmful — firing on
trivial edits.

`evals/triggers.jsonl`, one object per line: `{"prompt": ..., "expect":
"activate" | "skip", "why": ...}`.

**At least 20 positive cases** across the §6.2 activation list, phrased as users
actually phrase them — not as the description phrases them.

**At least 20 negative cases**, of which at least six must be the hard kind:

- "These two validators look similar but have different product contracts."
- "Two test fixtures use the same string."
- "Add one field to this DTO."
- "Rename this variable."
- "Remove an unused import."
- "Summarize this README."

The first two matter most: they look like RightSeam's domain and must not
activate, because activating means recommending a merge that would be wrong.

**Release gates:** ≥85% recall on positives, ≥90% precision on negatives, zero
activations on the trivial-edit set, and zero centralize-by-appearance
recommendations on the coincidental-duplication set. These are release gates,
not scientific claims, and the README must describe them that way.

---

## 15. Worked examples

Held in the README, not in the skill, until an evaluation shows the skill needs
them inline.

**Choose the owner.** A normalization bug surfaces through four API routes, all
calling `UserService.create`. Normalize once in the service, because every
creation path routes through it, the contract owns normalized input, and
behavior can be established with one test. Four route guards would duplicate one
rule and leave future callers exposed.

**Do not centralize coincidental similarity.** `validateProductName` and
`validateChatMessage` both currently check 1–100 characters. Keep them separate:
they protect different contracts, will evolve independently, and a shared
`validateText` would move domain policy into a generic utility. The matching
shape is incidental.

**Prefer the database seam.** To prevent duplicate usernames, a pre-insert query
is shorter but cannot be correct under concurrency. The unique constraint owns
the invariant; the application handles the resulting error for user-facing
feedback.

**Do not reach for a central service.** One component needs a five-line
presentation transform. No other consumer shares it, no domain policy is
involved, it reads clearly. Keep it local — a service here would add a concept
without containing complexity.

**Placement does not excuse size.** Having correctly chosen the shared service,
implement the rule in the fewest lines that satisfy it. Stage 3 picks the
address; Stage 4 still applies.

---

## 16. Initial `SKILL.md` draft

Original text. Begin here, then refine against the trigger evaluation rather
than by adding prose until it sounds authoritative.

````markdown
---
name: right-seam
description: Chooses the smallest complete implementation and places it at the boundary that owns the responsibility. Use when several fix locations, layers, or designs are genuinely plausible - architecture choices, refactors, shared behavior, duplicated guards, policy placement, cross-layer changes, over-engineering review, or when the shortest local diff would push complexity into callers. Do not use for trivial edits with one obvious location, or for non-coding requests.
license: MIT
compatibility: Any software repository. Instruction-only - no network access, external runtime, or MCP server required.
metadata:
  author: xyzbk
  version: "0.1.0"
---

# RightSeam

Put the change at the boundary that owns the responsibility, then make it as
small as that boundary allows. Placement first, size second. That order is the
whole skill.

## Use this when

There is a genuine choice about where or how to implement something:

- one shared owner versus a patch in every caller,
- service versus route versus UI,
- domain policy versus adapter formatting,
- application check versus database constraint,
- local implementation versus reusable boundary,
- explicit composition versus an abstraction that hides behavior,
- two complete plans with different maintenance costs.

Skip this for trivial edits with one obvious location. Do not invent
alternatives in order to deliberate.

## 1. Frame

State the outcome: observable behavior, acceptance criteria, compatibility
requirements, and what must not change.

List the invariants in play: authorization, data integrity and recovery, money
and idempotency, privacy, concurrency and ordering, public API compatibility,
migrations, accessibility, stated performance requirements.

Build only what the request and its invariants require. A requirement you
predict but cannot point to is not a requirement and does not justify a design.

## 2. Locate

Trace the real flow from entry point to side effect before proposing a location.

- Where is this decided today?
- Which module already owns adjacent policy?
- Do all affected callers pass through one boundary?
- Does an existing helper, service, domain function, database constraint, or
  platform capability already cover this?
- Is the apparently shared logic actually the same responsibility?

## 3. Choose the owner

List candidates only when a real choice exists. One obvious location means skip
to step 4 and implement.

Eliminate any candidate that fixes only the reported symptom, leaves known
sibling paths broken, contradicts an acceptance criterion, drops required
validation or recovery, needs a migration it does not provide, changes public
behavior accidentally, or depends on an API that does not exist.

Among what survives, the owner is the boundary where every relevant caller
already routes, where the invariant can actually be guaranteed, which exposes
one boring contract, whose side effects are explicit, which can be tested
directly, and where the next change to this rule will land.

Compare survivors by reasoning burden, not line count: how many places answer
the same question, how many concepts and contracts a maintainer must hold, how
many files must be read, whether ordinary-looking access triggers I/O or policy,
what each caller must know, how many places change together, and what must be
verified or migrated.

Only when two candidates are materially equivalent above does the smaller one
win.

## 4. Build

Inside the chosen boundary, write as little as possible. Prefer in order:

1. something already in this repository,
2. a guarantee the platform can enforce - a database constraint, a type, a
   built-in element,
3. the standard library,
4. a dependency already installed,
5. new code, the least that satisfies the requirement.

Add a new dependency or abstraction only when nothing above covers it.

Prefer plain data and explicit composition over wrappers that hide behavior,
explicit I/O over hidden I/O, one stable contract over several convenient ones,
and thin adapters that translate shape without deciding policy.

Do not create an abstraction because a central location sounds architectural.
Prefer an existing owner. Create a new one only when the responsibility is real
and has multiple consumers or a stable domain boundary.

## Ownership rules

- Policy belongs to the domain, service, authorization, routing, configuration,
  or persistence boundary that can enforce it.
- UI may adapt and format. It must not become a second owner of business rules.
- Adapters translate shapes; they do not decide shared policy.
- Database constraints own invariants that application prechecks cannot
  guarantee under concurrency.
- Identical shape is not identical responsibility. Different contracts or
  lifecycles may correctly stay separate.
- A five-line helper is not simpler if ten callers must understand the policy it
  hides. A twelve-line owner can be simpler than six one-line caller patches.
- Do not move domain policy into a general-purpose utilities module.

## 5. Verify

Search the affected callers again. Run the project's own tests, builds, and type
checks. Add focused regression evidence at the owner. Confirm the old duplicated
path no longer controls behavior. Inspect the diff for unrelated changes.

Search before claiming a symbol or rule has no other users - include tests,
fixtures, configuration, scripts, exports, and string references. Absence of
text matches does not prove absence of callers; treat dynamic or reflection-based
use as unresolved unless disproved.

Scale verification to risk. Never claim more certainty than the checks
establish. If the repository does not establish an owner, say so and state what
evidence would settle it.

## Output

When this skill changed the decision, close with:

Decision: <chosen approach>
Owner: <boundary or contract>
Why: <why it is systemically simpler than the strongest rejected candidate>
Verification: <checks actually completed>
Residual: <material uncertainty, or none known>

Do not manufacture this for a trivial edit.
````

---

## 17. Tests and CI

Use the official validator rather than writing one. `skills-ref validate` covers
frontmatter validity, field limits, naming rules, and the directory-name match —
which was most of what v1.0's custom `validate.mjs` plus three test files were
going to do.

`.github/workflows/test.yml` runs on push and pull request:

```text
validate
├── npx skills-ref validate ./skills/right-seam
├── JSON parse + schema check on all three manifests
├── version match across manifests and metadata
├── SKILL.md under 500 lines
└── triggers.jsonl parses, every line has prompt/expect/why
```

One platform is enough for v0.1. The skill is a text file; there is no
platform-specific behavior to matrix over. Add platforms when a script exists to
break on them.

Do not run paid model evaluations on community pull requests. The trigger
evaluation runs manually before a release, and its results are committed.

---

## 18. Security and supply chain

v0.1 is instruction-only. It must:

- contain no binary files,
- make no network calls,
- install no dependencies,
- read no secrets,
- register no hooks and no MCP servers,
- request no pre-approved destructive tools,
- state exactly which files are included,
- tell users to inspect community plugins before installing.

Uninstall instructions must remove only files RightSeam created.

If §20 scripts are ever added: keep the source readable, provide `--help`, avoid
shell interpolation of untrusted values, never mutate a repository in a
read-only mode, publish checksums for release archives, and document every
generated file and cache location.

---

## 19. Implementation phases

### Phase 1 — Ship the skill

1. Scaffold the repository and MIT license.
2. Write `skills/right-seam/SKILL.md` from the §16 draft.
3. Write the trigger corpus — negatives first, so the description is written
   against them rather than to fit them.
4. Add the three manifests.
5. Add the CI workflow.
6. Write the README: what it does, how to install, worked examples, tested-host
   table with dates, and the trigger-evaluation results.

**Acceptance:** `skills-ref validate` passes; SKILL.md is under 500 lines; the
skill installs and is invocable in both Tier 1 paths; trigger gates in §14 are
met; the skill declines to activate on the trivial-edit set; the skill does not
recommend merging coincidental duplicates; it reports uncertainty when the
repository cannot establish an owner.

### Phase 2 — Ground it in real cases

The evaluation guidance is explicit that skills should come from real expertise,
not from reasoning about a domain. This protocol is currently reasoned, not
observed. That is the weakest thing about it, and no amount of packaging fixes
it.

Collect at least four real cases where an agent placed a change at the wrong
boundary — from your own transcripts, your own repositories, or code review
history. For each, record the task, what the agent did, what it should have
done, and which stage of §7 would have caught it.

Then revise the skill against them. A stage no real case exercises is a
candidate for deletion.

**Acceptance:** ≥4 documented cases; every stage of the protocol is exercised by
at least one; any stage that is not is either cut or justified in writing.

### Phase 3 — Measure, if it still looks worth it

Only after Phases 1 and 2. Scope it to the smallest experiment that could change
your mind: one fixture family, two arms (with and without the skill), five runs
each, one host, recorded model ID.

If that shows nothing, the skill does not work and more fixtures will not fix
it. If it shows something, expand deliberately. Do not build the full
multi-host, multi-arm benchmark before knowing there is an effect to measure.

Publish raw results including the runs that did not favor the skill. Report
medians and distributions rather than best runs. Every README claim must be
bounded by what was actually measured.

---

## 20. Deferred scope

Parked deliberately, with the condition that brings each back:

| Deferred | Return when |
|---|---|
| `references/` files | An evaluation shows the agent consistently missing a stage that more detail would fix |
| `assets/` templates | The receipt format proves unreliable inline |
| `agents/openai.yaml` | Publishing to a host that reads it, and it has been tested |
| `scripts/evidence.mjs` | Benchmarks show ownership claims failing for lack of caller data |
| `scripts/link-local.mjs` | Manual symlinking becomes an actual friction point |
| Full agentic benchmark | Phase 3's minimal experiment shows a real effect |
| Ten-host verification | A Tier 2 host has users asking for it |
| Signed releases, marketplace listings | There are users to protect |

Nothing here is rejected. It is sequenced behind evidence that it is needed.

---

## 21. Definition of done for v0.1

- `skills-ref validate` passes on the skill.
- All three manifests parse and versions match.
- `SKILL.md` is the only copy of the instructions in the repository.
- The skill installs and is invocable in both Tier 1 paths, with dated results.
- Trigger evaluation meets the §14 gates, and results are committed.
- Negative cases confirm the skill does not activate on trivial edits and does
  not recommend merging coincidental duplicates.
- The README claims nothing that §3 or §14 does not support, and marks every
  untested host as untested.
- Security statement (§18) and uninstall instructions are complete.
- No third-party instruction text or code is vendored anywhere (§2).

Not required for v0.1: a benchmark, a multi-host matrix, any script, or any
reference file.

---

## 22. Sources

Specifications and guidance consulted, all re-verified August 24, 2026:

- Agent Skills — specification, best practices, evaluation guide
  (`agentskills.io`)
- `skills-ref` reference validator (`agentskills/agentskills`)
- Agent Plugins 1.0 — specification and manifest guide (`agent-plugins.org`)
- Claude Code — skills and plugin marketplace documentation
- Host documentation for the Tier 2 list, treated as unverified until manually
  tested

---

## 23. Final principle

> First preserve the requested outcome. Then find the owner. Then contain the
> necessary complexity there. Only then optimize the size.

That ordering is the product. Manifests, hosts, evaluations, and benchmarks
exist only to make it portable, measurable, and honest.
