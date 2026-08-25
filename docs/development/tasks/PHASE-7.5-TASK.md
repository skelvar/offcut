# Phase 7.5 — Close-out and re-benchmark

Task specification for the implementing agent. Read this, `bench/RESULTS.md`,
`bench/SIGNALS.md`, and `HOSTS.md` before writing code.

This phase exists so Phase 8 starts with nothing behind it. Two jobs: **re-run
the benchmark against the corrected detector**, and **close or explicitly retire
every open item** from Phases 1–7.

---

## Why the benchmark must be re-run

`bench/RESULTS.md` reports "no detectable effect" from 40 paid runs. That number
is **not valid for the current build**, and the reason matters.

The signals fired 30 times in that experiment and **all 30 were false
positives** — flagging a factory the prompt mandated, a shared module the prompt
asked for, and exports imported in the same diff. The output did not change
because the advice was wrong.

Since then the detector changed substantially:

| | Phase 5 build | now |
|---|---|---|
| signals | 9 | 7 (`new-file`, `config-for-constant` deleted) |
| comment handling | matched prose as code | comments stripped |
| file-type gating | none | JS/TS only |
| real-code fire rate | 51.1% | 4.4% |
| labeled negatives | 30/30 false | 0/40 |

So the honest state is: **the product question is unanswered.** Phase 5 measured
a broken detector. Nobody has yet tested whether a *correct* challenge changes
what an agent builds.

That is the question that decides whether Offcut is worth shipping, and it is
now answerable for the first time.

## Job 1 — Re-run the benchmark

Same harness, same discipline as Phase 5 (`tasks/PHASE-5-TASK.md` still
governs — read its "metric trap" and "what will corrupt the result" sections).

Do not change the harness beyond what is required. It has blind scoring,
per-run clean state, byte-identical prompts, and interleaved arms; all of that
was verified in review and must survive.

**Required changes to the fixture set.** The four existing tasks are now a poor
test: every accepted solution is 10–30 lines of JS that the corrected signals
correctly stay silent on. A benchmark where the treatment can never fire
measures nothing.

Add tasks that **invite** the over-engineering the surviving signals detect:

- a request whose obvious solution is an interface with one implementation
- a request that tempts adding a dependency for a few lines of work
- a request where a wrapper around a single call is the tempting shape
- a request with an easy unused-default-param or dead-export outcome

Keep at least two original tasks as controls — if the new tasks fire and the old
ones stay silent, that is itself evidence the detector is discriminating.

**Record fired signals per run as a first-class metric**, not something to be
recovered from `state-after.json` afterwards. Phase 5 undercounted because it
only kept the first challenge per phase. The columns that matter now:

| | |
|---|---|
| task passed | gating, as before |
| **signals fired** | which, how many |
| **flagged pattern survived** | did the thing the signal named still ship? |
| files / deps / exports / abstractions / config keys / lines | as before |

The second and third together are the answer. Phase 5's sharpest finding —
fired 5/5, survived 5/5 — was only visible because someone cross-referenced
state files by hand. Make it a column.

**Scale:** two arms (`off`, `full`), five runs per task per arm, one host, exact
model ID. Same as Phase 5. Get the harness right on `--stub` before spending.

## Job 2 — Close the open items

Every item below is currently outstanding. For each: close it, or write down
why it is being retired unclosed. **Neither silence nor "still unverified"
without a reason is acceptable** — that is how a project accumulates the exact
absence-read-as-success failures this one keeps hitting.

### Measured gaps (`HOSTS.md`)

| # | item | current status |
|---|---|---|
| 1 | `${CLAUDE_PLUGIN_ROOT}` on the **plugin-install** path | fixed for settings installs; plugin path unmeasured |
| 4 | Real truncation threshold | unverified; flag handling tested only synthetically |
| — | `/offcut` mode switch on Grok | unverified |
| — | `/offcut default` survives restart, Claude + Grok | unverified |
| — | Subagent inheritance on Codex + Grok | unverified |

The probe (`tools/install-probe.mjs`) settles most of these and costs nothing.
Item 1 needs an actual plugin install rather than a settings merge.

### Debt markers

Two `offcut:` markers in `hooks/state.js`: `turn-*` and `fired-*` files are
never pruned. Real observed growth: 46 files in one day of development.

**These belong to Phase 8** (resilience). Do not fix them here — just confirm
they are named in `tasks/PHASE-8-TASK.md` so they cannot be lost between phases.

### Signal watch-list

`single-call-wrapper` sits at 3.1% and its own hand sample concedes many
matches are conventional (`generateToken` → `crypto.randomBytes().toString()`).
The signal matches the pattern correctly; the pattern is not a defect.

If the re-benchmark shows it firing on solutions that are fine, delete it. Do
not tune it — there is no text-level way to separate a thin helper worth keeping
from one worth inlining.

### Documentation truth

`README.md` and `bench/RESULTS.md` must not outlive this phase making claims the
new numbers contradict. In particular `RESULTS.md` currently reports a null
result from a build that no longer exists; it needs a header saying so, or
replacement.

---

## Definition of done

- [ ] Fixture set extended with tasks that invite what the surviving signals
      detect; at least two originals kept as controls
- [ ] `signals fired` and `flagged pattern survived` recorded per run as columns
- [ ] Two arms × five runs × all tasks, interleaved, exact model ID
- [ ] `bench/RESULTS.md` replaced or clearly superseded, with the old result
      marked as measured against a detector that no longer exists
- [ ] A plain written answer to: **does a correct challenge change what the
      agent builds?** — including "no" if that is the finding
- [ ] Every `HOSTS.md` item above closed or retired with a written reason
- [ ] Phase 8 spec confirmed to name both state-pruning markers
- [ ] `single-call-wrapper` verdict recorded against the new runs
- [ ] All 123 existing tests pass
- [ ] `node bench/fp.mjs` still 0/40; `node bench/realcode.mjs` still under 10%

---

## The outcome that matters

If a correct challenge still does not change the output, then Offcut detects
over-engineering accurately and cannot prevent it — and the honest product is a
review/audit tool, not a persistent mode. That is a real finding, not a failure,
and it should be published as plainly as a positive one.

If it does change the output, that is the first evidence in this project that
the core idea works, and everything after it is justified.

Either way this phase produces the answer the project has been missing since
Phase 1. Do not soften it.

---

## Working agreement

- Branch: `phase-7-5-closeout`, off current `main`. Do not merge it yourself.
- Commit in logical steps, not one squashed commit.
- **No AI attribution in commit messages** — no `Co-Authored-By`, no "Generated
  with" footer. Author is the repo owner alone. Hard requirement.
- Model calls cost money. Validate the whole grid on `--stub` first.
- This project has been wrong eight times by reading absence of a negative
  signal as success — most recently a 0/40 score that meant the corpus was too
  easy, and a gated signal set that went silent on Python while the badge read
  healthy. Assume there is a ninth in here.
- Open a PR against `main` stating the answer to the product question in the
  first paragraph, whichever way it went.
