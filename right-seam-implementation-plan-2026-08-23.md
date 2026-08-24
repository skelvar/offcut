# RightSeam — Implementation Plan

**Project name:** RightSeam
**Skill identifier:** `right-seam`
**Tagline:** *Ask what the cheapest thing that works is. Every turn. Before the code lands.*
**Plan version:** 3.0 — revised August 24, 2026
**Status:** Implementation-ready

---

## 0. What changed in v3.0

Versions 1.0 and 2.0 described the wrong product. Both treated RightSeam as an
instruction file that an agent reads when it decides the task looks relevant.
That is a *document*. It is not a mechanism.

**RightSeam is a persistent mode enforced through agent lifecycle hooks.** The
instruction text matters, but it is the payload, not the product. The product is
*when and how often the agent is made to answer for what it is about to build.*

What v3.0 adds:

1. **Hook architecture is the core**, specified event by event (§4).
2. **Enforcement at write time.** `PreToolUse` on `Write|Edit` challenges code
   before it exists, not after (§4.3).
3. **Per-turn persistence.** The challenge is re-asked every turn, not injected
   once and hoped for (§4.2).
4. **A closing check.** `PostToolUse` inspects what was actually written and
   names what was added that nobody asked for (§4.4).

What v3.0 removes: the static-analysis framing. RightSeam does not scan
repositories, index symbols, or produce reports. It sits in the agent's decision
loop and asks questions at the moments that matter.

---

## 1. What RightSeam is

A persistent mode that forces one question into every build decision:

> **What is the cheapest thing that actually works — and where does it belong?**

Not as advice the agent may recall. As a question the agent is made to answer,
at session start, at every prompt, before every file write, and after.

RightSeam exists because agents over-build by default. They reach for a class
when a function works, a config flag when a constant works, a dependency when
four lines work, an abstraction for one caller. Every one of those decisions
feels locally reasonable and compounds into a codebase nobody wants to open.

The name is the second half of the question. Cheapest is not enough — the
cheapest change in the wrong place is a second bug. **Cheap, and at the seam
that owns it.**

### 1.1 What it is not

- Not a repository scanner, indexer, or static analyzer.
- Not a code reviewer or security reviewer.
- Not an architecture consultant that redesigns projects.
- Not a report generator.
- Not a memory system, MCP server, or dashboard.
- Not an always-on persona that spends context on conversation.

---

## 2. How lifecycle hooks deliver a persistent mode

Researched August 24, 2026 against Claude Code's documented hook API. This
section records the platform capability RightSeam builds on. Implementing a
documented API is not derivative work; see §8.

### 2.1 The events that matter

| Event | Matcher | Can block | Can inject context |
|---|---|---|---|
| `SessionStart` | `startup`, `resume`, `clear`, `compact`, `fork` | No | Yes (stdout) |
| `UserPromptSubmit` | none — always fires | **Yes** | Yes |
| `PreToolUse` | tool names, e.g. `Write\|Edit` | **Yes** | Yes |
| `PostToolUse` | tool names | No | Yes |
| `SubagentStart` | agent type names | No | Yes |
| `PreCompact` | `manual`, `auto` | Yes | No |
| `Stop` | none | Yes | No |

`PreToolUse` returns `permissionDecision` of `allow`, `deny`, or `escalate`,
plus `permissionDecisionReason` and `additionalContext`. It can also rewrite the
call through `updatedInput`. This is the only event that sits between the
agent's decision to write code and the code existing.

`UserPromptSubmit` injects via stdout on exit 0, or `additionalContext`. It
fires on every prompt with no matcher, which makes it the natural place to
defeat drift.

Exit code 2 blocks, on every event that supports blocking. JSON is still read.

### 2.2 The prevailing pattern, and where it stops

The established way to ship a persistent mode is:

- a **state file** holding the current mode,
- a **`SessionStart`** hook that writes the state file and emits the full
  ruleset as context — matched on `compact` and `clear` as well as `startup`, so
  the ruleset returns after context is compacted away,
- a **`UserPromptSubmit`** hook that watches for mode-switch commands,
- a **`SubagentStart`** hook so spawned agents inherit the mode,
- a **statusline** command that reads the state file so the mode is visible.

That covers activation, persistence across compaction, subagent inheritance, and
visibility. It is a sound foundation and RightSeam adopts all five.

**Where it stops is the whole opportunity.** In that pattern:

1. **The ruleset is injected once per session.** After `SessionStart`, nothing
   re-asserts it. A turn-1 instruction competes with everything that accumulates
   after it, and loses gradually. Text in the ruleset claiming it is "active
   every response" is a request to the model, not a mechanism. Nothing checks.

2. **No `PreToolUse`, no `PostToolUse`.** The mode never observes the code. At
   the moment the agent writes a 200-line factory for one caller, the mode is
   not in the loop — it said its piece at turn 1 and went quiet.

3. **No feedback.** Nothing measures whether output was actually minimal. A
   statusline badge proves the mode is *enabled*. It does not prove it *worked*.

The result is a suggestion delivered once. RightSeam's contribution is closing
all three, using events the platform already exposes.

---

## 3. The challenge

RightSeam's payload is not a persona. It is a fixed set of questions the agent
must answer before code exists.

**Before writing anything:**

1. **Does this need to exist?** What breaks if it is skipped? If the answer is
   "nothing yet," skip it and say so in one line.
2. **Does it already exist here?** Search this repository before writing.
   Re-implementing something that lives three files over is the most common
   waste.
3. **Can something else do it?** The platform, a database constraint, the
   standard library, or a dependency already installed — in that order.
4. **What is the cheapest thing that actually works?** Not the cheapest thing
   that looks complete. The cheapest thing that satisfies the requirement and
   its invariants.
5. **Where does it belong?** Which boundary owns this responsibility? Every
   affected caller should route through one place. A guard repeated in six
   callers is not cheaper than one guard where all six already pass.

**After writing:**

6. **What did I add that nobody asked for?** Name it. Delete it or justify it.

Questions 1–4 kill over-building. Question 5 keeps cheapness honest — the
cheapest diff in the wrong place distributes the cost instead of removing it.
Question 6 is the only one that can be checked mechanically, which is why §4.4
checks it.

### 3.1 What never gets simplified away

The challenge applies to construction, never to correctness. Never cut:
understanding the problem, input validation at trust boundaries, error handling
that prevents data loss, security controls, accessibility basics, or anything
explicitly requested. A small diff produced without understanding the code is
not cheap — it is a second bug at a discount.

---

## 4. Hook architecture

Five hooks. Three of them are the thing that makes RightSeam different.

### 4.1 `SessionStart` — activate

Matcher: `startup|resume|clear|compact|fork`

Writes the state file, then emits the full ruleset as context. Matching
`compact` and `fork` is what makes the mode survive context compaction and
session forking — without those, a long session silently loses the mode at the
moment it most needs it.

Emits nothing and clears state when the mode is `off`.

Budget: the full ruleset, once. Target under 700 tokens.

### 4.2 `UserPromptSubmit` — re-ask, every turn

Matcher: none; fires on every prompt.

Two jobs:

**Mode commands.** Parse `/rightseam <off|lite|full|strict>` and
`/rightseam default <mode>`, update the state file, confirm.

**The per-turn reminder.** This is the fix for drift. On every prompt where the
mode is active and the prompt is not a mode command, inject a **compact**
reminder — not the full ruleset.

```text
RIGHTSEAM ACTIVE — before you build: does it need to exist? does it already
exist here? can the platform or stdlib do it? what is the cheapest thing that
works? which boundary owns it?
```

Under 60 tokens. That is the entire point of keeping it short: the full ruleset
every turn would cost more context than it saves, and would train the model to
skim it. One compact question every turn beats one long lecture at turn one.

**Skip the reminder when it cannot help.** No injection when the prompt is a
mode command, when the mode is `off`, or when the prompt is plainly
conversational rather than a build request. A reminder on "what does this
function do?" is noise, and noise is how a mode gets turned off.

`lite` mode reduces this to every third turn. `strict` keeps it every turn and
enables §4.3's escalation.

### 4.3 `PreToolUse` — challenge before the code exists

Matcher: `Write|Edit`

The event the prevailing pattern leaves unused, and the one that matters most.
It fires between the agent deciding to write and the file existing, and it can
`allow`, `deny`, or `escalate`.

RightSeam runs cheap deterministic checks on `tool_input` — never a model call,
never a repository scan. Each check is a text-level fact about the write itself:

| Signal | Check | Response |
|---|---|---|
| New file | `Write` to a path that does not exist | `additionalContext`: is a new file needed, or does this belong in an existing one? |
| Large first write | `Write` content over a line threshold | `additionalContext`: name the cheapest version of this. |
| New dependency | `Edit` adds a line to `package.json` dependencies, `requirements.txt`, `go.mod`, `Cargo.toml` | `escalate` in `strict`, `additionalContext` otherwise: what does this replace that four lines could not do? |
| Speculative abstraction | content declares an interface, abstract class, or factory with one implementation in the same write | `additionalContext`: one implementation — is the indirection carrying its weight? |
| Config for a constant | new config key whose value is never read in the same write | `additionalContext`: does this value ever change? |

**Design rules, and they are load-bearing:**

- **Default to `additionalContext`, not `deny`.** A hook that blocks legitimate
  work gets uninstalled within a day. The agent is asked, not stopped.
- **`escalate` only in `strict` mode, and only for adding a dependency** — the
  one decision that is genuinely hard to reverse and genuinely warrants a human.
- **Never `deny`.** RightSeam has no mechanism for knowing the requirement is
  wrong. It only knows the shape of the write.
- **One challenge per signal per session.** Repeating the same nudge on every
  write is nagging, and the model starts ignoring it. Track fired signals in
  the state directory.
- **Silent when nothing fires.** Exit 0, no output. Most writes are fine.

Budget: under 50ms, no I/O beyond the state file, no network, no subprocess.

### 4.4 `PostToolUse` — check what actually landed

Matcher: `Write|Edit`

The tool already ran; this event cannot block. It answers question 6.

Checks the written content for what was added beyond the request: an exported
symbol with no caller in the same write, a new configuration surface, a wrapper
around a single call, a parameter with a default that no call site passes. When
one fires, inject one line naming it.

This is the closest thing to feedback the loop can provide cheaply, and it is
the check that keeps the mode honest — question 6 is the one the agent will
otherwise never answer about its own output.

### 4.5 `SubagentStart` — inherit

Matcher: none.

Emits the ruleset so spawned agents run under the same mode. A subagent that
over-builds produces the same debt through a different door.

Requires the `hookSpecificOutput` JSON form; raw stdout is dropped on this
event.

### 4.6 Failure contract — every hook, without exception

A hook that breaks the agent is worse than no hook. Every RightSeam hook:

- **never blocks the session** — a timer bounds the run and exits 0 on expiry,
- **exits 0 on any internal error**, silently,
- **treats state-file writes as best-effort** — a failed write degrades the
  mode, it does not fail the turn,
- **strips a UTF-8 BOM before parsing** any JSON it reads,
- **never assumes stdin closes** — a wrapper on some platforms can swallow the
  piped payload so the `end` event never fires; process what arrived and exit,
- **runs under 5 seconds**, with real budgets far lower.

---

## 5. Modes and state

One file, `.rightseam-active`, holding one mode string, in the agent's config
directory. Absent file means off. The statusline command reads it.

| Mode | Per-turn reminder | `PreToolUse` | Escalation |
|---|---|---|---|
| `off` | none | none | none |
| `lite` | every 3rd turn | context only | never |
| `full` | every turn | context only | never |
| `strict` | every turn | context + escalate | new dependencies |

`full` is the default. `/rightseam <mode>` switches for the session;
`/rightseam default <mode>` persists to config for new sessions.

Deactivation must be easy and obvious: `/rightseam off`, "stop rightseam", or
"normal mode". A mode that is hard to turn off gets uninstalled instead.

---

## 6. The ruleset file

`skills/right-seam/SKILL.md` holds the full challenge text. Hooks read it at
runtime and emit it — the file is the source, the hook is delivery. There is
exactly one copy of the instructions in the repository.

Frontmatter uses only Agent Skills standard fields (`name`, `description`,
`license`, `compatibility`, `metadata`), so the same file also works as a
plain on-demand skill for hosts with no hook support. Verified limits:
`description` max 1024 characters, `compatibility` max 500, `name` kebab-case
and matching its directory, body under 500 lines and ~5000 tokens.

**Every hook needs a hardcoded fallback ruleset** for when the file cannot be
read — a broken install must degrade to a working mode, not to silence.

---

## 7. Repository structure

```text
rightseam/
├── skills/right-seam/SKILL.md      # the challenge, single source
├── hooks/
│   ├── hooks.json                  # event wiring
│   ├── activate.js                 # SessionStart
│   ├── prompt.js                   # UserPromptSubmit
│   ├── pre-write.js                # PreToolUse  ← the differentiator
│   ├── post-write.js               # PostToolUse
│   ├── subagent.js                 # SubagentStart
│   ├── state.js                    # shared state + output
│   ├── rules.js                    # ruleset loader + fallback
│   ├── statusline.sh
│   └── statusline.ps1
├── plugin.json                     # Agent Plugins 1.0
├── .claude-plugin/
│   ├── plugin.json                 # references hooks/hooks.json
│   └── marketplace.json
├── tests/hooks.test.js
├── README.md
├── LICENSE
└── .github/workflows/test.yml
```

Zero runtime dependencies. Node's standard library only — the hooks run on every
turn and every write, so startup cost is the budget that matters.

No per-host rule copies — no `.cursor/rules/`, no `.clinerules/`, no
`copilot-instructions.md`. Duplicated prompt bodies drift, and a mode whose
whole value is a coherent question set cannot afford divergent copies.

---

## 8. Originality constraint

RightSeam is an original work. Not a fork, rename, re-skin, or derivative.

**Not permitted:** copying instruction text, phrasing, persona framing, or
structure from another skill; copying source code from another project;
reproducing another project's benchmark numbers or example set; adopting another
project's distinctive vocabulary — named intensity levels used as branding,
signature slogans, persona conceits — even in paraphrase.

**Permitted:** implementing documented platform APIs. The hook event names,
matcher syntax, JSON output schemas, and exit-code semantics in §2 and §4 are
Claude Code's public interface. Writing a `SessionStart` hook is using the
platform, not copying whoever used it first. The same applies to the state-file
pattern and to conforming to published manifest schemas.

The line: **mechanism is shared, text and code are ours.** Every hook in §7 is
written from its specification in this plan. Every line of the challenge in §3
is written from the requirement. Any contribution that vendors third-party
instruction text or code is rejected regardless of the source license.

---

## 9. Manifests

`.claude-plugin/plugin.json` declares the hook wiring:

```json
{
  "name": "right-seam",
  "version": "0.1.0",
  "description": "Persistent mode that asks what the cheapest working solution is, before the code lands.",
  "author": { "name": "xyzbk" },
  "hooks": "./hooks/hooks.json"
}
```

Root `plugin.json` follows Agent Plugins 1.0: `$schema` and `name` are required;
`version`, `description`, `author`, `homepage`, `repository`, `license`, and
`keywords` are optional. Skills are auto-discovered from `skills/` — immediate
children only, which `skills/right-seam/SKILL.md` satisfies.

`.claude-plugin/marketplace.json` uses the self-rooted `"source": "./"` form,
verified working in production.

Hook commands need a Windows variant guarded on Node being present, so a machine
without Node degrades to no hooks rather than to a broken session.

Versions must match across all three manifests and the skill's
`metadata.version`. CI enforces it.

---

## 10. Evaluation

Two suites. Neither needs a model to run.

### 10.1 Hook unit tests

The hooks are ordinary programs with JSON in and JSON out, so test them
directly. Feed each event's documented input shape, assert on the output.

- `SessionStart` emits the ruleset in each mode; emits nothing when `off`.
- `UserPromptSubmit` parses every mode command; injects the reminder on build
  prompts; stays silent on mode commands, conversational prompts, and `off`.
- `PreToolUse` fires each §4.3 signal on a crafted `tool_input` and nothing on a
  clean one; returns `escalate` **only** in `strict` and **only** for a new
  dependency; **never** returns `deny` in any mode or input.
- `PostToolUse` names an unused export, a single-call wrapper, and a new config
  surface; stays silent on a plain function.
- Every hook exits 0 on malformed JSON, empty stdin, a missing state file, a
  BOM-prefixed payload, and an unreadable ruleset file.
- Every hook exits within its time budget when stdin never closes.

The last two matter more than the feature tests. A hook that hangs freezes the
user's session, and that is the failure that gets a plugin uninstalled and
never reinstalled.

### 10.2 Behavior corpus

`evals/prompts.jsonl` — the reminder must fire on build requests and stay quiet
on everything else, because a mode that interrupts constantly gets disabled.

At least 20 **should-fire**: "add caching to this endpoint", "write a function
that parses this", "we need retry logic", "build a config loader".

At least 20 **should-stay-quiet**: "what does this function do?", "rename this
variable", "fix this typo", "explain the error", "summarize the README",
"format this file".

Gates: ≥85% fire rate on build prompts, ≥90% quiet rate on the rest, zero fires
on the conversational set.

---

## 11. Security

Hooks execute on the user's machine on every turn. That is a higher bar than an
instruction file, and the plan states it plainly.

RightSeam's hooks must:

- make **no network calls**, ever,
- **install no dependencies** — Node standard library only,
- **read no files** other than the state file and the ruleset file,
- **write no files** other than the state file and its own session markers,
- **modify no source code** — `PreToolUse` may return `additionalContext` or
  `escalate`, and never `updatedInput`,
- **spawn no subprocesses**,
- **read no secrets or environment beyond** the config-directory variables and
  the platform's own plugin-root variable,
- **never interpolate an untrusted value into a shell command** — the statusline
  path is validated before it is embedded, and refuses when it contains shell
  metacharacters,
- **contain no binaries**, so the whole surface is readable in a diff.

The README states exactly which files are installed, which are created at
runtime, and how to remove all of them. Uninstall removes only RightSeam files.

---

## 12. Phases

### Phase 1 — The mode works

Write `SKILL.md`, `state.js`, `rules.js`, `activate.js`, `prompt.js`,
`subagent.js`, `hooks.json`, and the manifests. `PreToolUse` and `PostToolUse`
come in Phase 2 — get activation, persistence, mode switching, and the per-turn
reminder correct first.

**Done when:** the mode activates on install; survives `/clear` and compaction;
`/rightseam` switches modes and the statusline follows; the reminder fires per
§4.2 and meets §10.2's gates; every hook honors §4.6; nothing hangs.

### Phase 2 — Enforcement

Add `pre-write.js` and `post-write.js` with the §4.3 and §4.4 signals.

**Done when:** every signal has a passing unit test and a negative test; `deny`
is unreachable by construction and there is a test asserting it; `escalate`
fires only in `strict` for a new dependency; one-challenge-per-signal-per-session
holds; the write path stays under 50ms.

### Phase 3 — Prove it changes behavior

Only after 1 and 2. The smallest experiment that could change your mind: one
task family, two arms — mode off, mode `full` — five runs each, one host,
recorded model ID.

Measure what over-engineering actually looks like: files created, dependencies
added, exported symbols with no caller, abstraction layers introduced,
configuration keys added, and total lines — *alongside* whether the task still
passed. A smaller diff that fails the task is not a win, and the metric set must
make that impossible to report as one.

If there is no effect, the mode does not work and more fixtures will not save
it. Publish the runs that did not favor the mode. Every README claim stays
bounded by what was measured.

---

## 13. Deferred

| Deferred | Return when |
|---|---|
| `references/` files | An eval shows the agent missing a question that more detail fixes |
| Model-backed `PreToolUse` analysis | Deterministic signals prove insufficient *and* latency budget allows |
| Repository-wide scanning | Never — it is a different product |
| Cross-host verification beyond Claude Code | A second host has users asking |
| Benchmark against other tools | RightSeam has independent reproducible results first |
| Signed releases, marketplace listing | There are users to protect |

---

## 14. Definition of done for v0.1

- Mode activates, persists across compaction and `/clear`, and is visible in the
  statusline.
- Mode switching and deactivation work through every documented phrasing.
- The per-turn reminder meets §10.2's gates — fires on build prompts, quiet
  otherwise.
- `PreToolUse` challenges every §4.3 signal, never denies, and escalates only
  under `strict` for a new dependency.
- `PostToolUse` names unrequested additions.
- Subagents inherit the mode.
- Every hook satisfies §4.6, with tests for hang, malformed input, and missing
  files.
- Zero runtime dependencies; §11 holds in full.
- One copy of the instructions in the repository.
- No third-party instruction text or code anywhere (§8).
- README claims nothing §10 or §12 does not support.

Not required for v0.1: a multi-host matrix, a published benchmark, or any
reference file.

---

## 15. Final principle

> A mode that speaks once is a suggestion. A mode that asks again before the
> code lands is a constraint.

Ask what the cheapest thing that works is. Ask where it belongs. Ask every turn,
and again before the write. That is the product — the manifests, modes, and
statusline exist only to keep it running and easy to turn off.
