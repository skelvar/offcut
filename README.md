<div align="center">

<img src="assets/offcut-mark.svg" width="96" alt="Offcut logo">

# Offcut

**Catches the code your agent should not have written.**

A deterministic check for over-engineering in a diff. No model call, no network,
no dependencies.

</div>

## Try it on your last change

```bash
git diff | npx --yes github:skelvar/offcut scan --diff -
```

```text
src/phone.js (1)
  [new-dependency] Offcut: new dependency — what does this replace that four lines could not do?
```

Six checks, each phrased as a question: a new dependency, one implementation
behind an interface, a parameter with a default that is never read, a
configuration surface nobody asked for, an exported symbol nothing references, a
large first write. They apply to JavaScript and TypeScript. They never block
anything.
`exported-unused` runs in repository audits only; relative to the paths scanned.

## On pull requests

```yaml
# .github/workflows/offcut.yml
on: pull_request
permissions:
  contents: read
jobs:
  offcut:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
        with:
          fetch-depth: 0
      - uses: skelvar/offcut@main
```

Findings appear as file annotations on the pull request and in the job summary.
The step always exits 0; findings are questions for the reviewer, not a gate.

## Evidence

- False positives: 0 of 95 clean files across all six checks
  ([`bench/fp.mjs`](bench/fp.mjs); the 95-run negative corpus lives in
  [skelvar/offcut-evidence](https://github.com/skelvar/offcut-evidence), cloned
  as a sibling directory).
- Recall on 27 real agent-authored pull requests: 4 of 10 labeled over-builds
  caught, 0 of 17 clean diffs flagged
  ([`bench/recall/RESULTS.md`](bench/recall/RESULTS.md)). Labels were written
  by one rater before scanning; treat this as an estimate, and read the list of
  misses before relying on it.

No token, cost, or lines-of-code reduction is claimed. A protocol we tested for
post-implementation self-review lost to one ordinary host review and was
removed ([`docs/development/CLOSE-RESULTS.md`](docs/development/CLOSE-RESULTS.md)).

## Also: construction rules for your agent

```bash
npx --yes github:skelvar/offcut
```

Installs a short rule set into Codex, Claude Code, Cursor, and Grok Build (only
the ones already on your machine). Before writing, the agent asks what breaks if
this is skipped, whether the codebase or platform already does it, what the
smallest correct change is, and which boundary should own it. If you already use
[Ponytail](https://github.com/DietrichGebert/ponytail) for that, keep it; the
scan works on any diff regardless of who wrote it.

| Command | Effect |
|---|---|
| `/offcut full` | Apply the construction rules every turn |
| `/offcut lite` | Remind the agent every third turn |
| `/offcut strict` | Challenge new dependencies before writing |
| `/offcut off` | Disable Offcut for this session |
| `/offcut default <mode>` | Choose the mode for future sessions |
| `/offcut-review` | Scan the current diff from inside the agent |
| `/offcut-audit` | Scan a repository and rank findings |
| `/offcut-help` | Show commands and the active mode |

Concise responses are the default while Offcut is active. Change only the
response style with `/offcut concise on` or `/offcut concise off`; the
construction rules stay active either way.

Marketplace installs:

| Agent | Commands |
|---|---|
| Codex | `codex plugin marketplace add skelvar/offcut --ref main`<br>`codex plugin add offcut@skelvar` |
| Claude Code | `/plugin marketplace add skelvar/offcut`<br>`/plugin install offcut@skelvar` |
| Cursor | Public listing pending review ([cursor.com/marketplace/publish](https://cursor.com/marketplace/publish)); use the universal installer today. |
| Grok Build | Use the universal installer. |

Uninstall with `npx --yes github:skelvar/offcut -- --uninstall`. Existing
instruction and hook files are preserved; the first change to each gets a
`*.offcut-backup`. Offcut never denies a tool call, never changes model or
provider settings, and never sends source code anywhere. Cursor subagent
inheritance uses an input-only rewrite and casts no permission vote.

## Support

The full automated suite runs on Windows, Ubuntu Linux, and macOS. Real-harness
E2E is Windows only today; see the dated [host matrix](docs/development/HOSTS.md).

## Development

```bash
node --test tests/*.test.js
node bench/fp.mjs
node bench/recall.mjs
node scripts/build-agents-md.js   # AGENTS.md is generated from rules/offcut.md
```

Harness notes and benchmark receipts: [docs/development](docs/development/README.md).

## License

MIT — see [LICENSE](LICENSE).
