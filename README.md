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
  [exported-unused]         exported symbol has no other reference in the scanned scope — did anyone ask for it?
src/config/loader.ts (1)
  [speculative-abstraction] one implementation — is the indirection carrying its weight?
```

Six deterministic checks. No model call, no network, no dependencies. Tree
scans print their own file count and elapsed time, so performance is measured on
the checkout being scanned rather than extrapolated from ours.

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

`install.mjs` installs lifecycle hooks only. To add the three one-shot command
skills globally, ask Codex's built-in `$skill-installer` to install these GitHub
folders, then restart Codex:

```text
https://github.com/xyzbk/offcut/tree/main/skills/offcut-review
https://github.com/xyzbk/offcut/tree/main/skills/offcut-audit
https://github.com/xyzbk/offcut/tree/main/skills/offcut-help
```

### Cursor

```bash
git clone https://github.com/xyzbk/offcut ~/.cursor/plugins/local/offcut
```

That is Cursor's [documented local-plugin path](https://cursor.com/docs/plugins)
and loads the hooks and all four skills from `.cursor-plugin/plugin.json`. Open
a new chat after installing.
Alternatively, `node tools/install.mjs` merges only the native hooks into
`~/.cursor/hooks.json`; existing handlers and version-only files are preserved,
while malformed configs are left untouched with a non-zero exit. Verified end
to end on Cursor 3.17.19 (Windows, 2026-08-27), including a delivered write
challenge, mode switches, subagent inheritance, and uninstall/reinstall.

### Grok Build

Grok runs hooks but discards their output by design — a hook there can block a
tool call, not speak to the model. Use the generated ruleset and the skills:

```bash
cp ~/.offcut-src/AGENTS.md .              # always-on ruleset
mkdir -p .grok/skills
ln -s ~/.offcut-src/skills/offcut        .grok/skills/offcut
ln -s ~/.offcut-src/skills/offcut-review .grok/skills/offcut-review
ln -s ~/.offcut-src/skills/offcut-audit  .grok/skills/offcut-audit
ln -s ~/.offcut-src/skills/offcut-help   .grok/skills/offcut-help
```

### Anything else

Copy `AGENTS.md` to your repo root on hosts that load it as project rules. This
hook-less fallback is verified on Cursor and Grok Build; the ruleset arrives,
but modes and write-time challenges still need native hooks.

### Uninstall

Claude Code marketplace install:

```bash
claude plugin uninstall offcut@offcut
claude plugin marketplace remove offcut
```

Hooks installed by `tools/install.mjs`:

```bash
node ~/.offcut-src/tools/install.mjs --uninstall
```

Removes only Offcut's entries. Other plugins' hooks are preserved, verified
against configs holding foreign handlers. Delete
`~/.cursor/plugins/local/offcut` to remove the Cursor local-plugin install.
The optional state directory `~/.offcut/` is deliberately retained; delete it
only if you also want to discard the persisted mode and diagnostics.

## Commands

### Response style

Concise responses are the default while Offcut is active. The style leads with
the result and removes routine narration, but preserves evidence, material
caveats, verification, exact errors, and safety-critical content.

```text
/offcut concise on     # concise responses for this session
/offcut concise off    # normal responses; construction checks stay active
```

This does not edit Claude `outputStyle`, Codex `model_verbosity`, Cursor,
Gemini, or other harness settings. `/offcut off` remains the separate command
that disables Offcut itself. Token savings are not claimed until the guarded
live comparison passes both cost and answer-completeness gates.

The local benchmark is plan-only by default:

```powershell
node bench/live-style.mjs busy-helper --reps 2
```

Its three arms are normal prose, the one-line `Be terse.` control, and Offcut
concise. Paid execution requires two explicit flags; generated receipts remain
**NOT CLAIMABLE** until every arm passes task acceptance and an explicit blind
answer-completeness review. Cold and warm cache evidence is reported separately.
See [the response-style benchmark protocol](docs/development/STYLE-BENCHMARK.md).

### Review and audit

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

The labeled corpora and their dated results ship in this repository. The
real-code corpus is machine-dependent — `realcode.mjs` scans whichever Claude
Code plugins are installed on the machine running it, so your totals will differ
from these.

```bash
node bench/fp.mjs        # labeled negatives + positive corpus
node bench/realcode.mjs  # whatever is installed locally
```

| Corpus | What it is | Result |
|---|---|---|
| **Labeled negatives** | 95 accepted benchmark solutions — any fire is definitively wrong | **0/95** for every check applicable to write/diff context |
| **Positive corpus** | hand-written true positives, one per check | every shipping check fires |
| **Real code** | current v0.2 corpus: 65 eligible JS/TS files across 15 *independent* plugins | **8 of 65** — too small a sample to call a stable rate |

The two labeled corpora matter together: a detector scores zero on negatives by
never firing, so the positive corpus is what stops a silent tool from looking
perfect.

**Read the real-code row carefully** (rerun 2026-08-29). That run walked 1,318
files, but only 149 had an extension examined by a repository signal. Reporting
"1.3% of all files" would be arithmetically true and misleading, so the table
below keeps the eligible denominator visible.

The corpus is whatever plugins happen to be installed on the measuring machine.
Cached Offcut copies are now excluded because the working tree already supplies
the self corpus and cached copies may contain generated benchmark runs. A further
43 eligible files belong to ponytail, the comparison subject. That leaves **65
genuinely independent files, with 8 findings.**

| Group | Eligible files | Fired |
|---|---:|---:|
| Independent third-party | 65 | 8 |
| Offcut's own source | 41 | 9 |
| Benchmark subject | 43 | 0 |

Earlier versions blended all three into one rate. `realcode.mjs` now
classifies every project, prints each group with its denominator, and names the
independent row as the only publishable one — so the composition cannot be
mistaken again.

**On a codebase it had never seen** — a private 259-file project — Offcut
produced 2 scope-relative export findings and both were confirmed manually as
dead. Getting there required
fixing two bugs the corpora above had missed, which is why unseen code is worth
more than more test fixtures. That project is private, so this is the one
number here you cannot re-run.

### The checks

| Check | Fires when | Scope |
|---|---|---|
| `speculative-abstraction` | an interface or abstract class has exactly one implementor in the file or a directly importing module | pending writes, diffs, repository audits |
| `exported-unused` | an export has no other textual reference in the scanned multi-module corpus | repository audits only; relative to the paths scanned |
| `new-dependency` | a dependency manifest gains a package and the dependency section is present in the available change | pending writes and diffs only |
| `new-config-surface` | a known config-framework API appears in added code | pending writes and diffs only |
| `unused-default-param` | a parameter has a default but is not read | pending writes, diffs, repository audits |
| `large-first-write` | a newly created JS/TS file exceeds the substantive-line threshold | pending writes and diffs only |

Three more were **deleted on evidence** — `config-for-constant` fired on 47.9%
of real files, `single-call-wrapper` matched a pattern that was not a defect,
and `new-file` was a constant rather than a heuristic.

## What we measured

Offcut also ships a persistent mode that re-asks the question every turn and
challenges a write before the file exists. We tried four times to show it
changes what an agent builds, and could not.

| Experiment | Question | Result |
|---|---|---|
| Premise | Do agents over-build at all? | **No structural over-building** in 12 runs |
| Benchmark | Does a challenge change output? | Untestable — nothing occurred to prevent |
| Framing | Does "is it justified?" beat "what's cheapest?" | **No** — and **0 structural over-building across 90 runs** |
| Efficacy discovery | When a signal-shaped opportunity exists, does `full` remove it? | **No estimate** — Codex `gpt-5.6-sol` produced **0/24** targets on 12 tickets, so the frozen rule never opened `off` vs `full`. Acceptance 22/24; frozen primary 17/24. |

The framing experiment addressed the obvious objection to the premise run. It used multi-file,
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

The separate live reuse harness is qualitative, not efficacy evidence. Its
corrected 16-run acceptance result is 14/16; the five-ticket grid shows a 2.47%
increase in noncached input for `full`, with one replicate and no terse control.
See [`bench/LIVE-REUSE-RESULTS.md`](bench/LIVE-REUSE-RESULTS.md). It supports no
token-saving claim and does not justify another hook.

## Limits

### The persistent mode is unproven

Not disproven — unproven, on tasks up to multi-file scale, for one model. Use
it if you like the reminder. The review and audit commands are deterministic,
have their context limits listed above, and do not depend on the efficacy claim.

### Structural checks are JavaScript/TypeScript only

They are syntax-level. Ungated they produced 65% false positives on Python and
100% on JSON, so they are gated by extension.

| | |
|---|---|
| Structural signals | `.js` `.mjs` `.cjs` `.ts` |
| Dependency checks | `package.json`, `requirements.txt`, `go.mod`, `Cargo.toml` |
| No structural signals | `.jsx` `.tsx` and other source languages the lightweight lexer does not parse |
| Reminder only | every remaining file type |

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
| Cursor 3.17.19 | full | yes |

### No competitor win claim

Offcut has not been benchmarked against Caveman, Ponytail, or anything similar.
The response-style harness now defines the controls and claim gates needed
before publishing a percentage, but competitor arms remain deferred. Caveman
compresses prose while Ponytail governs construction, so treating them as one
token leaderboard would measure different products as if they were equivalent.
The [benchmark protocol](docs/development/STYLE-BENCHMARK.md) defines the source,
license, acceptance, completeness, and cache controls a future comparison must
meet. The numbers go here whichever way they fall.

Two confounds were found and removed while establishing that, so nobody has to
rediscover them. Ponytail's source sits in the plugin cache that feeds the
real-code corpus, so it is classified as the comparison subject and kept out of
the publishable rate. And Offcut's skill descriptions briefly ceded the generic
"review for over-engineering" phrasing to ponytail by name, which would have
decided an activation comparison before it ran;
[`COEXIST.md`](docs/development/COEXIST.md) §5 records that.

## How it works

```
SessionStart      write mode file, deliver the ruleset
UserPromptSubmit  re-ask the question or switch session response style
PreToolUse        run checks on the pending write, challenge via context
PostToolUse       name what got added
SubagentStart     subagents inherit the mode (Claude/Codex)
PreToolUse        rewrite only the Subagent task to inherit it (Cursor)
```

Claude Code, Codex and Grok share one PascalCase adapter; Cursor uses its native
flat, camelCase hook config. Payloads, output fields, tool names and subagent
delivery are normalized in `hooks/host.js`. No hook script contains a host name,
and CI enforces that.

Offcut **never denies a tool call.** It knows the shape of a write, not whether
the requirement is right. Cursor subagent inheritance appends the ruleset to a
`Subagent` task through an input-only rewrite and casts no permission vote;
source-code write input is never rewritten.

Every hook exits 0 on malformed input, empty stdin, a BOM, and stdin that never
closes. A hook that hangs freezes a session, so that case is tested explicitly.

Runs alongside other plugins. Measured with a second context-injecting hook on
the same events: **both survive** on Claude Code and Codex.

## Diagnostics

```bash
node hooks/doctor.js
```

Reports state, last activation, detected host and tier, ruleset readability,
which copy of the ruleset actually reached the model, hook script presence,
subagent coverage and language coverage. Read-only — it prints the repair
command rather than editing your config, and exits non-zero when unhealthy so
it works in CI.

With concurrent sessions, the default diagnostic labels `active` as the latest
session mirror rather than claiming it belongs to the caller. Statusline
integrations that provide `session_id` display the exact session mode.

Two copies can be installed at once: a checkout you edit, and a host-managed
plugin copy that registers itself through its own bundled manifest. The host's
config never names the second one, so doctor asks the hook that ran which copy
it read, and warns when that is not the one you are editing.
Cursor may load native and Claude-compatible copies together; correlated hook
deliveries are claimed once so reminders and mode counters are not duplicated.

## Develop

```bash
node --test tests/*.test.js   # full suite
node bench/fp.mjs             # labeled corpus
node bench/realcode.mjs       # real-code corpus
node scripts/scan.mjs hooks   # dogfood
```

Zero runtime dependencies. Node standard library only.

Development history, phase specifications, host measurements and coexistence
findings are under [`docs/development/`](docs/development/).

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 xyzbk.
