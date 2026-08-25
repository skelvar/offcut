# Phase 9 — Host completeness and coexistence

Task specification for the implementing agent. Read this, `HOSTS.md`, and
`tasks/PHASE-8-TASK.md` before writing code.

---

## The situation

Phases 0–8 are merged. 153 tests. The mode is verified on Claude Code and
Codex; Grok is Tier 3 by its own documentation.

Two areas remain untested, and both are things a user hits before they hit
anything else.

**Host completeness.** Verification has been per-feature and opportunistic —
one transcript here, one probe there. No host has been walked end to end
against the full lifecycle, and the Phase 8 behaviors (suppression reset on
compaction, delivery-aware re-challenge, pruning) were measured on Claude Code
only.

**Coexistence.** Offcut has never been tested alongside another plugin's hooks
at runtime. `install.mjs` is verified to *merge* config safely — a foreign
`PostToolUse` survives install and uninstall — but nothing verifies that both
handlers actually *run*, that both deliver context, or that Offcut behaves when
another hook denies, escalates, or hangs.

This is not hypothetical. On the development machine six enabled plugins ship
hooks — `superpowers`, `remember`, `security-guidance`, `claude-mem`,
`ponytail`, `offcut` — and both ponytail and Offcut register `SessionStart` and
`UserPromptSubmit`. Anecdotally both fire; that has never been asserted.

## Scope

```
HOSTS.md               end-to-end matrix per host, dated, with method
COEXIST.md             new — coexistence findings and any host-specific rules
tests/phase9.test.js   contract tests for multi-handler behavior
```

**Do NOT build:** new signals, new commands, auto-repair, a heartbeat watchdog,
or Cursor support. If a gap needs a code change, make the smallest one and say
why in the PR.

---

## Job 1 — Walk each host end to end

For **Codex** and **Grok Build**, run the whole lifecycle in a real session and
record what was observed, not what should happen. Claude Code is the control —
re-run it too so the three are measured the same way.

| Step | What to confirm |
|---|---|
| install | `tools/install.mjs` writes the right config for that host |
| activation | mode file written; ruleset delivered to the model |
| per-turn reminder | the model can quote it back |
| write challenge | an over-built write produces a visible challenge |
| suppression | second identical write in the same turn stays quiet |
| **compact / clear** | suppression resets; ruleset re-delivered |
| **resume** | suppression persists (context was not wiped) |
| dead turn | challenge re-issued on the next turn |
| subagent | subagent reports it received Offcut context |
| mode switch | `/offcut lite`, `off`, `default strict` take effect |
| statusline | reflects mode where the host has one |
| doctor | reports that host correctly |
| uninstall | removes only Offcut's entries |

**The method that works** — proven twice this month — is to make the agent
report what it saw:

```
codex exec "spawn one subagent whose entire task is: output FOUND_OFFCUT if
your instructions or context contain the word OFFCUT, otherwise ABSENT"
→ FOUND_OFFCUT
```

Hooks firing is not the same as output reaching the model. Grok proved that.
**Every row above must be evidenced by something the model said, a state file
that changed, or a probe capture — never by "the hook ran".**

Grok is Tier 3 and most rows will legitimately read "not delivered". Record
that; it is the honest matrix, and `doctor` already reports it per host.

**Grok commands are the real gap there.** Phase 4 proved the skills are
*discovered* (`grok inspect --json`, `userInvocable: true`) but never invoked
one end to end. Invoke `/offcut-audit` in a real Grok session and confirm it
runs the scanner and returns findings.

## Job 2 — Coexistence

The questions, in the order a user hits them:

### 1. Do both handlers run?

Install Offcut alongside a second plugin that registers the same events. On
Claude Code, ponytail already does (`SessionStart`, `UserPromptSubmit`); on
Codex, the machine's `~/.codex/hooks.json` already carries an `impeccable`
`PostToolUse` hook.

Confirm **both** produce their effect in one session, not just that both are
present in the config file. Assert it, do not eyeball it.

### 2. Does more than one `additionalContext` survive?

Two hooks on the same event both returning context — does the model receive
both, the first, or the last? This determines whether Offcut is silently
suppressed on a machine with other plugins installed, which would be the worst
possible failure: works perfectly alone, does nothing in a real setup.

Measure it. If only one survives, that belongs in the README next to the Grok
limitation.

### 3. What happens when another hook denies or escalates?

If a security plugin's `PreToolUse` returns `deny`, does Offcut's handler still
run? Does Offcut's context still reach the model, or is it dropped with the
blocked call?

Offcut never denies by design, so it must not turn another plugin's deny into
an allow, and must not depend on running first.

### 4. Does a slow or hanging neighbour break Offcut?

Another plugin's hook that takes 30s, or hangs entirely. Offcut's own contract
is a bounded exit — confirm a neighbour cannot make Offcut miss its window, and
that Offcut cannot make a neighbour miss theirs.

### 5. Do the skills collide?

Both ponytail and Offcut ship review and audit skills with similar
descriptions. On a machine with both, does "review this diff for
over-engineering" activate the right one, both, or neither?

This is a description-quality problem, not a hook problem. If they collide,
sharpen Offcut's negative triggers — do not add hook-side intent detection,
which §13 of the plan rules out permanently.

### 6. Uninstall under coexistence

`install.mjs --uninstall` with three plugins' hooks present must remove exactly
Offcut's and leave the rest running. Merge safety is tested; **removal under a
populated config is not.**

---

## Definition of done

- [ ] End-to-end matrix in `HOSTS.md` for Claude Code, Codex, Grok — every row
      evidenced by model output, a state change, or a probe capture
- [ ] Grok `/offcut-audit` invoked end to end, or recorded as blocked with the
      reason
- [ ] Phase 8 behaviors (compaction reset, resume persistence, dead-turn
      re-challenge) confirmed on Codex, not only Claude Code
- [ ] `COEXIST.md` answers all six questions with measurements
- [ ] Multi-`additionalContext` behavior documented per host; if only one
      survives, it is in the README
- [ ] Offcut never converts another plugin's `deny` into an allow — asserted by
      test
- [ ] Offcut's timing is independent of a slow neighbour — asserted by test
- [ ] Skill-collision result recorded; descriptions sharpened only if needed
- [ ] Uninstall verified against a config holding at least two foreign hooks
- [ ] All 153 existing tests pass

---

## Working agreement

- Branch: `phase-9-coexistence`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Prefer measuring to reasoning. Every host claim this project made from
  documentation rather than a live session has been wrong at least once: a
  field name, a value, an entire tier, and a badge that read healthy without
  checking.
- A row you cannot verify is recorded as unverified **with the reason**, never
  left blank and never assumed from a sibling host.
- Open a PR against `main` stating, in the first paragraph, whether Offcut is
  safe to run alongside other plugins.
