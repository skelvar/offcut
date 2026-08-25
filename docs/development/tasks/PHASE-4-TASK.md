# Phase 4 — Commands

Task specification for the implementing agent. Read this, `tasks/PHASE-2-TASK.md`
(the signals), `HOSTS.md` (what each host can actually do), and
`offcut-implementation-plan.md` §13 Phase 4 before writing code.

---

## The situation

Phases 1–3 are merged. The persistent mode works and is verified on Claude Code
and Codex with a challenge observed in real transcripts. Grok Build is Tier 3 —
its hooks run but it discards their output, so it is served by `AGENTS.md`.

`hooks/signals.js` holds nine signals behind `runSignals(signals, view)`. It was
deliberately extracted in Phase 2 **for this phase**: `review` and `audit` apply
the same signals to a diff and to a repository. If you end up with a second copy
of the signal definitions, the extraction failed and the phase is wrong.

## Scope

Three skills, one scanner, tests:

```
skills/offcut-review/SKILL.md
skills/offcut-audit/SKILL.md
skills/offcut-help/SKILL.md
scripts/scan.mjs              applies signals.js to files or a diff
tests/phase4.test.js
evals/prompts.jsonl           extended with command activation cases
```

**Do NOT build:** new signals, a benchmark scoreboard command, a marker-harvest
command, Cursor support, or any hook changes. If a scan reveals a signal that
should exist, write it in the PR and leave it.

---

## The real design problem: signals were built for one write

`runSignals` takes a `WriteView` shaped around a single write in progress —
`{ toolName, shape, path, pathExists, content, truncated, mode }`. Two of those
fields are meaningless outside that moment, and it matters:

- `new-file` checks `pathExists === false`. In an **audit** every file exists,
  so it can never fire — and should not.
- `large-first-write` has the same dependency. Also meaningless in an audit.
- `exported-unused` currently checks "no caller **in the same write**." Across a
  repository it can check properly, which makes it *stronger*, not weaker.

So a signal is not automatically portable across contexts. **Give each signal an
explicit declaration of which contexts it applies to** — `write`, `diff`,
`repo` — and have the runner filter on it, the same way `shapes` and
`needsContent` already work.

Do not silently reuse a signal in a context where its check means something
different. A signal that quietly changes meaning is worse than one that does not
run, because its output looks authoritative.

Generalize the view minimally. `WriteView` becomes a view with a `context`
field; the write path keeps its current behavior. **Do not redesign
`signals.js`** — add the dimension, keep everything else.

## Script or instructions?

**Default: script-backed, reusing `signals.js`.** `scripts/scan.mjs` imports the
signal definitions and takes either a set of files or a diff, and emits
findings. The skills tell the agent to run it and how to present the results.

Reasoning: the entire justification for extracting `signals.js` in Phase 2 was
one definition serving all three surfaces. Re-expressing nine signals as prose
in three SKILL.md files recreates the duplication that extraction removed, and
they will drift on the first signal change. A script is also deterministic and
testable, which prose is not.

Node is already required for hooks, so this adds no new dependency. Keep the
same constraints: zero runtime dependencies, no network.

`offcut-help` needs no script — it is text.

If you conclude prose is better after trying it, say so in the PR with what you
observed. Do not silently produce both.

## Commands are not modes

`off`/`lite`/`full`/`strict` persist in the state file and change every turn.
Commands run once, **touch no state**, and leave the mode exactly as they found
it. A command must not write the mode file, and must not consume the
once-per-signal-per-session budget the hooks use — a review that silences the
next real write-time challenge is a bug.

Add a test asserting the state directory is byte-identical before and after a
command runs.

## Naming and invocation

Agent Skills require `name` to match its directory, so the skills are
`offcut-review`, `offcut-audit`, `offcut-help`, invoked as `/offcut-review` etc.

**The `UserPromptSubmit` hook must not learn about commands.** It parses mode
switches only. Do not add `/offcut review` parsing to it — that is intent
detection wearing a different hat, and it would double-fire against the skill
matcher. The plan's `/offcut review` notation is prose, not a spec.

Automatic invocation is already solved by the `description` field. Do not build
it. Write each description with **negative triggers as well as positive ones**,
and extend `evals/prompts.jsonl` with command-activation cases — a command that
fires on "explain this function" is the same failure as a reminder that does.

## Security: commands are not hooks

§12's constraints — no file reads beyond state and ruleset — apply to **hooks**,
which run automatically on every turn. Commands are user-invoked and read the
repository because that is what the user asked for.

Keep the distinction sharp and state it in the README: the persistent mode never
initiates a scan; an explicit command is the user asking for one. `scan.mjs`
must still make no network calls, modify no files, and spawn no subprocesses.

## The Grok opportunity

Grok is Tier 3 because it discards **hook output**. Skills are different — the
agent invokes them directly, so nothing depends on hook stdout.

Commands may therefore work on Grok even though the mode does not. Grok supports
skills under `.grok/skills/`. **Verify this**, and if it works, record it in
`HOSTS.md` and README — it partially restores a host currently listed as
instructions-only. If it does not work, record that too.

---

## Definition of done

- [ ] Three skills, each with standard-only frontmatter, `name` matching its
      directory, description under 1024 chars, body under 500 lines
- [ ] **One** copy of the signal definitions in the repo — `signals.js`
- [ ] Every signal declares which contexts it applies to; the runner filters on
      it; `new-file` and `large-first-write` cannot fire in a repo audit
- [ ] `scan.mjs` works on both a diff and a file set, zero dependencies, no
      network, no writes, no subprocesses
- [ ] Command runs leave the state directory byte-identical — asserted by test
- [ ] `UserPromptSubmit` unchanged; no command parsing added
- [ ] `evals/prompts.jsonl` covers command activation, positive and negative
- [ ] Grok skill support verified either way and recorded in `HOSTS.md`
- [ ] README documents the mode-never-scans / command-may-scan distinction
- [ ] All 80 existing tests still pass
- [ ] Any fix has a regression test that fails against the unfixed code

---

## Working agreement

- Branch: `phase-4-commands`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Prefer deleting a signal from a context over making it mean something new
  there.
- This project has been wrong three times by trusting documentation over
  measurement — a field name, a value, and an entire host tier. If you assert a
  host or a behavior works, say how you checked.
- Open a PR against `main` describing what you built, what you deviated from and
  why, and what remains unverified.
