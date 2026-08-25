# Phase 8 — Resilience audit

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

### 5. State files are never pruned — the project's own debt markers

`hooks/state.js` carries two `offcut:` markers, the convention this project
defines for a deliberate shortcut with a known ceiling:

```
// offcut: turn files are never pruned - one small file per session id, which is
// fine at human session counts; prune on SessionEnd if a state dir ever grows.
// offcut: fired files are never pruned - same ceiling as turn files.
```

**The ceiling was reached.** After one day of development the real `~/.offcut/`
held 46 files. The upgrade path named in the marker — prune on `SessionEnd` — is
now due.

This is separate from failure 1 (suppression surviving compaction) even though
both touch `fired-*`. That one is about *when* suppression resets; this is about
files accumulating forever. Fix both, and remove the markers when you do — a
marker left behind after its debt is paid is worse than no marker, because it
trains readers to ignore them.

### 6. Subagent coverage is unverified on two of three hosts

`SubagentStart` inheritance was measured on Claude Code and **retired as
unverified on Codex and Grok** — same code path, no cheap headless measure.

That is a real user-facing gap, not a bookkeeping one. A user on Codex who
spawns a subagent may get no coverage at all, and nothing tells them. Subagents
are where a mode silently stops applying, because the parent session looks fine
the whole time.

Close it: measure inheritance on Codex and Grok with a session that actually
spawns a subagent, and have `doctor` report subagent coverage as its own line
rather than folding it into "hooks installed".

If a host genuinely cannot deliver to subagents, that belongs in the README next
to the Grok stdout limitation — an honest gap, stated, not discovered by a user
whose subagent quietly ignored the mode.

### 7. Nothing tells a user whether Offcut is actually working

Every failure in this list is silent. Combined, they mean a user can have a
statusline reading `offcut:full`, a mode that went quiet at the last compaction,
a challenge that vanished with a dropped turn, and subagents with no coverage —
and see no difference from a healthy install.

The product's stated value is honesty about what it does and does not do. A
tool that cannot answer "is this working right now?" does not have that.

`doctor` is the answer, and it is the most user-valuable item in this phase.

### 8. The product question is still open — do not let Phase 8 imply otherwise

Phase 0 could not show the persistent mode changes what an agent builds, and the
premise test found no structural over-building to prevent on that class of work.

**That does not reduce this phase's scope.** "Does the mode change behavior" and
"does the mode work as advertised when installed" are different questions. The
failures above are correctness bugs in a shipped tool: a statusline that lies is
wrong whether or not the mode is effective.

What it does mean: nothing here should be written as if the product question
were settled, and no fix should be justified by "it makes the mode more
effective" — none of them do. They make it *honest*.

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

The most user-valuable thing in this phase. One command answering **"is Offcut
actually working right now?"** from evidence, not assumption.

It must report, each as its own line with a clear verdict:

| Check | Why it is separate |
|---|---|
| state dir exists and is writable | a read-only home breaks the mode silently |
| `active` exists and parses | absence means activation never ran — not "default full" |
| when activation last ran | a stale timestamp means hooks stopped firing |
| detected host, and its tier | Grok discards output; the user should see that here |
| ruleset file readable | otherwise the hardcoded fallback is in use |
| hook scripts exist where the installed config points | a moved checkout breaks every hook |
| **subagent coverage** | verified / unverified / unsupported on this host |
| **language coverage** | the write-time challenge is JS/TS only |

The last two exist because both are invisible cliffs a user would otherwise hit
without explanation.

**Read-only. It diagnoses; it does not repair.** When something is wrong it
prints the command that fixes it — `node tools/install.mjs`, which already
exists and already merges safely. Do not add repair machinery: a diagnostic that
rewrites a user's agent config is a much more dangerous thing than one that
tells them what to run, and the repair path is already built and tested.

Zero dependencies, no network, consistent with every other script here.

## Definition of done

- [ ] `compact`/`clear`/`fork` reset signal suppression; `resume` does not —
      with a test per source
- [ ] Session-id behavior across compaction **measured** with the probe on at
      least Claude Code, recorded in `HOSTS.md`
- [ ] Statusline reports nothing (or an explicit inactive marker) when `active`
      is absent — never a mode name
- [ ] Corrupt state is detectable by statusline and doctor; hooks still fail
      safe to the default mode
- [ ] Suppression is not established by emit alone; a challenge lost to a dead
      turn can be re-issued, with a test simulating the death
- [ ] `turn-*` and `fired-*` are pruned; both `offcut:` markers removed from
      `hooks/state.js` once the debt is paid
- [ ] Subagent inheritance measured on Codex and Grok, or stated unsupported in
      `HOSTS.md` **and** the README
- [ ] `node hooks/doctor.js` reports every line in the table above, read-only,
      printing the repair command rather than repairing
- [ ] Doctor exercised against a deliberately broken install (no state dir,
      corrupt `active`, moved checkout) and gives an actionable answer for each
- [ ] All 127 existing tests pass
- [ ] Every fix has a regression test that fails against the unfixed code

## Working agreement

- Branch: `phase-8-resilience`, off current `main`. Do not merge it yourself.
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
