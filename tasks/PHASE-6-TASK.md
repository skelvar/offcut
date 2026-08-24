# Phase 6 — Resilience audit

Task specification for the implementing agent. Read this, `HOSTS.md`, and
`bench/RESULTS.md` before writing code.

---

## The situation

Phases 1–5 are merged. 101 tests pass. The mechanism is verified on two hosts.
Phase 5 showed no detectable effect on output, and found that on 5/5 runs the
challenge fired and was ignored.

Every phase so far tested the **happy path**: does the hook fire, does the
payload parse, does the context get delivered. Nobody tested what happens when
the turn dies, the context is wiped, or the hook never starts.

A short audit found four failures, all measured, all reproducible from a clean
state dir. They share one root cause.

## The root cause

**Offcut's state records that a challenge was *emitted*, never that it was
*delivered and seen*. And absence of state is indistinguishable from a healthy
default.**

Everything below follows from that.

---

## Confirmed failures

### 1. Suppression survives compaction — the mode goes quiet when the model forgets

`SessionStart` re-injects the ruleset on `clear`/`compact`, but does **not**
clear `fired-*`. Reproduced:

```
fire a signal        -> challenge emitted, fired-<sid> written
SessionStart(compact) -> ruleset re-injected, fired-<sid> untouched
fire same signal      -> SILENT
```

If the session id survives compaction, every signal already fired stays
suppressed for the rest of the session — precisely when the model's memory of
the challenge has just been erased. This is the drift problem Offcut exists to
solve, occurring inside Offcut.

**First, measure what you are fixing.** The probe log has no `compact` or
`clear` SessionStart events, so *whether the session id is stable across
compaction is unverified on every host*. Capture it with `tools/probe.mjs`
before choosing a fix — if the id always changes, the practical impact is
smaller than it looks and the fix is still worth making for `resume`.

Note the asymmetry when you fix it: `clear`, `compact`, and `fork` wipe the
model's context, so suppression should reset. `resume` restores the transcript,
so the challenge is arguably still in context and suppression should persist.
Use `source` to distinguish. Do not reset blindly on every `SessionStart`.

### 2. The statusline lies when the hooks never ran

With an empty state dir — hooks never executed, node missing, plugin path wrong,
harness silently ignored the config — `readMode()` returns `"full"` and the
statusline prints `offcut:full`.

The badge claims protection that does not exist. This is the worst failure in
the set because it is **actively misleading**: a user whose install is broken
sees exactly what a working install shows.

`activateSession()` writes `active` on every `SessionStart`, so in normal
operation the file always exists. **Absence genuinely means activation never
ran**, and the statusline must say so — blank, or a distinct inactive marker,
never a mode name.

Keep `readMode()`'s fail-safe default for the *hooks* — degrading to `full` is
the right direction there. This is about display honesty, not enforcement.

### 3. A corrupt state file is indistinguishable from a healthy default

`active` containing binary garbage returns `"full"`, same as absent, same as a
real `full`. Failing safe is correct; failing *invisibly* is not. A corrupt
state file should be detectable — at minimum by the statusline and by a
diagnostic.

### 4. A challenge lost to a dead turn is never re-issued

`fired-*` is written when the challenge is emitted. If the turn dies after that
— network drop, rate limit, user interrupt, host crash — the user never saw the
challenge, the write never happened, and the retry is silent. Reproduced: fire,
simulate death, fire again → nothing.

Marking fired at emit time is the bug. There is no delivery receipt available
from any host, so a perfect fix is impossible; a good fix ties suppression to
evidence that the turn progressed, rather than to the emit itself.

---

## Scope

Fix the four above. Add a diagnostic. Do not add features.

```
hooks/state.js       delivery-aware fired tracking; corrupt-state detection
hooks/activate.js    reset suppression on context-wiping sources only
hooks/statusline.*   never report a mode that was never activated
hooks/doctor.js      new — one command that says whether Offcut is actually working
tests/phase6.test.js
```

**Do NOT build:** new signals, new hosts, Cursor support, benchmark changes, or
anything addressing Phase 5's persuasion finding. That is a product question,
not a resilience one, and it belongs in its own phase.

## `hooks/doctor.js`

The missing piece behind failures 2 and 3: there is no way for a user to ask
"is this actually working?"

It should report, from evidence rather than assumption: whether the state dir
exists and is writable, whether `active` exists and parses, when activation last
ran, which host was detected, whether the ruleset file is readable, and whether
the hook scripts are where the installed config points.

Keep it read-only and dependency-free like everything else. It is a diagnostic,
not a repair tool.

---

## Definition of done

- [ ] `compact`/`clear`/`fork` reset signal suppression; `resume` does not —
      with a test per source
- [ ] Session-id behavior across compaction **measured** with the probe on at
      least Claude Code, and recorded in `HOSTS.md`
- [ ] Statusline reports nothing (or an explicit inactive marker) when `active`
      is absent — never a mode name
- [ ] Corrupt state is detectable by statusline and doctor; hooks still fail
      safe to the default mode
- [ ] Suppression is not established by emit alone; a challenge lost to a dead
      turn can be re-issued, with a test simulating the death
- [ ] `node hooks/doctor.js` reports honest status from evidence
- [ ] All 101 existing tests still pass
- [ ] Every fix has a regression test that fails against the unfixed code

---

## Working agreement

- Branch: `phase-6-resilience`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Measure before fixing where a measurement is available. Item 1 has an
  unverified premise; the probe can settle it.
- This project has been wrong five times by trusting something over
  measurement — a field name, a value, a host tier, a scan that reported clean
  without scanning, and a badge that reports healthy without checking. The
  pattern is always the same: **absence of a signal read as success.** Look for
  more of it while you are in here.
- Open a PR against `main` describing what you fixed, what you measured, and
  what remains unverified.
