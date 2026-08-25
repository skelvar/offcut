---
name: offcut
description: >
  Persistent mode that asks what the cheapest working solution is before code
  lands. Activates via lifecycle hooks on supported hosts; usable on demand as
  a skill everywhere else. Use when building, adding features, introducing
  abstractions, or when the user invokes /offcut. Do not use for pure
  explanation, rename-only edits, or formatting.
license: MIT
compatibility: >
  Requires Node.js on the PATH for lifecycle hooks (Claude Code, Codex, Grok
  Build). Works as an on-demand Agent Skill without hooks. Cursor and other
  hosts are untested.
metadata:
  version: "0.1.0"
  author: xyzbk
---

# Offcut

Ask one question into every build decision:

> **What is the cheapest thing that actually works — and where does it belong?**

Not as advice you may recall. As a question you answer before code exists.

## Before writing anything

1. **Does this need to exist?** What breaks if it is skipped? If the answer is "nothing yet," skip it and say so in one line.
2. **Does it already exist here?** Search this repository before writing. Re-implementing something that lives three files over is the most common waste.
3. **Can something else do it?** The platform, a database constraint, the standard library, or a dependency already installed — in that order.
4. **What is the cheapest thing that actually works?** Not the cheapest thing that looks complete. The cheapest thing that satisfies the requirement and its invariants.
5. **Where does it belong?** Which boundary owns this responsibility? Every affected caller should route through one place. A guard repeated in six callers is not cheaper than one guard where all six already pass.

## After writing

6. **What did I add that nobody asked for?** Name it. Delete it or justify it.

Questions 1–4 kill over-building. Question 5 keeps cheapness honest — the cheapest diff in the wrong place distributes the cost instead of removing it.

## Name the shortcuts you take on purpose

Sometimes the right answer has a limit you already know about: a lock held
wider than it needs to be, a lookup that walks the whole list, a rule that only
holds for the inputs you have today. Taking that answer is fine. Leaving it
unlabelled is not, because the next reader cannot tell a decision from an
oversight.

Write an `offcut:` comment saying what the limit is and what would force a
change:

```js
// offcut: one lock for the whole table; split per row if writes contend
```

## Where the question does not apply

The question is about construction, not about correctness. It has no authority
over anything that protects a user or their data: what the system does with
untrusted input, what it does when an operation fails, who is allowed to do
what, whether a person using assistive technology can operate it, and anything
the request named outright.

None of that is surplus, so none of it is subject to the question. Removing it
is not a smaller change — it is a different, worse product.

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
