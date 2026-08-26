<div align="center">

# Offcut

**Find the code nobody asked for.**

A code-review tool that detects over-engineering — and a measured, honest
account of whether telling an agent to write less actually works.

[Install](#install) · [Commands](#commands) · [Accuracy](#accuracy) · [What we measured](#what-we-measured) · [Limits](#limits)

</div>

---

An *offcut* is the material left over when something is cut to size — the piece
nobody asked for and nobody uses. Offcut looks for those in your code.

It is named after what it finds, like `lint`.

```
$ node scripts/scan.mjs src/

src/api/index.js (1)
  [exported-unused]         exported symbol with no caller — did anyone ask for it?
src/config/loader.ts (1)
  [speculative-abstraction] one implementation — is the indirection carrying its weight?
```

Six deterministic checks. No model call, no network, no dependencies — about
0.3 ms per file, so a 3,000-file tree scans in under a second. Every scan prints
its own file count and timing, so that figure is checkable on your code rather
than only on ours.

## Install

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

Codex headless runs need trusted hooks, or write hooks stay silent — grant
trust, or pass `--dangerously-bypass-hook-trust`.

### Grok Build

Grok runs hooks but discards their output by design — a hook there can block a
tool call, not speak to the model. Use the generated ruleset and the skills:

```bash
cp ~/.offcut-src/AGENTS.md .              # always-on ruleset
mkdir -p .grok/skills
ln -s ~/.offcut-src/skills/offcut-review .grok/skills/offcut-review
ln -s ~/.offcut-src/skills/offcut-audit  .grok/skills/offcut-audit
```

### Anything else

Copy `AGENTS.md` to your repo root. Most agents read it as project rules.

### Uninstall

```bash
node ~/.offcut-src/tools/install.mjs --uninstall
```

Removes only Offcut's entries. Other plugins' hooks are preserved, verified
against a config holding foreign handlers.

## Commands

| Command | Does |
|---|---|
| `/offcut-review` | Run the checks against a diff |
| `/offcut-audit` | Run them across a repository, ranked |
| `/offcut-help` | Modes, commands, how to turn it off |

Or run the scanner directly, with no agent involved:

```bash
node scripts/scan.mjs src/                   # audit a tree
git diff | node scripts/scan.mjs --diff -    # review a change
```

Reads only. No network, no writes, no subprocesses.

## Accuracy

The labeled corpora ship in this repository and reproduce exactly. The real-code
corpus does not — `realcode.mjs` scans whichever Claude Code plugins are
installed on the machine running it, so your totals will differ from these.

```bash
node bench/fp.mjs        # labeled negatives + positive corpus
node bench/realcode.mjs  # whatever is installed locally
```

| Corpus | What it is | Result |
|---|---|---|
| **Labeled negatives** | 95 accepted benchmark solutions — any fire is definitively wrong | **0/95**, every check, both contexts |
| **Positive corpus** | hand-written true positives, one per check | every shipping check fires |
| **Real code** | 918 JavaScript/TypeScript files across 19 installed plugins | **8.5%** produce a finding |

The two labeled corpora matter together: a detector scores zero on negatives by
never firing, so the positive corpus is what stops a silent tool from looking
perfect.

**Read the real-code row carefully** (measured 2026-08-26). That run walked
6,878 files, but 5,960 of them were JSON, Markdown, shell or Python — file types
the checks are gated off entirely ([Limits](#limits)) and which therefore cannot
fire. Reporting "1.1% of all files" would be arithmetically true and misleading,
so the row quotes the rate over the 918 files a check actually examines. The
corpus is also dominated by Offcut's own source, 5,603 of those 6,878 files,
because Offcut is installed on the machine that measured it. `realcode.mjs`
prints the per-project breakdown and both rates, so neither fact has to be taken
on trust.

**On a codebase it had never seen** — a private 259-file project — Offcut
produced 2 findings and both were real dead exports. Getting there required
fixing two bugs the corpora above had missed, which is why unseen code is worth
more than more test fixtures. That project is private, so this is the one
number here you cannot re-run.

### The checks

| Check | Fires when |
|---|---|
| `speculative-abstraction` | an interface or abstract class has exactly one implementor |
| `exported-unused` | an export has no caller anywhere in the repo |
| `new-dependency` | a dependency manifest gains a package |
| `new-config-surface` | a config system appears where a constant would do |
| `unused-default-param` | a parameter has a default no call site passes |
| `large-first-write` | a new file lands over the line threshold |

Three more were **deleted on evidence** — `config-for-constant` fired on 47.9%
of real files, `single-call-wrapper` matched a pattern that was not a defect,
and `new-file` was a constant rather than a heuristic.

## What we measured

Offcut also ships a persistent mode that re-asks the question every turn and
challenges a write before the file exists. We tried three times to show it
changes what an agent builds, and could not.

| Experiment | Question | Result |
|---|---|---|
| Premise | Do agents over-build at all? | **No structural over-building** in 12 runs |
| Benchmark | Does a challenge change output? | Untestable — nothing occurred to prevent |
| Framing | Does "is it justified?" beat "what's cheapest?" | **No** — and **0 structural over-building across 90 runs** |

The last one closed the obvious objection to the first. It used multi-file,
placement-ambiguous tasks with ambient future pressure — the conditions where
over-engineering should appear — across three arms and five reps. It did not
appear on any run, under any framing.

The only recurring miss is **scope**: an agent adds an export or a method
nobody asked for. No framing prevented it, and Offcut's checks do not detect it.

Rubrics were committed before any paid run. Scoring was blind to the arm. Raw
runs are published under `bench/`, with one documented exception noted in
[`bench/JUSTIFY.md`](bench/JUSTIFY.md).

**We publish this because it is the finding.** Prompt-based minimisation may
simply not change what a modern coding model writes. That is worth knowing, and
almost nobody measures it.

## Limits

### The persistent mode is unproven

Not disproven — unproven, on tasks up to multi-file scale, for one model. Use
it if you like the reminder. The review and audit commands stand on the
accuracy numbers above and do not depend on it.

### The checks are JavaScript/TypeScript only

They are syntax-level. Ungated they produced 65% false positives on Python and
100% on JSON, so they are gated by extension.

| | |
|---|---|
| Full | `.js` `.mjs` `.cjs` `.ts` `.tsx` `.jsx` + dependency manifests |
| Reminder only | everything else |

On a Python project Offcut activates, switches modes and re-asks the question,
but will not challenge an individual write, and an audit of it reports nothing.
This gating is also why the real-code denominator above is quoted over eligible
files rather than every file walked.

### Host support

Verified by observing a challenge in a real session, not by a successful
install.

| Host | Mode | Commands |
|---|---|---|
| Claude Code | full | yes |
| Codex | full | yes |
| Grok Build | `AGENTS.md` only | yes |
| ChatGPT, other skill hosts | no | yes |
| Cursor | **untested** | untested |

### No comparison to other tools

Offcut has not been benchmarked against ponytail or anything similar. If that
happens, the numbers go here whichever way they fall.

## How it works

```
SessionStart      write mode file, deliver the ruleset
UserPromptSubmit  re-ask the question (~60 tokens)
PreToolUse        run checks on the pending write, challenge via context
PostToolUse       name what got added
SubagentStart     subagents inherit the mode
```

One config installs on Claude Code, Codex and Grok. Host differences — two
payload dialects, four tool-name spellings, three subagent field conventions —
are normalized in `hooks/host.js`. No hook script contains a host name, and CI
enforces that.

Offcut **never denies a tool call.** It knows the shape of a write, not whether
the requirement is right. Verified structurally: no code path emits `allow` or
`deny`, so it cannot override another plugin's decision.

Every hook exits 0 on malformed input, empty stdin, a BOM, and stdin that never
closes. A hook that hangs freezes a session, so that case is tested explicitly.

Runs alongside other plugins. Measured with a second context-injecting hook on
the same events: **both survive** on Claude Code and Codex.

## Diagnostics

```bash
node hooks/doctor.js
```

Reports state, last activation, detected host and tier, ruleset readability,
hook script presence, subagent coverage and language coverage. Read-only — it
prints the repair command rather than editing your config, and exits non-zero
when unhealthy so it works in CI.

## Develop

```bash
node --test tests/*.test.js   # 166 tests
node bench/fp.mjs             # labeled corpus
node bench/realcode.mjs       # real-code corpus
node scripts/scan.mjs hooks   # dogfood
```

Zero runtime dependencies. Node standard library only.

Development history, phase specifications, host measurements and coexistence
findings are under [`docs/development/`](docs/development/).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 xyzbk.
