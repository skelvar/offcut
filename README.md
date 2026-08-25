<div align="center">

# Offcut

**Ask what the cheapest thing that actually works is — before the code lands.**

A code-review tool that finds over-engineering, and a persistent agent mode that
asks the question at every write.

[Install](#install) · [Commands](#commands) · [What we measured](#what-we-measured) · [Honest limits](#honest-limits)

</div>

---

An *offcut* is the material left over when something is cut to size — the piece
nobody asked for and nobody uses. Offcut looks for those in your code.

It is named after what it finds, like `lint`.

```
$ offcut audit src/

src/config/loader.ts (2)
  [speculative-abstraction] one implementation — is the indirection carrying its weight?
  [new-config-surface]      new configuration surface — was this requested?
src/util/wrap.ts (1)
  [exported-unused]         exported symbol with no caller — did anyone ask for it?
```

## Install

Offcut ships as an Agent Skill plus optional lifecycle hooks.

### Claude Code

```bash
/plugin marketplace add xyzbk/offcut
/plugin install offcut@offcut
```

### Codex

```bash
git clone https://github.com/xyzbk/offcut ~/.offcut-src
node ~/.offcut-src/tools/install.mjs
```

### Grok Build

Grok runs the hooks but discards their output ([why](#grok-build)). Use the
generated ruleset instead — copy `AGENTS.md` to your repo root, and link the
skills:

```bash
mkdir -p .grok/skills
ln -s ~/.offcut-src/skills/offcut-review .grok/skills/offcut-review
ln -s ~/.offcut-src/skills/offcut-audit  .grok/skills/offcut-audit
```

### Anything else

Copy `AGENTS.md` to your repo root. Most agents read it as always-on project
rules. No modes, no commands, no write-time challenge — but the question is in
context every turn.

### Uninstall

```bash
node ~/.offcut-src/tools/install.mjs --uninstall
```

Removes only Offcut's own entries; existing hooks from other plugins are
preserved. Backups are kept as `*.offcut-backup`.

## Commands

| Command | Does |
|---|---|
| `/offcut-review` | Run the signals against a diff |
| `/offcut-audit` | Run them across a repository, ranked |
| `/offcut-help` | Modes, commands, how to turn it off |

Or use the scanner directly — no agent required:

```bash
node scripts/scan.mjs src/            # audit a tree
git diff | node scripts/scan.mjs --diff -   # review a change
```

Reads only. No network, no writes, no subprocesses, zero dependencies.

## The persistent mode

On hosts with lifecycle hooks, Offcut also runs as a mode: it re-asks the
question every turn and challenges a write before the file exists.

| Mode | Behavior |
|---|---|
| `full` | Reminder every turn (default) |
| `lite` | Reminder every third turn |
| `strict` | Every turn + escalation on new dependencies |
| `off` | Silent |

```
/offcut lite            # this session
/offcut default strict  # persist for new sessions
/offcut off             # or "stop offcut"
```

**Read [Honest limits](#honest-limits) before relying on this.** We measured
whether the mode changes what an agent builds and could not show that it does.

## The signals

Six checks, each one a text-level fact about the code in front of it. No model
call, no network, under 0.02ms per evaluation.

| Signal | Fires when |
|---|---|
| `speculative-abstraction` | an interface or abstract class has exactly one implementor |
| `new-dependency` | a dependency manifest gains a package |
| `new-config-surface` | a config system appears where a constant would do |
| `config-for-constant` | *deleted — fired on 47.9% of real files* |
| `unused-default-param` | a parameter has a default no call site passes |
| `large-first-write` | a new file lands over the line threshold |
| `exported-unused` | an export has no caller anywhere in the repo |
| `single-call-wrapper` | *deleted — matched the pattern, but the pattern was not a defect* |
| `new-file` | *deleted — `pathExists === false` is a constant, not a heuristic* |

Three signals were deleted on evidence. That is the process working.

## What we measured

Every number here is reproducible from this repository.

### Detector accuracy

```bash
node bench/fp.mjs        # labeled negatives
node bench/realcode.mjs  # real third-party code
```

| Corpus | What it is | Result |
|---|---|---|
| **Labeled negatives** | 95 accepted benchmark solutions — any fire is definitively wrong | **0/95** — every signal, write and diff context |
| **Real code** | 6,793 files across 19 published projects | **1.3%** of files produce a finding |
| **Positive corpus** | hand-written true positives, one per signal | every shipping signal fires |

Both numbers matter together. A detector can score 0 on labeled negatives by
never firing; the positive corpus is what prevents that.

### Host verification

A host is listed only when a challenge was **observed in a real transcript**.
Installing successfully is not verification.

| Host | Status |
|---|---|
| Claude Code | Full mode — verified 2026-08-24 |
| Codex | Full mode — verified 2026-08-24 |
| Grok Build | Commands work; mode does not ([why](#grok-build)) |
| ChatGPT and other skill hosts | Skill only — no persistent mode |
| Cursor | **Untested** |

### Cost of the evidence

132 paid agent runs, $22.74, all raw transcripts and diffs committed under
`bench/runs/`.

## Honest limits

This section exists because most tools in this space do not have one.

### We could not show the mode changes what agents build

Two benchmarks, 120 paid runs. Neither could demonstrate that a challenge
changes the output.

Then we tested the assumption underneath — *do agents over-build at all?* —
with a rubric committed before any run:

> 12 runs, four deliberately vague prompts, hand-judged.
> **Zero produced the structural over-engineering Offcut detects.**

On a task written to invite an interface, the agent wrote a `Map` and two
methods. On one written to invite a wrapper layer, it wrote four lines.

**So the persistent mode is unproven.** Not disproven — unproven, on this class
of work, for one model. The `/offcut-review` and `/offcut-audit` commands stand
on their own: you invoke them deliberately, and the accuracy numbers above are
what they deliver.

### The one thing we did find, we cannot detect

Two of three cache runs nearly doubled their code by adding unrequested `has()`
and `delete()` methods. That is real over-building — of **scope**, not
structure.

Offcut fires **nothing** on it. Every signal models structural over-engineering;
none models "more API than the request asked for."

Full write-up: [`bench/PREMISE.md`](bench/PREMISE.md).

### Language coverage is a cliff

The write-time challenge is **JavaScript/TypeScript only**. The signals are
syntax-level checks; ungated they produced 65% false positives on Python and
100% on JSON, so they are gated by file extension.

| | |
|---|---|
| Full | `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` + dependency manifests |
| Reminder only | everything else |

On a Python project Offcut still activates, switches modes, and re-asks the
question — but it will not challenge an individual write.

### Grok Build

Offcut's hooks install and run on Grok. **The model never sees their output.**
Grok's own documentation:

> `UserPromptSubmit` is observe-only: grok ignores its exit code and its stdout

> For events like `SessionStart` or `PostToolUse`, stdout is ignored.

Only `PreToolUse` reads stdout, and only a `deny` is reliably honored — which
Offcut never issues by design. Use `AGENTS.md` and the command skills instead.

### No comparison to other tools

Offcut has not been benchmarked against ponytail or any similar tool. The
four-arm comparison was planned and never run, so there is no basis for
claiming it improves on anything. If that comparison happens, the numbers will
be published here whichever way they fall.

## How it works

```
SessionStart   ─→  write mode file, emit the ruleset
UserPromptSubmit ─→  re-ask the question (~60 tokens)
PreToolUse     ─→  run signals on the pending write, challenge via context
PostToolUse    ─→  name what got added
SubagentStart  ─→  subagents inherit the mode
```

One config file installs on Claude Code, Codex, and Grok. Host differences —
two payload dialects, four tool-name spellings, three subagent field
conventions — are normalized in `hooks/host.js`; no hook script contains a host
name, and CI enforces that.

Every hook exits 0 on malformed input, empty stdin, a BOM, and stdin that never
closes. A hook that hangs freezes a session, so that case is tested explicitly.

## Develop

```bash
node --test tests/*.test.js   # 127 tests
node bench/fp.mjs             # labeled corpus
node bench/realcode.mjs       # real-code corpus
node scripts/scan.mjs hooks   # dogfood
```

Zero runtime dependencies, Node standard library only.

Design and full history: [`offcut-implementation-plan.md`](offcut-implementation-plan.md).
Per-phase specs: [`tasks/`](tasks/).

## License

MIT
