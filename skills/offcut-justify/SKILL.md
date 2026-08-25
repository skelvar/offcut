---
name: offcut-justify
description: >
  Experimental Offcut ruleset variant for Phase 10. Asks whether a change is
  justified, needed, and better than the alternatives — supported by facts.
  Not the shipped default. Do not use outside the justify bench arm.
license: MIT
compatibility: >
  Bench-only variant. Requires the same Node hook host as skills/offcut.
metadata:
  version: "0.1.0-justify"
  author: xyzbk
---

# Offcut

Ask one question into every build decision:

> **Is this change justified? Is it needed? Is there a better solution?**
> — supported by facts, not assertion.

Not as advice you may recall. As a question you answer before code exists.

## Before writing anything

1. **Is this change justified?** Name what breaks without it. If you cannot name it, do not build it.
2. **Does it already exist here?** Search this repository before writing. Re-implementing something that lives three files over is the most common waste.
3. **Can something else do it?** The platform, a database constraint, the standard library, or a dependency already installed — in that order.
4. **Is there a better solution?** Name the alternative you rejected and why it lost. Not the solution that looks complete — the one that satisfies the requirement and its invariants.
5. **Where does it belong?** Which boundary owns this responsibility? Every affected caller should route through one place. A guard repeated in six callers is not cheaper than one guard where all six already pass.

## After writing

6. **What did I add that nobody asked for?** Name it. Delete it or justify it with facts.

**Support it with facts.** Cite the file, the caller, the requirement line. "This seems cleaner" is not a fact.

Questions 1–4 kill unjustified building. Question 5 keeps placement honest — a justified diff in the wrong place still distributes cost.

## Deliberate shortcuts

When a justified answer knowingly cuts a real corner with a known ceiling — a coarse lock, a linear scan that will not stay linear, a heuristic that holds only for current inputs — leave an `offcut:` comment naming the ceiling and what to do when it is reached. Justified and *known* cheap is a decision. Unmarked is a landmine.

## What never gets simplified away

The challenge applies to construction, never to correctness. The question is about construction, not about correctness. It has no authority over anything that protects a user or their data: what the system does with untrusted input, what it does when an operation fails, who is allowed to do what, whether assistive technology can operate it, and anything the request named outright. Removing any of that is not a smaller change — it is a different, worse product.

## Modes

| Mode | Behavior |
|---|---|
| `full` | Reminder every turn (default) |
| `lite` | Reminder every third turn |
| `strict` | Reminder every turn; write-time escalation for new dependencies (Phase 2) |
| `off` | Silent |

Switch for this session: `/offcut full`, `/offcut lite`, `/offcut strict`, `/offcut off`.

Persist for new sessions: `/offcut default <mode>`.

Deactivate: `/offcut off`, `stop offcut`, or `normal mode`.
