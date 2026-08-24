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
documented API is not derivative work; see §9.

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

**Mark deliberate shortcuts.** When a cheap answer knowingly cuts a real corner
with a known ceiling — a coarse lock, a linear scan that will not stay linear, a
heuristic that holds only for current inputs — leave a `rightseam:` comment
naming the ceiling and what to do when it is reached. Cheap and *known* cheap is
a decision. Cheap and unmarked is a landmine, and the person who finds it will
not be the person who left it.

This earns its place on its own: it makes intentional corner-cutting visible in
the diff, where it can be argued with at review time. It also happens to be the
precondition for harvesting those decisions later (§14).

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
mode command, when the prompt invokes a RightSeam command (§13, Phase 4), when the mode
is `off`, or when the prompt is plainly conversational rather than a build
request. A reminder on "what does this function do?" is noise, and noise is how
a mode gets turned off. During a command the reminder is worse than noise — the
command carries its own instructions and the two would contradict each other on
scope.

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

## 5. Host compatibility

Agent Skills are standardized. **Hooks are not.** Every host that has them
invented its own event names, config schema, and output vocabulary. This is the
largest ongoing cost in the project and the plan treats it as a first-class
design problem rather than a packaging detail.

### 5.1 What the divergence actually looks like

**Measured, not read.** The table below comes from `tools/probe.mjs` running
inside real sessions on August 24, 2026 — 28 captured events across three
harnesses. Where the vendor documentation and the wire disagree, the wire wins,
and it disagreed on the single most important point.

#### Config schema — all three identical

Claude Code, Codex, and Grok Build all accept the same `hooks.json`: PascalCase
event keys, optional `matcher`, nested `hooks` array, `type: "command"`,
`timeout`. One config file installs on all three.

#### Payload — two dialects, and the split is not where the docs implied

| | Claude Code | Codex | Grok Build |
|---|---|---|---|
| Event field | `hook_event_name` | `hook_event_name` | `hookEventName` |
| Event value | `PreToolUse` | `PreToolUse` | `pre_tool_use` |
| Key casing | snake_case | snake_case | **camelCase** |
| Tool name | `tool_name` | `tool_name` | `toolName` |
| Tool value | `Write`, `Edit` | `apply_patch` | `write` |
| Tool result | `tool_response` | `tool_response` | `toolResult` |
| Session | `session_id` | `session_id` | `sessionId` |
| Working dir | `cwd` | `cwd` | `cwd` + `workspaceRoot` |
| Distinctive keys | `prompt_id`, `session_title`, `duration_ms`, `effort` | `turn_id` | `isBackgrounded`, `timestamp`, `toolInputTruncated`, `toolResultTruncated` |
| Identifying env | `CLAUDECODE`, `CLAUDE_PROJECT_DIR` | **none** | `GROK_SESSION_ID` |

**Grok Build takes a PascalCase config and sends a camelCase payload with
snake_case event values.** Its documentation describes the config schema and
does not make the payload distinction; nothing short of probing would have
caught it. An adapter written from the docs would have read `hook_event_name`
off a Grok payload, got `undefined`, and failed silently on every event.

#### Three findings that change the design

**1. Environment variables cannot identify the host.** Codex sets *none* — it
was captured as `UNKNOWN` and only identified by `model: gpt-5.6-sol` and a
`transcript_path` under `~/.codex/sessions/`. Worse, `CLAUDE_PROJECT_DIR` leaked
into the Grok capture, so env vars are both absent when needed and present when
wrong.

Detect from the payload, which is intrinsic:

```text
payload.hookEventName present        → Grok Build
transcript_path contains ".codex"    → Codex
otherwise (hook_event_name present)  → Claude Code
```

**2. Grok truncates tool payloads and says so.** `toolInputTruncated` and
`toolResultTruncated` are booleans on the payload. §4.3's write-time signals
inspect `tool_input` content — against a truncated payload they would read
partial code and fire wrongly. **Every content-based signal must check the
truncation flag first and skip when set.** A missed challenge is acceptable; a
confident challenge based on half a file is not.

**3. Tool names differ per host and cannot be hardcoded.** The same write
arrives as `Write`/`Edit` on Claude, `apply_patch` on Codex, and `write` on
Grok. Matchers still fire correctly on all three — the matcher `Write|Edit`
produced events everywhere — but any code reading `tool_name` to decide
behavior must normalize through `host.js` rather than compare literals.

#### Subagent inheritance — verified on all three

`SubagentStart` fires on every v0.1 host, but the payload disagrees a third time:

| | Claude Code | Codex | Grok Build |
|---|---|---|---|
| Event value | `SubagentStart` | `SubagentStart` | `subagent_start` |
| Agent id | `agent_id` | `agent_id` | `subagentId` |
| Agent type | `agent_type` | `agent_type` | `subagentType` |
| Default type value | `general-purpose` | `default` | `general-purpose` |
| Extra keys | `prompt_id` | `turn_id`, `model`, `permission_mode` | `description`, `workspaceRoot`, `timestamp` |

Two consequences for §4.5. The agent-type *value* differs across hosts even for
an equivalent agent, so **a matcher on agent type is not portable** — match
everything and filter in `host.js` if filtering is ever needed. And the id/type
field names differ, so subagent metadata must be read through the adapter like
everything else.

#### One more wire-only finding

**Codex prints hook lifecycle lines to its own stdout** (`hook: SessionStart
Completed`). Anything a hook writes to stdout risks appearing in the user's
transcript on that host. RightSeam's hooks emit context through the documented
JSON field and write nothing to stdout directly — which the probe follows, and
which every shipped hook must too.

#### Still unmeasured

Cursor, entirely (§5.4). Every claim about it in this plan is documentation-based
and carries the same risk that the Grok payload finding just demonstrated.

### 5.2 Tiers

RightSeam's value is not uniformly deliverable. The plan states the tiers
plainly rather than implying every host gets the full product.

**Tier 1 — Full.** Lifecycle hooks available. Persistent mode, per-turn
reminder, write-time challenge, subagent inheritance, statusline. This is
RightSeam as designed.
→ **v0.1: Claude Code, Codex, Grok Build** — one config file, two payload
dialects, all three measured (§5.1). Cursor is deferred (§5.4).

**Tier 2 — Skill.** Agent Skills discovery, no lifecycle hooks. RightSeam
becomes an on-demand skill: the challenge fires when the description matches or
the user invokes it explicitly. **No persistence, no per-turn reminder, no
write-time enforcement.** Scripts may be bundled but only run when the agent
chooses to call one — nothing fires on a lifecycle event.
→ ChatGPT desktop and web, and any Agent Skills client without hooks.

**Tier 3 — Instruction.** A single always-on rule file, `AGENTS.md`, read at
session start by a large number of agents. No modes, no commands, no
enforcement — but genuinely always in context.
→ Everything that reads `AGENTS.md` or an equivalent project-rules path.

Note the inversion, because it is counterintuitive and worth designing around:
**Tier 3 is always on and Tier 2 is not.** A rule file sits in context for every
turn; a skill fires only when its description matches. Tier 2 hosts get the best
instructions and the weakest delivery.

### 5.3 The adapter seam

One module owns every host difference. Every hook calls it and none of them
contains a host name.

```text
hooks/host.js
  detect()            → which host, from environment
  events()            → this host's event-name mapping
  emit(event, payload) → serialize to this host's output shape
  gate(decision)      → map allow/challenge/escalate to this host's vocabulary
```

Hook scripts express intent — *"challenge this write"* — and `host.js` decides
whether that becomes `additionalContext`, `additional_context`, or nothing
because the host has no such field. A hook that emits raw JSON for a specific
host is a bug.

This is question 5 of §3 applied to RightSeam itself: host divergence is real
complexity, so it goes at the one boundary that owns it, instead of into five
hook scripts that each learn the whole matrix.

Adapter configs live under `adapters/<host>/`, one file each, generated from
nothing and hand-written per host schema. They are thin by construction: they
point at the same hook scripts.

### 5.4 How many hosts to support, and when

**v0.1 ships one hook config, three Tier 1 hosts, plus `AGENTS.md`.**

One PascalCase config file installs on **Claude Code, Codex, and Grok Build**.
`AGENTS.md` adds Tier 3 for one generated file.

**Cursor is deferred, and the measurement is why.** The earlier argument for
shipping Cursor early was that a seam validated against a single implementation
proves nothing, and three hosts sharing one schema would not exercise `host.js`.
Probing killed that argument: Grok Build sends a **different payload dialect**
from Claude and Codex (§5.1), so `host.js` has two real branches on day one and
is genuinely tested by the v0.1 set.

Cursor adds a third *config* schema, which is real work, but it no longer
unblocks anything architectural. It ships when someone asks for it and a
maintainer can test it.

What deferring Cursor costs, stated plainly: nothing architecturally, one host's
worth of reach.

Beyond that, hosts are demand-driven. **A host is never listed as supported
without a probe run and a dated manual smoke test.** Untested hosts are listed
as untested — and per §5.1, "the docs say it works" is not a substitute for
either.

### 5.5 Testing across hosts

Four layers, and only the last needs a human.

**0. The probe — establish the truth before writing the adapter.** Vendor docs
drift, omit fields, and disagree with what a host actually sends. `tools/probe.mjs`
is a passive hook that records the real payload, the real event names, and the
environment variables that identify each host, then `tools/report-probe.mjs`
renders the capability table from that evidence.

Run it against a harness *before* claiming support, and re-run it when a host
ships a major version. It is the only thing in this plan that can catch a host
silently renaming a field. It writes nothing to stdout, never blocks, and exits
0 on malformed input, empty stdin, and stdin that never closes — verified
against all three conditions.

The probe is a development tool, not part of the shipped plugin.

**1. Contract tests — automated, no host required.** Hooks are programs: JSON
in, JSON out. For each supported host, feed that host's documented input shape
and assert the exact output shape comes back — correct field names, correct
casing, correct gate vocabulary. This is parametrized over the host table, so a
new host is a new row, and it catches the overwhelming majority of breakage on
every commit.

Assert the negative cases too: that Cursor output never contains
`additionalContext`, that Claude output never contains `permission`, that a host
lacking a gate field never receives one.

**2. Adapter config validation — automated.** Each `adapters/<host>/` file must
parse and conform to that host's schema: event names drawn from that host's
documented set, correct timeout key, correct Windows-variant key, and every
referenced script path existing on disk. A typo in an event name is silent
failure at runtime — no error, the hook simply never fires — so this check is
the only thing standing between a typo and a host that quietly does nothing.

**3. Smoke tests — manual, per release.** Install on each Tier 1 host and verify
the mode activates, survives a context clear, switches modes, fires a challenge
on an over-built write, and uninstalls cleanly. Record host name, host version,
date, and result in the README.

These cannot be automated — the hosts are interactive products behind auth — and
pretending otherwise is how a support matrix becomes fiction. Three checks per
host, ten minutes each. That cost is the reason §5.4 keeps the host count low.

**Regression trigger:** when a host ships a new version, its smoke test is
re-run before RightSeam claims support for it. A host whose smoke test has not
been run against a current version gets marked stale in the README rather than
quietly left claiming support.

---

## 6. Modes and state

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

## 7. The ruleset file

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

## 8. Repository structure

```text
rightseam/
├── skills/right-seam/SKILL.md      # the challenge, single source
├── AGENTS.md                       # Tier 3, generated from SKILL.md
├── hooks/
│   ├── activate.js                 # session start
│   ├── prompt.js                   # per-turn reminder + mode commands
│   ├── pre-write.js                # write-time challenge  ← the differentiator
│   ├── post-write.js               # what got added
│   ├── subagent.js                 # subagent inheritance
│   ├── host.js                     # adapter seam  ← owns all host divergence
│   ├── state.js                    # mode file
│   ├── rules.js                    # ruleset loader + hardcoded fallback
│   ├── statusline.sh
│   └── statusline.ps1
├── adapters/
│   ├── claude/hooks.json           # v0.1
│   └── cursor/hooks.json           # v0.2
├── plugin.json                     # Agent Plugins 1.0
├── .claude-plugin/
│   ├── plugin.json
│   └── marketplace.json
├── tests/
│   ├── hooks.test.js               # behavior
│   ├── contract.test.js            # per-host output shapes (§5.5)
│   └── adapters.test.js            # config schema validation (§5.5)
├── scripts/build-agents-md.js      # SKILL.md → AGENTS.md
├── README.md
├── LICENSE
└── .github/workflows/test.yml
```

Zero runtime dependencies. Node's standard library only — the hooks run on every
turn and every write, so startup cost is the budget that matters.

**No hook script contains a host name.** Host differences live only in
`host.js` and `adapters/`. This is checkable, so CI checks it: a grep for host
identifiers outside those two paths fails the build.

**`AGENTS.md` is generated, never hand-edited.** It is a compact projection of
`SKILL.md` for Tier 3, and CI fails if it is stale. Hand-maintaining a second
copy of the ruleset is exactly the drift trap that per-host rule files create —
generating it keeps one source of truth while still reaching hosts that read
nothing else.

No per-host rule copies beyond that — no `.cursor/rules/`, no `.clinerules/`, no
`copilot-instructions.md`. Hosts that read those paths are served by `AGENTS.md`
where they support it, and go unsupported where they do not.

---

## 9. Originality constraint

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

The line: **mechanism is shared, text and code are ours.** Every hook in §8 is
written from its specification in this plan. Every line of the challenge in §3
is written from the requirement. Any contribution that vendors third-party
instruction text or code is rejected regardless of the source license.

---

## 10. Manifests

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

## 11. Evaluation

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

## 12. Security

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

## 13. Phases

### Phase 1 — The mode works

Write `SKILL.md`, `host.js`, `state.js`, `rules.js`, `activate.js`,
`prompt.js`, `subagent.js`, `adapters/claude/hooks.json`, the manifests, and the
`AGENTS.md` generator. Write-time enforcement comes in Phase 2 — get activation,
persistence, mode switching, and the per-turn reminder correct first.

`host.js` is written in this phase even though only one host exists yet, because
retrofitting an adapter seam through five hook scripts later is strictly more
work than starting with it. It stays deliberately thin until Phase 3 proves its
shape.

Run the probe (§5.5 layer 0) against Claude Code, Codex, and Grok Build first,
and build the adapter from what it records rather than from the doc table.

**Done when:** the probe report confirms the PascalCase schema on all three
hosts; the mode activates on install; survives `/clear` and compaction;
`/rightseam` switches modes and the statusline follows; the reminder fires per
§4.2 and meets §11.2's gates; every hook honors §4.6; nothing hangs; `AGENTS.md`
regenerates from `SKILL.md` and CI fails when it is stale; no hook script
contains a host name.

### Phase 2 — Enforcement

Add `pre-write.js` and `post-write.js` with the §4.3 and §4.4 signals.

**Done when:** every signal has a passing unit test and a negative test; `deny`
is unreachable by construction and there is a test asserting it; `escalate`
fires only in `strict` for a new dependency; one-challenge-per-signal-per-session
holds; the write path stays under 50ms.

### Phase 3 — Close what the probe left open

The v0.1 host set already spans two payload dialects, so the adapter seam is
exercised from Phase 1. What Phase 3 closes are the gaps §5.1 named as unproven:

1. ~~Subagent inheritance~~ — **done.** `SubagentStart` verified on Claude Code,
   Codex, and Grok Build; field-name and value differences recorded in §5.1.
   `host.js` must normalize `agent_id`/`subagentId` and `agent_type`/`subagentType`,
   and must not match on agent-type values.
2. **Truncation handling needs a real case.** Construct a write large enough to
   trip Grok's `toolInputTruncated`, and confirm every content-based signal
   declines to fire rather than firing on a fragment.
3. **Tool-name normalization needs all four spellings.** `Write`, `Edit`,
   `apply_patch`, and `write` must map to one internal concept, asserted by
   contract test.

**Done when:** a probe capture exists containing a truncated payload; contract
tests cover all four tool-name spellings and both subagent dialects; the
README's host table cites probe dates rather than vendor documentation.

### Phase 4 — Commands

One-shot, user-invoked, stateless. **A command is not a mode.** Modes
(`off`/`lite`/`full`/`strict`) persist in the state file and change how every
turn behaves. Commands run once, touch no state, and leave the mode exactly as
they found it. Keeping the two apart is what keeps "which mode am I in?"
answerable.

Each command is one `SKILL.md` under `skills/`. No hook work is required beyond
what already exists.

| Command | Does | Ships in |
|---|---|---|
| `/right-seam review` | Applies the §4.3 signals to a diff instead of a single write | v0.3 |
| `/right-seam audit` | Applies them across the repository, ranked | v0.3 |
| `/right-seam help` | Modes, commands, how to turn it off | v0.3 |

**Automatic invocation is already solved — do not build it.** A skill's
`description` is the activation mechanism: the agent reads it and fires on
"audit this repo for bloat" with no hook involvement. RightSeam's
`UserPromptSubmit` hook parses **explicit** `/right-seam <command>` invocations
only. Adding intent detection there would reimplement the platform's matcher and
cause both paths to fire on the same prompt.

Write each description with negative triggers as well as positive ones, and
extend §11.2's corpus to cover command activation — a command that fires on
"explain this function" is the same failure as a reminder that does.

**On `audit` and §1.1.** The non-goal stands: the *persistent mode* never scans
a repository. It reacts to the turn and the write in front of it. An explicit
command is the user asking for a scan, which is a different act with a different
cost profile. The line is who initiated it — never RightSeam on its own.

**Not in scope.** A benchmark scoreboard command needs numbers, and Phase 3 has
not produced any; shipping one earlier is marketing ahead of evidence. A
shortcut-harvesting command needs `rightseam:` markers (§3) to reach meaningful
density in real repositories first. Both are parked in §14.

### Phase 5 — Prove it changes behavior

Only after 1–3. Commands (Phase 4) may run in parallel; they share no code with the hook layer. The smallest experiment that could change your mind: one
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

## 14. Deferred

| Deferred | Return when |
|---|---|
| `references/` files | An eval shows the agent missing a question that more detail fixes |
| Model-backed `PreToolUse` analysis | Deterministic signals prove insufficient *and* latency budget allows |
| `debt` command (harvest `rightseam:` markers) | Markers reach meaningful density in real repositories |
| `gain` command (impact scoreboard) | Phase 4 has produced numbers worth showing |
| Intent detection in `UserPromptSubmit` | Never — skill descriptions already do this |
| Repository-wide scanning | Never — it is a different product |
| Cross-host verification beyond Claude Code | A second host has users asking |
| Benchmark against other tools | RightSeam has independent reproducible results first |
| Signed releases, marketplace listing | There are users to protect |

---

## 15. Definition of done for v0.1

- Mode activates, persists across compaction and `/clear`, and is visible in the
  statusline.
- Mode switching and deactivation work through every documented phrasing.
- The per-turn reminder meets §11.2's gates — fires on build prompts, quiet
  otherwise.
- `PreToolUse` challenges every §4.3 signal, never denies, and escalates only
  under `strict` for a new dependency.
- `PostToolUse` names unrequested additions.
- Subagents inherit the mode.
- Every hook satisfies §4.6, with tests for hang, malformed input, and missing
  files.
- Zero runtime dependencies; §12 holds in full.
- One copy of the instructions in the repository; `AGENTS.md` is generated from
  it and CI fails when stale.
- No hook script contains a host name — enforced by CI, not by convention.
- Contract tests pass for every claimed host, including the negative assertions
  (§5.5): no host ever receives another host's field names.
- Adapter config validation passes — every event name is real for that host,
  every referenced script path exists.
- Claude Code smoke test recorded with host version and date.
- Tier 2 and Tier 3 behavior documented honestly: ChatGPT and other hook-less
  hosts get the skill, not the mode, and the README says so in those words.
- No third-party instruction text or code anywhere (§9).
- README claims nothing §11 or §13 does not support, and marks every untested
  host untested.

Not required for v0.1: a second hook host, a published benchmark, or any
reference file.

---

## 16. Final principle

> A mode that speaks once is a suggestion. A mode that asks again before the
> code lands is a constraint.

Ask what the cheapest thing that works is. Ask where it belongs. Ask every turn,
and again before the write. That is the product — the manifests, modes, and
statusline exist only to keep it running and easy to turn off.
