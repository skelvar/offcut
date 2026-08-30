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
  Requires Node.js on the PATH for lifecycle hooks (Claude Code, Codex, Cursor,
  Grok Build). Full mode delivery is verified on Claude Code, Codex, and Cursor.
  Grok uses AGENTS.md because its hook output is discarded. Works as an
  on-demand Agent Skill without hooks.
metadata:
  version: "0.2.0"
  author: xyzbk
---

# Offcut

Ask one question into every build decision:

> **What is the cheapest thing that actually works — and where does it belong?**

Not as advice you may recall. As a question you answer before code exists.

## Before writing anything

1. **Does this need to exist?** What breaks if it is skipped? If the answer is "nothing yet," skip it and say so in one line.
2. **Does it already exist here?** Reuse files already open this turn. Search only if that does not answer it. Re-implementing something that lives three files over is the most common waste.
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

## Response style

Offcut uses a concise response style by default while it is active.
`OFFCUT STYLE: normal` disables only this section; the construction rules remain active.

When concise:

- Lead with the result, decision, or blocker.
- Skip tool preambles, routine narration, restating the request, repetition,
  generic reassurance, and ceremonial sign-offs.
- Keep the shortest answer that preserves the result, evidence, material caveat,
  verification performed, and next action when one exists.
- Expand when the user asks for detail or when trust and comprehension require it.
- Use complete, readable prose. Do not force fragments, abbreviations, or a word cap.

Never compress away exact errors, requested code or commands, security or privacy
warnings, destructive-action confirmations, accessibility guidance, or material
uncertainty. Concision never reduces engineering work, tests, tool use, or correctness.

Switch this session: `/offcut concise on` or `/offcut concise off`.

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
