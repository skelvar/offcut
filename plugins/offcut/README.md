<div align="center">

<img src="assets/offcut-mark.svg" width="96" alt="Offcut logo">

# Offcut

**Less code is not the goal. Less unnecessary code is.**

Offcut helps coding agents build the cheapest correct thing in the right place.

[Install](#install) · [How it works](#how-it-works) · [Controls](#controls) · [Safety](#safety) · [Proof](#proof)

</div>

## Install

Requires Git and Node.js 20 or newer.

```bash
npx --yes github:skelvar/offcut
```

Open a new agent session. Offcut detects Codex, Claude Code, Cursor, and Grok
Build, then installs only for the agents already on your machine.

## What changes

- Agents question unnecessary dependencies, abstractions, configuration, and
  duplicate guards before writing them.
- Six deterministic checks flag common overengineering patterns in JavaScript
  and TypeScript.
- Replies stay concise by default without hiding errors, evidence, or important
  caveats.

A small example:

```js
// Before: configuration nobody needs to change
const timeout = Number(process.env.REQUEST_TIMEOUT ?? 5000);

// After: one honest constant
const REQUEST_TIMEOUT_MS = 5000;
```

Add configuration when somebody needs to configure it. Until then, it is just
another surface to maintain.

## How it works

Before code is written, Offcut asks:

1. What breaks if this is skipped?
2. Does the codebase or platform already solve it?
3. Can the standard library or an installed dependency own it?
4. What is the smallest change that keeps the requirement correct?
5. Which boundary already crossed by every caller should own the rule?

The deterministic scanner is optional. It uses no model call, network request,
or runtime dependency.

## Controls

| Command | Effect |
|---|---|
| `/offcut full` | Apply the construction rules every turn |
| `/offcut lite` | Remind the agent every third turn |
| `/offcut strict` | Challenge new dependencies before writing |
| `/offcut off` | Disable Offcut for this session |
| `/offcut default <mode>` | Choose the mode for future sessions |

Concise responses are the default while Offcut is active. Change only the
response style with:

```text
/offcut concise on
/offcut concise off
```

Turning concise responses off leaves the construction rules active.

### Review existing code

| Command | Effect |
|---|---|
| `/offcut-review` | Review the current diff |
| `/offcut-audit` | Review a repository and rank findings |
| `/offcut-help` | Show commands and the active mode |

The scanner also runs directly:

```bash
node scripts/scan.mjs src/
git diff | node scripts/scan.mjs --diff -
```

`exported-unused` runs in repository audits only; relative to the paths scanned.
The remaining checks and their exact scopes are documented in the
[development notes](docs/development/README.md).

## Marketplace installs

| Agent | Commands |
|---|---|
| Codex | `codex plugin marketplace add skelvar/offcut --ref main`<br>`codex plugin add offcut@skelvar` |
| Claude Code | `/plugin marketplace add skelvar/offcut`<br>`/plugin install offcut@skelvar` |
| Cursor | Public listing pending review; use the universal installer today. |
| Grok Build | Use the universal installer. |

The Cursor package is ready for submission at
[cursor.com/marketplace/publish](https://cursor.com/marketplace/publish).

## Safety

Offcut does not change model or provider settings. It does not send source code
anywhere. Existing instruction and hook files are preserved, and the first
change to each file gets a `*.offcut-backup`.

Write-time findings are questions, not permission decisions. Offcut never
denies a tool call. Cursor subagent inheritance uses an input-only rewrite and casts no permission vote.

Run the read-only diagnostic at any time:

```bash
node ~/.offcut/runtime/hooks/doctor.js
```

## Support

The full automated suite runs on Windows, Ubuntu Linux, and macOS. Real-harness
E2E is Windows only today; see the dated [host matrix](docs/development/HOSTS.md)
for what has been exercised on each agent.

## Proof

The repository includes its tests, labeled corpora, raw benchmark runs, and the
code that produced them. Start with the [evidence map](docs/development/README.md)
and [response-efficiency receipt](docs/development/STYLE-BENCHMARK.md).

No token-saving claim is made until the cache-aware benchmark supports it.

## Uninstall

```bash
npx --yes github:skelvar/offcut -- --uninstall
```

Marketplace installs can be removed with their agent's plugin manager. Offcut
removes only its marked rules and tagged hooks; it leaves other content alone.

## Development

```bash
node --test tests/*.test.js
node bench/fp.mjs
node scripts/scan.mjs hooks
```

Offcut has zero runtime dependencies. `AGENTS.md` is generated from the kernel;
run `node scripts/build-agents-md.js` after changing it.

## License

MIT — see [LICENSE](LICENSE).
