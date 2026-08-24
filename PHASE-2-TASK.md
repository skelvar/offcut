# Phase 2 — Write-time enforcement

Task specification for the implementing agent. Read this, `PHASE-1-TASK.md`, and
`offcut-implementation-plan.md` §4.3 and §4.4 before writing code.

Phase 1 is merged into `main`: the mode activates, persists, switches, reminds
every turn, and is inherited by subagents. 49 tests pass. **This phase adds the
part that makes Offcut different from a reminder: the challenge that fires
before code exists.**

---

## Scope

Two new hooks and nothing else:

```
hooks/pre-write.js     PreToolUse  — challenge before the write lands
hooks/post-write.js    PostToolUse — name what got added
hooks/signals.js       the shared signal definitions (see "Put signals in one place")
```

Plus their wiring in `adapters/claude/hooks.json`, their tests, and README
updates.

**Do NOT build:** Cursor support (Phase 3), `/offcut review|audit|help`
(Phase 4), any benchmark (Phase 5). Do not touch `state.js`, `rules.js`,
`activate.js`, `prompt.js`, or `subagent.js` except where this spec says to.

## What Phase 1 already gives you

Read `hooks/host.js` before writing anything. It already normalizes, for both
payload dialects:

- `toolName`, `toolInput`, `toolResult`
- `toolInputTruncated`, `toolResultTruncated`
- `sessionId`, `cwd`, `permissionMode`

and exposes `gate(host, decision)` accepting `{ kind: 'context' | 'allow' |
'escalate' }`. **There is deliberately no `deny` kind** — see the design rules.

You should not need to add a host branch. If you think you do, stop and say so
in the PR; that means the seam is wrong and moving it is a bigger decision than
this phase.

---

## The signals — `PreToolUse`, matcher `Write|Edit`

Cheap deterministic checks on `toolInput`. **Never a model call, never a
repository scan, no subprocess, no network.** Each is a text-level fact about
the write itself.

| Signal | Check | Response |
|---|---|---|
| New file | write to a path that does not exist | is a new file needed, or does this belong in an existing one? |
| Large first write | new-file content over a line threshold | name the cheapest version of this |
| New dependency | adds a line to `package.json` deps, `requirements.txt`, `go.mod`, `Cargo.toml` | what does this replace that four lines could not do? |
| Speculative abstraction | declares an interface, abstract class, or factory with exactly one implementation in the same write | one implementation — is the indirection carrying its weight? |
| Config for a constant | new config key whose value is never read in the same write | does this value ever change? |

### Design rules — load-bearing, not preferences

- **Default to context, never deny.** Offcut knows the *shape* of a write, not
  whether the requirement is right. A hook that blocks legitimate work gets
  uninstalled within a day.
- **`deny` must remain unreachable by construction.** `gate()` has no `deny`
  kind. Keep it that way and add a test asserting no input in any mode produces
  a deny in the output.
- **`escalate` only in `strict`, only for a new dependency.** That is the one
  decision genuinely hard to reverse.
- **One challenge per signal per session.** Repeating the same nudge on every
  write is nagging and the model starts ignoring it. Track fired signals in the
  state dir, keyed by session — see the concurrency note below.
- **Silent when nothing fires.** Exit 0, no output. Most writes are fine.
- **Budget: under 50ms.** No I/O beyond the state file.

---

## Three things that will bite you

### 1. Truncation — check the flag before reading content

Grok sends `toolInputTruncated` / `toolResultTruncated`. Every content-based
signal **must check the flag and decline to fire when set.** A missed challenge
is acceptable; a confident challenge based on half a file is not — it is exactly
the kind of wrong-and-loud behavior that gets the mode turned off.

`host.js` already normalizes both flags. Test this with a payload where the flag
is true and content looks like it should trip a signal; assert silence.

### 2. Tool names — four spellings for one action

The same write arrives as `Write` or `Edit` (Claude), `apply_patch` (Codex), and
`write` (Grok). Never compare `toolName` to a literal in a signal. Normalize in
`host.js` and branch on the normalized concept. Contract tests must cover all
four spellings.

Note the shapes differ too: a `Write` carries whole-file content, while an
`Edit` / `apply_patch` carries a fragment. **A signal that assumes whole-file
content will misfire on edits.** Decide per signal whether it applies to a full
write, a fragment, or both, and say so in a comment.

### 3. `escalate` is unverified — verify it before trusting it

`host.js` currently maps escalate to `permissionDecision: 'ask'` for
Claude/Codex, but Claude Code's documented values are `allow` / `deny` /
`escalate`. **`'ask'` may be silently ignored**, which would make strict mode do
nothing while appearing to work.

Phase 1 never used escalate, so this has never run. Before relying on it:

1. `node tools/install-probe.mjs`
2. Add a temporary hook returning `permissionDecision: 'escalate'`, then one
   returning `'ask'`, and observe which actually prompts
3. Fix `host.js` to whichever the host honors, and record the finding in the PR
4. `node tools/install-probe.mjs --uninstall`

This is the same class of failure as the Grok payload: documented one way,
silently wrong in practice. Do not skip it.

---

## `PostToolUse` — matcher `Write|Edit`

Cannot block; the write already happened. It answers question 6 of the
challenge: *what did I add that nobody asked for?*

Check the written content for additions beyond the request:

- an exported symbol with no caller in the same write
- a new configuration surface
- a wrapper around a single call
- a parameter with a default that no call site passes

When one fires, inject **one line** naming it. Same truncation rule, same
once-per-session rule, same silence default.

---

## Put signals in one place

`hooks/signals.js` holds every signal as data — id, what it inspects, its
message — with `pre-write.js` and `post-write.js` consuming it.

This is not speculative structure. Phase 4 ships `/offcut review` and `/offcut
audit`, which apply **these same signals** to a diff and to a repository. If the
signal definitions live inside `pre-write.js`, Phase 4 either duplicates them or
does surgery to extract them.

That is question 5 of the challenge applied to Offcut itself: the signal set is
one responsibility, so it gets one owner. Keep the module free of any concept of
*where* the content came from — it takes content and returns findings.

---

## Definition of done

- [ ] Every signal has a positive test and a negative test
- [ ] `deny` is unreachable, with a test asserting it across all modes and inputs
- [ ] `escalate` fires only in `strict`, only for a new dependency, and uses the
      value the host actually honors (verified by probe, not by docs)
- [ ] Truncated payloads produce silence — tested per content signal
- [ ] All four tool-name spellings covered by contract tests
- [ ] Whole-file vs fragment behavior is explicit per signal
- [ ] One challenge per signal per session, scoped by session id
- [ ] Silent exit 0 when nothing fires
- [ ] Write path measured under 50ms
- [ ] Every hook still satisfies the Phase 1 failure contract: hang, malformed
      JSON, empty stdin, BOM, missing state file
- [ ] No host names outside `host.js` — CI check still passes
- [ ] Zero runtime dependencies
- [ ] All Phase 1 tests still pass

---

## Working agreement

- Branch: `phase-2-enforcement`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- If the plan is wrong about something, **stop and write it in the PR** rather
  than working around it silently. The plan has been wrong twice now — the Grok
  payload dialect, and possibly the escalate value above. Finding a third is a
  good outcome, not a delay.
- Open a PR against `main` when done, describing what you built, what you
  deviated from and why, and anything you could not verify.
