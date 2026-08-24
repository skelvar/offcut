# Phase 3 — Make it real

Task specification for the implementing agent. Read this, `PHASE-1-TASK.md`,
`PHASE-2-TASK.md`, and `offcut-implementation-plan.md` §5 before writing code.

---

## The situation

Phases 1 and 2 are merged. 75 tests pass. Offcut has an activation hook, a
per-turn reminder, subagent inheritance, nine write-time signals, a host adapter
covering two payload dialects, and manifests.

**None of it has ever been installed or run.** Every test feeds a synthetic
payload to a function. No one has installed the plugin into a harness, started a
session, written an over-engineered file, and watched a challenge appear.

This phase does that, and fixes what breaks. Expect things to break — the areas
below are known-unverified, and there will be others.

## Scope

Installation, end-to-end verification on Claude Code, Codex, and Grok Build, and
the fixes those runs demand. Plus one new file:

```
HOSTS.md    dated verification results per host — what was tested, on which
            host version, what worked, what did not
```

**Do NOT build:** Cursor support, `/offcut review|audit|help` (Phase 4), any
benchmark (Phase 5), or new signals. If a run reveals a missing signal, write it
down in `HOSTS.md` and leave it for Phase 4.

---

## Known-unverified, in the order they will bite

### 1. `${CLAUDE_PLUGIN_ROOT}` is Claude-specific — the "one config" claim is untested

`adapters/claude/hooks.json` resolves every hook through `${CLAUDE_PLUGIN_ROOT}`.
That variable is set by Claude Code for plugin-installed hooks. **Codex and Grok
will not set it.**

The plan claims one config file installs on all three hosts. That claim is
verified for the *schema* — all three accept PascalCase events, `matcher`,
nested `hooks`, `timeout` — and **completely unverified for path resolution.**
If the variable is empty, the command becomes `node /hooks/activate.js`, which
fails silently in the way this project has been bitten by twice.

Find out what each host actually provides. Options, cheapest first:

- a variable each host sets that can be used uniformly
- per-host `adapters/<host>/hooks.json` differing only in the path prefix
- absolute paths written at install time by a small installer

Whatever you choose, **the hook scripts must not change** — this is a packaging
concern, not a `host.js` concern. If you find yourself editing a hook, stop.

### 2. No Windows command variant

`PHASE-1-TASK.md` asked for a Windows variant guarded on Node being present, so
a machine without Node degrades to no hooks rather than a broken session. The
config has none, and uses `"command": "node", "args": [...]`.

Verify the `args` array form is honored on all three hosts — Grok's documented
shape is a single `command` string, and an ignored `args` array would mean the
hook runs bare `node` with no script. That fails silently. Again.

Development is on Windows; test there.

### 3. `permissionDecision` — unresolved from Phase 2, now testable

Phase 2 left this open because it could not install a hook. You can.

Commit 8899ba4 cites Claude values `allow|deny|ask|defer`; an independent read
of the same page returned `allow|deny|escalate`; the reference section was
truncated in both fetches. Grok was measured and honors only `allow|deny`.

Install a temporary hook returning each candidate value in turn and observe
which actually produces a permission prompt on Claude Code and on Codex. Record
the result in `HOSTS.md` and fix `host.js` to whichever the host honors.

Not urgent — the escalate branch already emits `additionalContext` alongside, so
a wrong value degrades to a context challenge rather than silence. But it is
cheap to settle now that a real install exists.

### 4. Truncation — force a real oversized write

Phase 2 tests truncation with a synthetic flag. Nobody has seen a real
`toolInputTruncated`.

Write a file large enough to trip Grok's limit and capture the payload with
`tools/probe.mjs`. Confirm the flag appears where expected, and that content
signals stay silent. Record the approximate threshold in `HOSTS.md` — a
truncation limit nobody knows the size of is a signal that will misfire at some
unknown file size.

### 5. Everything else that has never run

Work through these on each host and record the result:

- plugin installs at all, and the hooks register
- mode activates on a fresh session
- **the reminder actually appears** in a real turn
- `/offcut lite|full|strict|off` switches, and the change takes effect
- `/offcut default <mode>` survives a restart
- **a real over-engineered write triggers a real challenge** — write a 200-line
  file with an interface and one implementation and confirm the agent is
  challenged
- once-per-session suppression behaves over a long real session
- subagent inheritance works when the host spawns one naturally
- the statusline renders, on Windows and on a POSIX shell
- `/clear` and a real context compaction preserve the mode
- uninstall removes everything

---

## Method

`tools/probe.mjs` and `tools/install-probe.mjs` already exist and are the model:
passive, backed up, merged not replaced, tagged, reversible. Reuse that approach
for anything you install.

Whatever you do to a real config, you must be able to undo. Back up before
touching, and verify the undo actually works before you rely on it.

Prefer fixing the packaging over fixing the hooks. Phases 1 and 2 are verified
under adversarial input; if a hook looks wrong, suspect the install first.

---

## Definition of done

- [ ] Offcut installs and activates on Claude Code, Codex, and Grok Build
- [ ] Path resolution works on all three, with hook scripts unchanged
- [ ] Windows command form verified; a machine without Node degrades to no
      hooks rather than a broken session
- [ ] A real over-engineered write produces a real challenge, on at least one
      host, with the transcript excerpt recorded
- [ ] The reminder is confirmed appearing in a real session
- [ ] `permissionDecision` settled empirically for Claude and Codex; `host.js`
      matches the finding
- [ ] A real truncated payload captured, approximate threshold recorded
- [ ] Mode survives a real `/clear` and a real compaction
- [ ] Uninstall verified clean on every host
- [ ] `HOSTS.md` records host name, host version, date, and result for every
      check above — including the ones that failed
- [ ] All 75 existing tests still pass
- [ ] Any fix has a regression test that fails against the unfixed code

---

## What "done" does not mean

Do not mark a host verified because it installed. Verified means a challenge
was observed in a real transcript. The whole point of this phase is replacing
"the tests pass" with "it works," and those are different claims.

If something cannot be verified — a host will not cooperate, a limit cannot be
reached — **say so in `HOSTS.md` and leave it unverified.** An honest gap is
worth more than a claim the README cannot support. This project has now been
wrong twice by trusting documentation over measurement; do not add a third by
trusting a green test suite over a real session.

---

## Working agreement

- Branch: `phase-3-real`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Record findings as you go, not at the end. A surprise found in hour one is
  usually forgotten by hour three.
- Open a PR against `main` describing what you verified, what broke and how you
  fixed it, and what remains unverified.
