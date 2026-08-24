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

## Deliberate shortcuts

When a cheap answer knowingly cuts a real corner with a known ceiling — a coarse lock, a linear scan that will not stay linear, a heuristic that holds only for current inputs — leave an `offcut:` comment naming the ceiling and what to do when it is reached. Cheap and *known* cheap is a decision. Cheap and unmarked is a landmine.

## What never gets simplified away

The challenge applies to construction, never to correctness. Never cut: understanding the problem, input validation at trust boundaries, error handling that prevents data loss, security controls, accessibility basics, or anything explicitly requested. A small diff produced without understanding the code is not cheap — it is a second bug at a discount.

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
