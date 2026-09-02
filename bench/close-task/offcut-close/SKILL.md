---
name: offcut-close
description: >
  Run a bounded evidence-first closure pass on the current change: define what
  done means, use a fresh evaluator to find reachable defects, repair only
  required in-scope findings, verify them externally, and return a closure
  receipt. Use when the user invokes /offcut-close or explicitly asks Offcut to
  close, finish, or converge a change through review and repair. Do not use for
  an ordinary review, repository-wide audit, open-ended improvement loop,
  persistent learning, or when the user asked for diagnosis without fixes.
license: MIT
compatibility: Requires repository read/edit/test tools. Touches no persistent Offcut mode or lesson state.
metadata:
  version: "0.3.0"
  author: skelvar
---

# Offcut Close

Close the requested change with evidence, then stop. This is a bounded command,
not a mode. Do not change Offcut mode or store persistent lessons.

## Budget

The run has one initial evaluation plus at most two repair-and-verification
cycles. A lower host limit wins. User stop, missing authority, an unavailable
required environment, or budget exhaustion ends as `INCOMPLETE`, not success.

## 1. Contract

From the user request, applicable repository instructions, and current change,
write at most five observable acceptance conditions. Each condition contains:

- **Behavior:** what must be true for the user.
- **Evidence:** the cheapest relevant command, test, or user flow that can prove
  it.

Do not invent requirements or widen scope. Prefer behavior and invariants over
implementation preferences. If essential information is missing, return
`INCOMPLETE: blocked` with the smallest missing fact.

## 2. Fresh evaluation

Default to one fresh evaluator for the run when the harness provides one. Give it applicable
repository instructions, the user request, acceptance contract, current diff,
relevant files, and execution tools. Do not give it the implementer's rationale,
self-assessment, or claims of correctness.

The evaluator owns the initial reproduction pass. Before it returns, the repair
agent may inspect the change but must not run a duplicate test or reproduction.
Ask the evaluator for the smallest set of commands that jointly proves the
contract and its findings.

The evaluator is read-only. For every evidence-backed finding it returns:

- `invariant`: exact required behavior that is broken
- `owner`: file and symbol where responsibility belongs
- `observed_failure`: reachable failure or current execution result
- `reproduction`: command, test, or user flow that can confirm it
- `action`: `required | needs-user | non-blocking | unsupported`
- `smallest_fix`: narrowest correct repair location

A review request is not evidence that a defect exists. Omit style preferences
and hypothetical risks without a reachable path. Do not praise the work or
manufacture a finding. Return `PASS` when no evidence-backed required finding
exists.

If a fresh evaluator is unavailable, perform a separate read-only pass and mark
`independent_evaluator: unavailable` in the receipt. Do not pretend it was
independent.

## 3. Run-local findings

Assign simple run-local labels `F1`, `F2`, ... after checking that each finding
has an owner, observed failure, and reproduction. Do not hash prose.

Reuse an ID only when the invariant, owner, and observable failure match. A
source edit moves an affected finding to `needs-revalidation`; only current
external evidence closes it.

## 4. Repair and verify

Repair only `required` findings that are already authorized and in scope:

1. Reuse the evaluator's current reproduction; do not rerun it before editing.
2. Make the smallest correct change at the stated owner.
3. Run one consolidated post-repair verification pass covering the acceptance
   contract, required findings, and affected regression path.
4. Record the observed result.

Do not start a broad review, fix `non-blocking` suggestions, redesign unrelated
code, weaken tests, or claim closure from reasoning alone. A finding that needs
new authority becomes `needs-user`.

## 5. Closure check

Close each finding directly from the consolidated external evidence. Do not
invoke a second evaluator when the repair stayed within reported owners, every
acceptance condition has current external evidence, and the verification found
no new failure.

A second evaluator is permitted only when the repair crossed an unreviewed
boundary, the evidence is ambiguous or contradictory, or post-repair
verification exposed a new failure. Give it the acceptance contract, current
change, current verification results, and open finding IDs—not the repair
agent's rationale. It checks only the unresolved uncertainty; it does not repeat
the full initial review.

Map to an existing ID only when invariant, owner, and observable failure match.
Otherwise create a new finding. `non-blocking` and `unsupported` findings never
block closure.

## 6. Stop and report

After each phase, apply this order:

1. User stopped → `INCOMPLETE: user-stopped`.
2. All acceptance conditions have current evidence and no required finding is
   open → `PASS`.
3. Missing authority/environment prevents proof → `INCOMPLETE: blocked`.
4. Two repair cycles consumed → `INCOMPLETE: budget`.
5. Otherwise continue.

Return this compact receipt:

```text
Offcut Close: PASS | INCOMPLETE
Scope: <change reviewed>
Acceptance: <proved>/<total>
Required findings: <count>
Closed: <ids or none>
Reopened/open: <ids or none>
Repair cycles: <used>/2
Independent evaluator: available | unavailable
Verification: <command/flow and observed outcome>
Blocker: <none or exact blocker>
Persistent lesson: not stored
```

Do not write, store, or promote persistent lessons. This prototype tests closure
discipline only.

## Calibration examples

- **Required:** Save remains enabled during an in-flight request, so two clicks
  create duplicate records. Reproduce with a delayed request; owner is the Save
  action state.
- **Unsupported:** “This function may be slow someday” without a measured path
  or violated requirement. Omit it.
- **PASS:** The requested behavior and affected regression path both have current
  execution evidence and no required finding remains. Stop; do not invent work.
