<div align="center">

# Offcut

**Build the cheapest correct thing in the right place.**

Persistent construction discipline, concise agent responses, and deterministic
over-engineering checks for coding agents.

[Install](#install) · [Use](#use-offcut) · [Review code](#review-code) · [Proof](#proof-you-can-inspect) · [Uninstall](#uninstall)

</div>

---

An *offcut* is material left over after something is cut to size: the piece
nobody asked for and nobody uses. Offcut helps coding agents avoid creating it.

Coding agents can build almost anything. The expensive part is everything they
build around the thing you actually asked for: another layer, another config,
another dependency, another abstraction waiting for a future that may never
arrive. Offcut puts that pressure in the opposite direction—before the code
lands, not during cleanup six months later.

It adds two independent layers:

- **Construction rules** ask whether code needs to exist, whether the platform
  already solves it, what the cheapest correct implementation is, and which
  boundary owns it.
- **Deterministic checks** flag six common forms of unnecessary code in
  JavaScript and TypeScript. They use no model call, network, or dependencies.

Offcut also keeps agent responses concise by default. Users can turn that style
off without disabling the construction rules.

## Install

Requirements: Git and Node.js 20 or newer.

### One command — Codex, Claude Code, Cursor, and Grok Build

```bash
npx --yes github:skelvar/offcut
```

The universal installer is the recommended route. It detects the agents already
installed on the machine and gives each one native rules and lifecycle hooks.

### Or install from a marketplace

| Agent | Install |
|---|---|
| Codex | `codex plugin marketplace add skelvar/offcut --ref main`<br>`codex plugin add offcut@skelvar` |
| Claude Code | `/plugin marketplace add skelvar/offcut`<br>`/plugin install offcut@skelvar` |
| Cursor | Marketplace package ready; public listing pending review. Use the universal command today. |
| Grok Build | Use the universal command; Grok does not expose the same managed marketplace route. |

The Codex and Claude packages are both published from the **Skelvar** marketplace
as **`offcut@skelvar`**. The Cursor package is ready for submission at
[cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

Open a new agent session after installation. The installer detects existing
harness directories and installs only where a supported harness is already
present. It first copies its runtime to `~/.offcut/runtime`, so hooks never
depend on npm's temporary cache. It does not change model or provider settings.

| Harness | Native rules | Lifecycle hooks |
|---|---|---|
| Codex | `~/.codex/AGENTS.override.md` or `AGENTS.md` | `~/.codex/hooks.json` |
| Claude Code | `~/.claude/CLAUDE.md` | `~/.claude/settings.json` |
| Cursor | `~/.cursor/rules/offcut.mdc` | `~/.cursor/hooks.json` |
| Grok Build | `~/.grok/AGENTS.md` | `~/.grok/hooks/offcut-hooks.json` |

Existing instruction and hook files are preserved. Offcut manages one marked
rules block and tagged hook entries; reinstall updates only those entries.
One-time `*.offcut-backup` files are created before the first change.

Run the read-only diagnostic after installing:

```bash
node ~/.offcut/runtime/hooks/doctor.js
```

It reports the active rules, hooks, mode, language coverage, duplicate installs,
and repair commands. It does not edit configuration.

Managed plugin installation supplies hooks and command skills. The universal
installer additionally makes the construction rules a native global default,
independent of skill activation.

Codex headless sessions must trust hooks for write-time checks to run. Cursor and
Grok can also load the generated [AGENTS.md](AGENTS.md) as project instructions
without hooks; in that fallback, construction rules work but modes and
write-time challenges do not.

## Use Offcut

Offcut starts in `full` mode:

| Command | Effect |
|---|---|
| `/offcut full` | Construction reminder every turn |
| `/offcut lite` | Reminder every third turn |
| `/offcut strict` | Reminder every turn; challenges new dependencies before writing |
| `/offcut off` | Disable Offcut for this session |
| `/offcut default <mode>` | Set the mode for future sessions |

### Response style

Concise responses are the default while Offcut is active. They lead with the
result and remove routine narration while preserving evidence, material caveats,
verification, exact errors, and safety-critical information.

```text
/offcut concise on     # concise responses for this session
/offcut concise off    # normal responses; construction rules stay active
```

This changes only Offcut's session guidance. It does not edit Claude
`outputStyle`, Codex `model_verbosity`, or another harness's model settings.

## Review code

Use the agent commands:

| Command | Effect |
|---|---|
| `/offcut-review` | Check a diff |
| `/offcut-audit` | Check a repository and rank findings |
| `/offcut-help` | Show modes, commands, and host limits |

Or run the scanner directly:

```bash
node scripts/scan.mjs src/                   # scan a tree
git diff | node scripts/scan.mjs --diff -    # scan a change
```

Example output:

```text
src/api/index.js (1)
  [exported-unused]          exported symbol has no other reference in the scanned scope
src/config/loader.ts (1)
  [speculative-abstraction] one implementation — is the indirection carrying its weight?
```

The scanner is read-only. It makes no network requests, writes no files, and
starts no subprocesses.

### Checks

| Check | Fires when | Scope |
|---|---|---|
| `speculative-abstraction` | An interface or abstract class has one implementation | Writes, diffs, repository audits |
| `exported-unused` | An export has no other reference | Repository audits only; relative to the paths scanned |
| `new-dependency` | A dependency manifest gains a package | Writes and diffs |
| `new-config-surface` | Added code uses a known config-framework API | Writes and diffs |
| `unused-default-param` | A defaulted parameter is never read | Writes, diffs, repository audits |
| `large-first-write` | A new JS/TS file crosses the substantive-line threshold | Writes and diffs |

Write-time findings are challenges, not hard blocks. Offcut never denies a tool
call or rewrites source-code input. Cursor subagent inheritance uses an
input-only rewrite and casts no permission vote.

## Built for the agents you already use

The full automated suite runs on Windows, Ubuntu Linux, and macOS on every push
and pull request. One repository gives Codex, Claude Code, Cursor, and Grok Build
the same construction discipline without changing model settings.

| Harness | Persistent mode | Commands |
|---|---|---|
| Claude Code | Full | Yes |
| Codex | Full | Yes |
| Cursor | Full | Yes |
| Grok Build | Native rules | Yes |
| Other AGENTS.md or skill hosts | Project rules only | Yes |

Real-harness E2E is Windows only today; the full automated suite is the
cross-platform contract while the dated host matrix continues to grow.

Construction rules and concise responses work with any language. The optional
deterministic structural scanner currently targets JavaScript and TypeScript,
with dependency checks for Node, Python, Go, and Rust manifests.

## Proof you can inspect

Offcut does not ask you to trust a slogan. The repository ships its tests,
labeled corpora, raw runs, benchmark receipts, and the code that produced them.

The deterministic scanner records zero findings across its 95-case labeled
negative corpus, while every shipping check fires on its positive fixture. The
concise-style benchmark includes cache-aware telemetry and blinded completeness
review instead of grading shorter output as automatically better.

Read the [evidence map](docs/development/README.md),
[host verification](docs/development/HOSTS.md), and
[response-efficiency receipt](docs/development/STYLE-BENCHMARK.md).

## Uninstall

Universal install:

```bash
npx --yes github:skelvar/offcut -- --uninstall
```

Claude Code marketplace install:

```text
claude plugin uninstall offcut@skelvar
claude plugin marketplace remove skelvar
```

Uninstall removes only Offcut's managed rules and hooks. It preserves other
plugins and foreign content. The optional `~/.offcut/` state directory is kept;
delete it only if you also want to discard saved modes and diagnostics.

## Development

```bash
node --test tests/*.test.js
node bench/fp.mjs
node scripts/scan.mjs hooks
```

Offcut has zero runtime dependencies and uses only the Node.js standard library.
`AGENTS.md` is generated from `skills/offcut/SKILL.md`; rebuild it with
`node scripts/build-agents-md.js` instead of editing it directly.

## License

MIT — see [LICENSE](LICENSE). Copyright (c) 2026 skelvar.
