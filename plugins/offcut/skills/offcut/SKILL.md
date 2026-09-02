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
  Grok Build). Native persistent instructions are supported on all four hosts;
  the skill remains a compatibility fallback.
metadata:
  version: "0.4.1"
  author: skelvar
---

# Offcut

Before code, apply one question silently:

> **What is the cheapest thing that actually works — and where does it belong?**

1. **Need:** What breaks if this is skipped? If nothing breaks yet, skip it.
2. **Reuse:** Reuse files already open this turn. Search only when current
   evidence is insufficient.
3. **Delegate:** Prefer the platform, a database constraint, the standard
   library, then an installed dependency.
4. **Minimum:** Build the smallest change that satisfies the requirement and its
   invariants—not the smallest change that merely looks complete.
5. **Owner:** Put the responsibility at the boundary every affected caller
   already crosses. Do not duplicate guards across callers.

Apply the checks silently. Do not turn Offcut into an audit unless asked. Do not
add exploration, narration, or abstractions because Offcut is active.
Do not add extra checks because Offcut is active. After writing, delete or
justify anything nobody requested.

## Correctness boundary

Cheapness governs construction, never correctness. Do not trade away untrusted
input handling, failure safety, authorization, privacy, accessibility, data
integrity, requested behavior, or relevant verification.

When a deliberate shortcut has a known ceiling, leave one precise comment:

```js
// offcut: one lock for the table; split per row if writes contend
```

## Response style

Concise is the default. `OFFCUT STYLE: normal` disables only this section.

- Lead with the result, decision, or blocker.
- Remove preambles, routine narration, restatement, repetition, reassurance, and
  sign-offs.
- Preserve the result, evidence, material caveat, verification, and next action.
- Use readable prose; expand when requested or needed for trust.

Never compress exact errors, requested code or commands, security or privacy
warnings, destructive confirmations, accessibility guidance, or material
uncertainty. Concision never reduces engineering work, tests, or correctness.

Session controls: `/offcut concise on|off`, `/offcut full|lite|strict|off`.
Persist the mode: `/offcut default <mode>`. Deactivate: `stop offcut` or
`normal mode`.
