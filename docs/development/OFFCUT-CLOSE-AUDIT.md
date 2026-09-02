# Offcut Close — architecture audit

**Date:** 2026-09-01<br>
**Repo:** https://github.com/skelvar/offcut (local checkout `D:\rightseam`, v0.3.0)<br>
**Kind:** Research and architecture audit only. No feature was implemented.<br>
**Revision:** Corrected against the current checkout and primary sources on 2026-09-01. Product behavior remains unimplemented and unproven.

Evidence labels: **fact** = official docs; **observed** = this repo’s measured harness work (`docs/development/HOSTS.md` and tests); **inference**; **unknown**.

---

## 1. Executive verdict

**Conditional go for a measured prototype; no-go for product claims yet.** Prototype an opt-in **Offcut Close** workflow. Do not ship an always-on loop, automatic post-write review, persistent lessons, or anything that rewrites `AGENTS.md` / the kernel until controlled evaluation shows an advantage over one ordinary review pass.

Offcut can add a **bounded, user-invoked closure protocol**. It cannot honestly add a **native, cross-harness, always-on defect loop**.

Repeated review rounds are an observed user problem, not yet a measured Offcut problem statement. Most causes are **model and harness limitations**: discovery quality, self-evaluation bias, fake verification, and loss of state. Offcut's plausible contribution is a small workflow interface over **a testable acceptance contract, external evidence, bounded repair, and a closure receipt**. Finding identity and curated lessons remain hypotheses, not proven differentiators.

That fits Offcut’s identity only if Close is a **command, not a mode**. The kernel already says: do not turn Offcut into an audit unless asked. An automatic implement→review→fix loop after every write would violate that, burn tokens, and compete with Claude `/code-review`, Codex `/review`, and Cursor `/goal`.

| Decision | Choice |
|---|---|
| Prototype invocation | `/offcut-close`; test `/offcut close` only as a host-specific alias |
| Name | Offcut Close (internal protocol: Closure) |
| Session state | Controller-owned, bounded run record under `~/.offcut/`; never injected wholesale |
| Persistent learning | Deferred until Close itself beats the baseline and a recurrence benchmark proves value |
| Forbidden | Auto-edit `AGENTS.md` / kernel; auto-after-write; `/offcut loop on` |
| Claim | Closure discipline and defect traceability — not “smarter models” |

**Do not build** if the goal is a marketable “agents now converge” feature. Prototype only to test whether **evidence-grounded closure discipline** measurably helps. Delete the prototype if it does not beat one good review under matched budgets.

### Evidence limit

Research supports iterative refinement under some conditions, but not the blanket claim that an LLM improves by repeatedly criticizing itself:

- **Self-Refine** reported gains from iterative self-feedback across seven tasks; it did not establish a universal software-defect closure mechanism: https://arxiv.org/abs/2303.17651
- **Reflexion** stored verbal feedback in episodic memory and reported task gains, but its feedback sources included environment signals; this is not model-weight learning: https://arxiv.org/abs/2303.11366
- **CRITIC** found benefit from tool-interactive critique, supporting external execution evidence over unsupported reflection: https://arxiv.org/abs/2305.11738
- **Large Language Models Cannot Self-Correct Reasoning Yet** found that intrinsic self-correction without external feedback can fail or degrade results: https://arxiv.org/abs/2310.01798
- A 2025 study of small code models found weak reflective revision from prompting alone; its reported improvements required training. Offcut cannot assume those training gains transfer to a prompt-only plugin: https://arxiv.org/abs/2505.23060
- Anthropic describes evaluator-optimizer workflows as useful when criteria are clear and iterative improvement is measurable. Its 2026 coding harness used a separate evaluator, testable sprint contracts, and browser execution; it also reported substantial cost and latency: https://www.anthropic.com/engineering/building-effective-agents and https://www.anthropic.com/engineering/harness-design-long-running-apps

Therefore the prototype must be described as **test-time workflow scaffolding**, not self-improvement or learning.

---

## 2. Current Offcut architecture

Offcut v0.3 (`@skelvar/offcut`) is a **construction-discipline plugin**: a cheapness kernel, six deterministic JS/TS signals, host hooks that inject reminders/challenges, and three one-shot skills. Zero runtime dependencies. Node ≥20.

### Delivery layers

| Layer | File | Role |
|---|---|---|
| Kernel | `rules/offcut.md` | Source of truth. ≤380 words. Contract-tested. |
| Generated artifacts | `AGENTS.md`, `skills/offcut/SKILL.md`, `rules/offcut.mdc` | Built by `scripts/build-agents-md.js`. Do not edit. |
| Host seam | `hooks/host.js` | Only file allowed to name hosts. Detect, normalize, `emit`, `gate`. |
| Lifecycle | `hooks/activate.js`, `prompt.js`, `pre-write.js`, `post-write.js`, `subagent.js`, `session-end.js` | Mode, reminder, write challenges, inheritance, prune. |
| State | `hooks/state.js` → `~/.offcut/` | Mode, style, turn counter, fired-signal suppression, delivery claims. |
| Signals | `hooks/signals.js` | Shared by hooks and `scripts/scan.mjs`. |
| Commands | `skills/offcut-review`, `offcut-audit`, `offcut-help` | One-shot. Explicitly: **do not write Offcut state**. |
| Install | `tools/bootstrap.mjs` → `~/.offcut/runtime` + `tools/install.mjs` | Merge-only hooks; managed kernel blocks in host instruction files. |
| Plugin package | `plugins/offcut/` | Generated by `scripts/build-plugin-package.mjs`. Marketplace copy. |

### Generated vs source

**Source:** `rules/offcut.md`, `hooks/*`, `adapters/*`, `scripts/scan.mjs`, `skills/offcut-{review,audit,help}`, `tools/*`, plugin manifests.

**Generated — do not edit directly:**

- `AGENTS.md`, `skills/offcut/SKILL.md`, `rules/offcut.mdc` ← `scripts/build-agents-md.js`
- `plugins/offcut/**` ← `scripts/build-plugin-package.mjs` (byte-identical to runtime paths; `tests/distribution.test.js` enforces this)

`hooks/hooks.json` and `adapters/claude/hooks.json` are the same Claude-shaped manifest. Codex uses that default (`hooks/hooks.json`; `.codex-plugin/plugin.json` has no `hooks` override). Cursor uses `adapters/cursor/hooks.json` (camelCase, flat handlers, `Write` + `Subagent` rewrite).

### What Offcut already persists

**Observed:** session mode (`mode-<id>`), style, lite-turn counter, once-per-session signal suppression (`fired-*`), atomic delivery claims (`claim-*`), served-root witness. SessionEnd deletes `turn-*` and prunes orphans older than 7 days; **keeps `fired-*`** so Codex resume suppression still works.

There is **no** findings ledger, no lessons file, no Stop hook, no close command. `parseOffcutCommand` in `hooks/prompt.js` handles only mode/style. Any other `/offcut …` skips the reminder and writes nothing.

Existing one-shot skills are invoked by their skill names (`/offcut-review`, `/offcut-audit`, `/offcut-help`). No current test proves that `/offcut close` loads a skill on every host. In fact, the host evidence below records at least one slash-command interception before hook delivery. The portable prototype name is therefore `/offcut-close` plus natural-language intent. `/offcut close` is only a candidate alias until each supported harness proves it end to end.

### Identity constraints that Close must not break

From `rules/offcut.md` (**fact** of the product):

- Cheapness never overrides correctness, security, auth, privacy, a11y, integrity, or requested verification.
- Do not turn Offcut into an audit unless asked.
- Do not add checks because Offcut is active.
- Write-time findings are questions. Offcut never denies a tool call (`README.md`; `pre-write.js` default is context).
- Commands leave mode state untouched (`skills/offcut-help/SKILL.md`).

Phase 11 efficacy (**observed**): no efficacy estimate for persistent construction mode. Target prevalence 0/24. That is not evidence Close would fail; it is evidence Offcut does not currently claim it makes models better. `STYLE-BENCHMARK.md` forbids general token/cost claims.

---

## 3. Failure taxonomy

| Failure | Definition | Offcut influence | Remains a model limit? |
|---|---|---|---|
| **New defect** | First appearance of a broken invariant | Protocol can require an inspect step | Yes — discovery |
| **Previously missed** | Present earlier, not reported | Ledger keeps open IDs | Partial — must be seen once |
| **Reopened** | Closed, then the same validated failure recurs | Reopen an existing controller ID when owner + observable failure match | Partial — semantic matching can still be wrong |
| **Incomplete fix** | Same ID still fails the stated proof | Require verify evidence before `closed` | Yes — agents fake tests |
| **Fix regression** | New ID caused by the patch | Re-run prior proofs; new ID | Yes — choosing what to rerun |
| **Duplicate wording** | Same defect, different prose | Reuse an ID only when deterministic evidence or a reviewed owner + failure match supports it | Partial — prose hashing does not solve identity |
| **Speculative churn** | Finding without repro or user impact | Severity + “needs evidence” + cheapness stop | Partial |
| **Scope expansion** | Review invents new work | User approval before new IDs outside original scope | No if enforced |
| **Contradictory reviewers** | Two owners, opposite calls | One controller record; external evidence wins, otherwise `needs-user` | Yes — judgment |
| **Stale after edit** | Finding cites code that changed | Mark `needs-revalidation`; only new execution evidence closes or reopens it | Partial |
| **Tests pass, flow fails** | Accept script green, user path broken | Require a named user-flow proof | Yes — highly gameable |
| **Cross-session repeat** | Same repo mistake next chat | Only via promoted lessons, not raw ledger | Yes if never promoted |

Offcut’s scanner cannot find most of these. Signals detect construction smells (`new-dependency`, `speculative-abstraction`, `unused-default-param`, …), not auth holes or broken checkout. Close must not pretend `scan.mjs` is a defect oracle. The scanner is an optional sidecar for construction IDs only.

---

## 4. Official host capability matrix

Do not assume hook stdout reaches the model. Offcut already disproved that on Grok and on Cursor `subagentStart`.

### Claude Code — **fact** unless noted

- Hooks: https://code.claude.com/docs/en/hooks — `Stop` / `SubagentStop` can `decision: "block"` or return `hookSpecificOutput.additionalContext`. `stop_hook_active` is true on continuations. Current official documentation says Claude Code overrides the hook and ends the turn after **8 consecutive blocks**. Injected hook output is capped at 10,000 characters. No undocumented environment override is assumed.
- `SessionStart` sources include `startup|resume|clear|compact|fork`. `prompt_cache_likely_expired` is documented on SessionStart.
- Memory: https://code.claude.com/docs/en/memory — `CLAUDE.md` (user-written) + auto memory (`MEMORY.md`, first 200 lines or 25KB). Auto memory is per-repo under `~/.claude/projects/…/memory/`. Treated as context, not enforcement. Toggle via `/memory`.
- Review: https://code.claude.com/docs/en/code-review and https://code.claude.com/docs/en/commands.md — `/code-review` (alias `/review`) runs as a **forked subagent**. `--fix` can apply findings. `/simplify` is a parallel cleanup review. Best practices explicitly recommend an adversarial subagent review and warn that chasing every finding causes churn.
- `/goal` keeps working until a condition; `/loop` repeats a prompt on an interval. Both are **unbounded unless the user bounds them**.
- Subagents: https://code.claude.com/docs/en/sub-agents — optional `memory: user|project|local`. Isolated context if you do not inherit parent instructions.
- **Observed:** Offcut SessionStart/UserPromptSubmit/PreToolUse additionalContext delivered. `-p "/offcut"` is CLI-intercepted as unknown command. Write challenge arrives **after** the write. Offcut does **not** register Stop. SubagentStart banner observed.

| Question | Answer |
|---|---|
| Start Close natively? | Yes, as a skill; Stop only if registered and the session is armed |
| Persist? | `~/.offcut` + optional lessons file. Auto memory is host-owned — do not silently write it |
| Intercept completion? | Yes, via Stop — **not implemented** |
| Independent review? | Yes, if the child does **not** receive Offcut’s rewrite. Today `hooks/subagent.js` injects Offcut context — independence is **false** |
| Resume? | Session id stable across compact (**observed**) |
| Off switch? | `/offcut off` / `stop offcut` |
| Needs harness change? | Cannot force real user-flow proof; cannot raise the 8-cap without env the user controls |
| Cheapest seam | Prompt-only `/offcut-close` prototype; controller and optional Stop only after a winning benchmark |

### Codex CLI — **fact** unless noted

- Hooks: https://developers.openai.com/codex/hooks — `Stop` JSON `decision: "block"` + `reason` **creates a new continuation prompt that acts as a new user prompt**. `stop_hook_active` documented. `continue: false` can prevent continuation. Plugin hooks need **trust**; marketplace install does not trust them.
- Instructions: https://learn.chatgpt.com/docs/agent-configuration/agents-md — global `AGENTS.override.md` else `AGENTS.md`; project walk; **32 KiB default** (`project_doc_max_bytes`).
- Memories: https://learn.chatgpt.com/docs/customization/memories — **off by default.** Local `~/.codex/memories/`. Official guidance: keep required rules in `AGENTS.md`; memories are recall, not policy.
- Commands: https://developers.openai.com/codex/cli/reference.md — `/review` working-tree review; `/compact`; `/memories`; `/usage` (account tokens, not per-turn USD on ChatGPT subscription — **observed** in Phase 11: `$0` incremental API cost).
- **Observed:** additionalContext delivered with hook trust. `apply_patch` is the write tool. `ask`/`escalate` did not block writes in `codex exec`. Custom subagent sandbox failed Phase 11 (read-only child). Guardian/review under `--approve-for-me` is platform approval, not Offcut.

| Question | Answer |
|---|---|
| Start? | Skill + optional Stop |
| Persist? | Offcut can write home-dir files; no Close state exists and model visibility must not be assumed |
| Intercept? | Yes, but Stop-as-new-user-prompt is **cache-hostile** (inference: new user message, not a system reminder) |
| Independent review? | `/review` exists; isolated custom reviewer **unverified / previously failed** |
| Resume? | Same session id across exec resume (**observed**); `fired-*` kept |
| Off? | Mode commands work in exec (**observed**) |
| Harness gap | Trusted hooks; no portable USD telemetry on subscription |
| Cheapest seam | Prompt-only `/offcut-close` prototype; **do not default to Stop** |

### Cursor — **fact** unless noted

- Hooks: https://cursor.com/docs/hooks — native `stop` returns `followup_message`; `loop_count` in; **`loop_limit` default 5**, `null` = no cap. Cloud: `sessionStart` **unsupported**; user `~/.cursor/hooks.json` **not available** on cloud VMs; project `.cursor/hooks.json` is. Claude-compat maps `Stop` → `stop`.
- Rules: https://cursor.com/docs/rules — “LLMs don’t retain memory between completions.” Persistence is rules / `AGENTS.md`. Automation memories (`MEMORIES.md`) are for cloud automations, not local Agent.
- Agent: https://cursor.com/docs/agent/overview — `/goal` long-lived objective; `/loop` skill; Plan / Debug / Ask modes. No tool-call cap documented.
- **Observed (3.17.19):** `additional_context` delivered. `subagentStart` accepted JSON but **did not** reach the child. Production inheritance is `preToolUse` `updated_input` on `Subagent` only — no permission vote.

| Question | Answer |
|---|---|
| Start? | Skill locally; cloud cannot rely on SessionStart |
| Persist? | Local hooks can write home-dir state; no safe portable cloud persistence is established for Close |
| Intercept? | Yes, `stop` + `loop_limit`. Never register without an explicit cap |
| Independent review? | Possible only if Close skips the Subagent rewrite |
| Resume? | `generation_id` changes on resume (**observed**) |
| Off? | Mode switches measured |
| Harness gap | Cloud sessionStart; user hooks absent in cloud |
| Cheapest seam | Prompt-only skill prototype; later controller-backed Stop with at most two repair continuations |

### Grok Build — **fact** vs **observed** conflict

- Official short page https://docs.x.ai/build/features/hooks — events include `Stop`; **“PreToolUse is the only blocking event”**; **“for passive events, stdout is ignored.”**
- Full user guide https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md — `Stop` can block; `additionalContext` for PreToolUse arrives **after** the call; UserPromptSubmit allowing-hook stdout discarded.
- Project rules: https://docs.x.ai/build/features/project-rules — `AGENTS.md` loaded in full, no size cap stated; short files followed more reliably.
- Changelog 1.0.13: hooks can **ask** instead of only allow/deny — newer than Offcut’s 1.0.5 measurement.
- **Observed (Grok 1.0.5, 2026-08-24):** hooks **run**; `additionalContext` on SessionStart / UserPromptSubmit / PostToolUse / PreToolUse **not** seen by the model. Skills work when placed under a Grok skill root. `/offcut lite` writes state.

| Question | Answer |
|---|---|
| Start? | Skill if discovered |
| Persist? | State files yes; model-visible hook context **no** on measured events |
| Intercept? | Official sources disagree; **unknown on current Grok**. Do not ship Stop until remeasured |
| Independent review? | Hook inheritance unsupported |
| Resume? | Unknown |
| Off? | State write works; reminder does not appear |
| Harness gap | Reliable context delivery |
| Cheapest seam | Skill text + `~/.grok/AGENTS.md` kernel only. No Close Stop hook |

### Cross-cutting natives

| Mechanism | Claude | Codex | Cursor | Grok |
|---|---|---|---|---|
| Post-task review | `/code-review` | `/review` | user / Plan / Bugbot | unknown native |
| Stop intercept | Yes, 8-cap | Yes, new user prompt | Yes, loop_limit 5 | Documented / unverified |
| Session state | transcript + hooks | transcript + hooks | composer session | sessionId |
| Repo-local memory | CLAUDE.md + auto memory | AGENTS.md + optional memories | rules / AGENTS.md | AGENTS.md |
| Subagents | First-class + memory field | Profiles / collab; isolation weak in Phase 11 | Task tool | Exists; Offcut unsupported |
| Bounded iteration | Stop cap, `/goal` | Stop + `continue: false` | `loop_limit` | unknown |
| User approval | `ask` / permissions | approvals / `--approve-for-me` | permissions | allow/deny/ask (newer) |
| Compaction | Pre/PostCompact; CLAUDE.md re-injected | `/compact`; PreCompact can `continue: false` | `preCompact` | Pre/PostCompact |
| Prompt cache | `prompt_cache_likely_expired` | cache-write/read tokens in Offcut bench | unknown in official hook docs | unknown |
| Cost / tokens | usage in transcript | `/usage`; subscription often $0 API field | unknown official per-turn USD | unknown |

---

## 5. Persistent-learning design comparison

| | A Session only | B Append-only ledger | C Curated lessons | D Auto-edit AGENTS.md | E Host memory | F Hybrid A+C (+opt E) |
|---|---|---|---|---|---|---|
| Correctness | High for one task | High if not injected raw | High if user-gated | **Low** — one finding becomes law | Host-quality | High |
| Portability | High | High if home-dir | High | Breaks generated kernel | Low | High |
| Prompt growth | None across sessions | Dangerous if dumped | Small if capped | Grows the hot prefix | Host caps (Claude 25KB) | Small |
| Cache | Best | Bust if SessionStart-injected | Stable if tiny | Busts on every edit | Host-controlled | Best if lessons rare |
| Token / $ | Lowest | High if injected | Low | High | Medium | Low |
| Stale knowledge | N/A | Accumulates | Expiry/revoke | Stale instructions | Stale notes | Manageable |
| Instruction poisoning | None | If promoted blindly | User gate | **Direct hit** | Medium | User gate |
| Malicious repo | Low | Ledger in repo is an attack | Lessons in repo is an attack | **Kernel hijack** | Host-dependent | Home-dir default |
| Privacy / secrets | Session only | Evidence fields leak | Must redact | Secrets in git | Codex claims redact; still review | Redact + home-dir |
| Merge conflicts | None | If committed | If committed | **Guaranteed** on AGENTS.md | None | Avoid git |
| User control | Command | Inspect file | Promote/revoke | Hidden | Host toggles | Highest |
| Reversibility | Session end | Delete file | Revoke entry | Hard — already in history | Host UI | Easy |
| Inspectability | Transcript | JSONL | Markdown table | Diff noise | Host files | High |
| Maintenance | None | Prune job | Curation | Kernel rebuild forever | None for Offcut | Curation only |
| **Verdict** | **Prototype core** | Useful only as controller state | **Later experiment** | **Reject** | Useful later adapter | **Only after separate evidence** |

**Promotion lifecycle (required only if a later recurrence benchmark justifies C):**

`observed` → `repeated` (at least two independent occurrences) → `validated` (external fail-then-pass evidence) → `user-approved` → `promoted` → `expired` | `revoked`.

Required fields: `id`, `scope` (repo/path/symbol), `trigger`, `rule`, `evidence`, `provenance` (session, host, commit), `created`, `last_validated`, `expires`, `revoked`.

**Do not promote from a single finding.** A user confirmation without external evidence may record a preference, but must not convert a defect hypothesis into a correctness rule.

Default location, if this phase is eventually built: `~/.offcut/lessons/<repo-key>.json` (home, not git). Optional export is a user action. Storage alone does not teach an agent. Retrieval must be narrow and explicit:

- Match by touched path/symbol, validated failure signature, or named verification.
- Inject lessons only during Close, never on every Offcut turn.
- Return at most three lessons, each capped to a short rule plus provenance.
- Treat lessons as fallible context, not permission or proof.
- Revalidate before using an expired lesson; never load revoked lessons.

The model may propose a candidate. The controller owns storage and retrieval; the user owns promotion. No model writes host memory, `AGENTS.md`, or the kernel.

---

## 6. Bounded convergence protocol

Name the protocol **Close**. A successful run **finishes**. The controller, not the model, owns the loop.

```
contract → evaluate → classify → repair required findings → verify
         → fresh re-evaluation → receipt → STOP
```

### Controller interface

Close should be a deep module with one small interface. A caller supplies the run state and one validated phase result; the module returns the next phase or a receipt. Its implementation hides counters, IDs, storage, retrieval, and host differences. The exact function name is an implementation choice, but the interface is conceptually:

```text
advanceClose(run, validatedResult) →
  { status: continue, phase, promptInput }
  | { status: passed, receipt }
  | { status: incomplete, receipt }
```

Agents never increment rounds, hash findings, mutate persistence, or declare controller state. They return phase-specific observations through a small validated schema.

### Outcome order

Evaluate in this order after every phase:

1. User aborts → `incomplete:user-stopped`.
2. Every acceptance condition has current external evidence and no `required` finding remains → `passed`.
3. Missing authority, unavailable environment, or contradictory requirements prevent proof → `incomplete:blocked`.
4. Two repair-and-verification cycles have been consumed → `incomplete:budget`.
5. Otherwise continue to the next phase.

The budget is **one initial evaluation plus at most two repair-and-verification cycles**. A host's lower native cap wins. A host cap is never success by itself.

Optional later: time/cost budget from host usage events. **Unknown** how to read Cursor per-turn USD. Codex subscription often reports `$0` API — do not use that as a budget.

### Finding identity

Do not hash model prose. The controller assigns monotonic run-local IDs (`F1`, `F2`, ...). Reuse an ID only when the evidence has a deterministic identity such as a failing test name/error code plus owning symbol, or when a fresh evaluator explicitly maps the same invariant, owner, and observable failure to an existing ID.

If that match is not supported, create a new ID and let later evaluation mark it duplicate. False separation is cheaper than silently merging two different correctness defects.

States: `open` | `fixed-unverified` | `closed` | `needs-user` | `non-blocking` | `unsupported` | `needs-revalidation` | `reopened`.

Only external evidence moves `fixed-unverified` to `closed`. A source edit moves affected findings to `needs-revalidation`, not `stale` or `closed`.

### Independence rule

A fresh Close evaluator receives applicable repository instructions, the user's request, the acceptance contract, the current diff/files, and available execution tools. It does **not** receive the implementer's rationale, self-assessment, or claims of correctness. On its first pass it does not receive prior reviewer conclusions. On re-evaluation it receives open IDs only because mapping closure is then part of the task.

The Offcut kernel is repository guidance and is not automatically disqualifying. Independence comes from role/context separation and evidence, not from stripping applicable instructions. `hooks/subagent.js` needs a Close-specific path only if current inheritance injects implementer conclusions or an instruction that biases the evaluator; that must be tested rather than assumed.

### Action classes

- `required`: breaks requested behavior, a stated invariant, security, privacy, accessibility, data integrity, or relevant verification. Repair when already authorized and in scope.
- `needs-user`: requires a product decision, new authority, destructive action, or material scope expansion.
- `non-blocking`: an optional improvement that does not prevent closure.
- `unsupported`: speculation without a reachable failure or evidence.

### Gaming

If stop = “model says no new findings,” the model can game it. Close only on the acceptance contract, controller IDs, and current external evidence. `non-blocking` and `unsupported` findings never block stop. Required findings without proof stay open and the run reports `incomplete`; it does not loop forever.

---

## 7. Exact repository integration points

Responsibility belongs at the seam every Close caller crosses: **one skill interface for the prototype; one controller interface only if measurement earns it; host adapters only after that**. Do not put protocol text in the kernel.

| Change | File | Why here |
|---|---|---|
| Prototype protocol and phase prompts | **New** `skills/offcut-close/SKILL.md` | One-shot skills are the existing command seam. Canonical invocation is `/offcut-close`; natural-language invocation uses the skill description. |
| Help | `skills/offcut-help/SKILL.md` | Already the command card. |
| Prototype evidence | Existing `bench/` conventions plus a dedicated Close runner/fixture set if needed | The prototype must remain separable from sealed efficacy results. |
| Controller, after a winning benchmark | **New** `hooks/close.js` | Deep module owning run IDs, budgets, validated transitions, storage, retrieval, and receipts behind one interface. `state.js` keeps owning only mode/suppression. |
| Session path helpers, after controller | `hooks/state.js` | Reuse state-directory and atomic-file primitives; do not put Close transitions here. |
| Evaluator context adapter, only if required by measured hosts | `hooks/subagent.js` | Preserve repository instructions; exclude implementer rationale. Do not skip all Offcut guidance by default. |
| Optional Stop, later | `hooks/host.js` `EVENT_*` + **new** `hooks/stop-close.js` | Host divergence stays in `host.js`. Handler asks the controller for a short next-phase prompt. |
| Register Stop | `tools/install.mjs`, `adapters/claude/hooks.json`, `adapters/cursor/hooks.json`, `hooks/hooks.json` | Only if Stop is implemented. Cursor **must** set `loop_limit`. |
| Doctor | `hooks/doctor.js` | Report whether Close Stop is installed. |
| Tests, after controller | **New** `tests/close.test.js` | Controller transitions, evidence gate, budget ordering, identity reuse, receipt, pruning, and lesson retrieval caps. |
| README | `README.md` | Add only after the benchmark gate. Default: Close never runs implicitly. |
| Plugin package | regenerate `plugins/offcut/` | After sources change. Do not hand-edit. |
| Kernel | `rules/offcut.md` | **Do not add Close.** Contract: no extra checks, no audit unless asked. |

**Must not edit:** generated `AGENTS.md` / `skills/offcut/SKILL.md` / `rules/offcut.mdc` / `plugins/offcut/**` except via their builders.

**Cheapest prototype:** `/offcut-close` skill text + benchmark fixtures. No command-parser change, persistent state, lesson store, README claim, marketplace claim, or Stop hook. If that prompt-only prototype cannot beat one good review, stop there and delete it.

**Cheapest product v1, only after a winning prototype:** skill + controller + bounded session record + receipt. Still no persistent lessons or Stop hook. A hook-driven continuation is a later adapter, not the core interface.

---

## 8. Threat, privacy, cache, and cost analysis

**Threat.** A repo-committed lessons file is an instruction-injection surface (same class as malicious `AGENTS.md`). Default to `~/.offcut/`. If a repo file is ever supported, treat it as untrusted: no shell, no secrets, size cap, user must enable.

**Privacy.** Ledger evidence will quote code and repro steps. Do not put it in SessionStart context. Do not send it anywhere — Offcut already promises no network. Redact tokens/keys.

**Cache.** Offcut’s own style bench showed concise **raised** gross input vs normal prose while cutting noncached input. That result does not establish the cache effect of Close. A growing session or lesson dump changes prompt content and can reduce reuse, but the host-specific billing effect must be measured. Official OpenAI guidance recommends lean prompts, stable reusable content, task-specific stopping rules, and representative evals; it does not prove a particular Codex Stop cost for Offcut: https://developers.openai.com/api/docs/guides/latest-model

**Cost.** Phase 11: median ~77k input tokens / ~56s per construction task on Codex subscription, `$0` incremental API field (membership not free). That study did not run Close. Additional evaluator and repair calls necessarily add work, but their exact multiplier is unknown until benchmarked. Automatic post-write Close would spend that work without explicit demand, so it remains rejected.

**Instruction poisoning.** Auto-editing the kernel or `AGENTS.md` is the highest-severity design. The kernel is generated, word-capped, and contract-tested. A Close lesson that says “always add retries” would fight Offcut’s own cheapness rule.

---

## 9. Minimal vertical slice

**Prototype:** `/offcut-close`

**Do not publish yet:** `/offcut close`, `/offcut loop on`, auto-after-write, persistent learning, or marketplace efficacy claims.

**Why this shape.** Review is defined as one-shot and stateless. Audit is a repo scan. Close is a **stateful finish protocol**. Mixing them would break the “commands touch no mode state” rule for review/audit, or silently start an expensive loop from a scan.

**Name.** **Offcut Close.** It communicates termination. “Closure Loop” is fine internally. “Converge” is vague. “Finish Pass” under-sells re-review. Avoid loop / infinity / intelligence branding.

### Prompt design facts

- Google recommends clear, direct instructions, consistent structure, explicit constraints, and few-shot examples for Gemini. It also warns that syntactically valid structured output can still be semantically wrong and must be validated by the application: https://ai.google.dev/gemini-api/docs/prompting-strategies and https://ai.google.dev/gemini-api/docs/structured-output
- Official OpenAI model guidance recommends lean prompts, explicit success and stop conditions, relevant tools only, and matched evaluations. It warns against repeating instructions and over-prescribing judgment-heavy workflows: https://developers.openai.com/api/docs/guides/latest-model
- Anthropic's evaluator-optimizer pattern requires clear evaluation criteria and measurable improvement. Its coding harness made “done” testable before building and gave the evaluator execution tools: https://www.anthropic.com/engineering/building-effective-agents and https://www.anthropic.com/engineering/harness-design-long-running-apps
- SWE-agent reports that the agent-computer interface materially affects coding performance, supporting better tools and feedback rather than relying only on a stronger instruction: https://arxiv.org/abs/2405.15793

These facts imply **short phase prompts**, not one monolithic “think harder, review, fix, learn, repeat” prompt. The controller supplies only the current phase and validates its result.

### Phase A — acceptance contract

```text
You are preparing an Offcut Close evaluation.

From the user request, applicable repository instructions, and current change,
return at most five observable acceptance conditions.

For each condition include:
- behavior: what must be true for the user
- evidence: the cheapest command, test, or user flow that can prove it

Rules:
- Do not invent requirements or expand scope.
- Prefer behavior and invariants over implementation preferences.
- If essential information is missing, return BLOCKED with the smallest missing fact.
```

### Phase B — fresh read-only evaluation

```text
You are the read-only evaluator in an Offcut Close run.

Evaluate only the supplied acceptance contract and changed behavior. Use the
available repository and execution tools. A review request is not evidence that
a defect exists.

For each evidence-backed finding return:
- invariant: exact required behavior that is broken
- owner: file and symbol where responsibility belongs
- observed_failure: reachable failure or current execution result
- reproduction: command, test, or user flow that can confirm it
- action: required | needs-user | non-blocking | unsupported
- smallest_fix: narrowest correct repair location

Rules:
- Do not modify files.
- Omit style preferences and hypothetical risks without a reachable path.
- Do not widen scope, praise the implementation, or manufacture a finding.
- Return PASS when no evidence-backed required finding exists.
```

For weaker models, provide two or three short examples in the eval fixture: one valid required defect, one unsupported speculation, and one legitimate PASS. Examples belong in the prototype/eval prompt, not the permanent kernel, and remain only if ablation shows they help.

### Phase C — repair

```text
You are the repair agent.

Repair only the supplied required findings that are already authorized and in
scope. For each finding:
1. Reproduce or confirm its evidence.
2. Make the smallest correct change at the stated owner.
3. Run the named verification.
4. Return the observed result.

Do not start a broad review, fix non-blocking suggestions, redesign unrelated
code, weaken tests, or claim closure from reasoning alone. If a finding cannot
be reproduced or needs new authority, return BLOCKED.
```

### Phase D — fresh re-evaluation

```text
You are a fresh evaluator.

You receive the acceptance contract, current change, current verification
results, and open finding IDs. You do not receive the implementer's rationale
or self-assessment.

Check only:
1. whether each open required finding is now proven closed,
2. whether the repair introduced a regression in the affected behavior,
3. whether every acceptance condition has current observable evidence.

Map to an existing ID only when invariant, owner, and observable failure match.
Otherwise return a new finding. Return PASS only when all required conditions
have evidence. Do not block closure for style or unsupported speculation.
```

### Validated result shape

Use the host's structured-output facility when available; otherwise parse JSON and reject invalid results. Keep the schema shallow:

```json
{
  "verdict": "pass | findings | blocked",
  "findings": [
    {
      "invariant": "string",
      "owner": "path:symbol",
      "observed_failure": "string",
      "reproduction": "string",
      "action": "required | needs-user | non-blocking | unsupported",
      "smallest_fix": "string",
      "same_as": "F1 | null"
    }
  ],
  "verification": [
    { "command_or_flow": "string", "outcome": "passed | failed | blocked", "evidence": "string" }
  ]
}
```

Schema validity is not semantic validity. The controller rejects `required` findings without an owner, observable failure, and reproduction. It assigns IDs after validation.

### Prototype behavior

1. User invokes `/offcut-close` or explicitly asks for Offcut Close on a named scope.
2. Skill derives a maximum-five-item acceptance contract.
3. A fresh evaluator inspects only that contract and scope.
4. Required findings are repaired and externally verified.
5. A fresh re-evaluator checks open IDs and affected regressions.
6. The run stops on proof, block, user stop, or two consumed repair cycles.
7. It prints a receipt: acceptance evidence, closed/reopened/open IDs, cycles, and blocker.
8. It stores no persistent lesson.

The prompt-only prototype may keep its table in conversation or a temporary benchmark artifact. It is not yet a trustworthy persistent ledger because the model still owns transitions. Product v1 requires the controller before making traceability claims.

**Prototype does not:** register Stop, alter `parseOffcutCommand`, touch the kernel, write lessons, spawn a background process, run after every Write, or advertise cross-host command parity.

---

## 10. Test and benchmark plan

Compare four arms on **fixed, seeded tasks** under matched authorization, tool access, and maximum token/time budgets:

1. Ordinary agent completion
2. Ordinary completion plus one strong host review (`/code-review`, `/review`, or a host-equivalent evidence-first prompt)
3. Offcut Close prompt-only prototype (one initial evaluation + max two repair cycles)
4. Offcut Close without few-shot examples, to measure whether the extra prompt material earns its cost

Seed N defects of known IDs (auth miss, incomplete fix, regression, duplicate-wording pair, speculative nit). Blind the judge to arm.

Stratify by model capability/cost instead of assuming transfer. At minimum run one frontier coding model and one lower-cost coding/agent model such as Gemini 3.7 Flash when that model is actually available in the chosen harness. Google describes 3.7 Flash as a coding/agent workhorse; that is product positioning, not evidence that Offcut improves it: https://blog.google/innovation-and-ai/models-and-research/gemini-models/introducing-gemini-3-7-flash/ . Do not label a vendor model “weak” from price or product tier; report observed task performance.

**Measure:**

- Seeded defects found / correctly fixed
- Reopened IDs
- Regressions introduced
- Duplicate findings (same validated failure mapped to more than one controller ID)
- Speculative / false findings
- Repair cycles to closure (Close arms; maximum two)
- Wall time, tool calls
- Input, cached input, noncached input, output tokens (Codex already records these in `bench/`)
- Monetary cost where the host exposes it (do not invent $0 = free)
- Final **independent** review (human or a reviewer that did not see the implementer)
- Unsupported findings accepted by the repair agent
- Scope-expanding writes
- Controller/schema validation failures

**Claims allowed if the numbers support them:** better closure discipline, better defect traceability, fewer reopens, fewer duplicate findings.

**Claims forbidden without support:** “smarter models,” general token savings, Grok parity.

Primary outcome: independently verified required defects closed without regression. Pre-register the equivalence margin and a maximum acceptable token/time increase. Duplicate reduction is secondary and cannot compensate for worse correctness.

Run a separate later experiment for persistence. Seed recurring repository-specific failures across fresh sessions and compare no lesson vs narrowly retrieved validated lesson. Measure recurrence, false transfer, stale-rule harm, prompt tokens, and user overrides. Do not combine this with the Close efficacy experiment.

Reuse Offcut's existing bench honesty: subscription `$0` is not a cost win; do not generalize one host or model. Treat SWE-Review's 2026 agentic-review result as relevant research, not proof for Offcut or for every harness: https://arxiv.org/abs/2607.06065

---

## 11. Rejected alternatives

- **Always-on loop mode.** Conflicts with the kernel and with cheapness.
- **Auto-activate after writes.** Same, plus PostToolUse already fires construction signals once per session.
- **Fold into `/offcut-review`.** Review is a scanner report, not a fix loop.
- **Reimplement `/code-review` / `/review`.** Hosts already own that.
- **D — mutate AGENTS.md / kernel from findings.** Poisoning, cache bust, merge wars, generated-file contract.
- **Background daemon / DB / cloud service.** Unnecessary; `~/.offcut` already exists.
- **Grok Stop in v1.** Context delivery failed on measured events; official pages disagree.
- **Unbounded Cursor `loop_limit: null`.** Docs allow it; Offcut must not.
- **Reviewer with implementer rationale or correctness claims.** Biased context. Preserve applicable repository instructions, but remove self-assessment and conclusions.
- **Hashing model-written prose for identity.** Different wording produces different hashes; controller IDs plus evidence are safer.
- **Prompt-only persistent ledger.** A model-managed table is useful prototype context, not an auditable state machine.
- **Loading every lesson every session.** Prompt growth, stale transfer, and instruction poisoning; use narrow retrieval only if a later benchmark earns persistence.
- **Scanner-as-oracle.** Wrong defect class.

---

## 12. Implementation plan in small ordered commits

Do not implement product code until this audit is accepted. If accepted:

1. **Research prototype.** Add an unadvertised `/offcut-close` skill containing the phase prompts and examples. No hooks, parser state, persistence, README claim, or marketplace claim.
2. **Benchmark first.** Build the matched four-arm seeded evaluation. Run frontier and lower-cost model strata. **Delete the prototype if it does not improve independently verified closure over one good review within the preregistered cost margin.**
3. **Controller only after a win.** Add `hooks/close.js` behind one `advanceClose`-style interface. Tests cover transition ordering, two-cycle budget, evidence gating, run-local IDs, duplicate mapping, blocked runs, receipts, and atomic/pruned state.
4. **Skill-to-controller seam.** Make the skill exchange only validated phase results with the controller. The model never writes state directly.
5. **Evaluator context.** Test each host. Preserve repository guidance; exclude implementer rationale/self-assessment. Change `subagent.js` only where measured inheritance violates this contract.
6. **Distribution.** Add help/README only after product v1 passes tests and the benchmark gate; regenerate the plugin package through its builder.
7. **Invocation aliases.** Test `/offcut close` separately on every host. Keep `/offcut-close` and natural language as canonical until parity is proven.
8. **Optional Stop adapter.** Only for hosts with remeasured reliable delivery. The handler asks the controller for the next phase; Cursor cap ≤2 repair continuations. No Grok Stop without a current live test.
9. **Persistent-learning experiment.** Only after Close product efficacy. Implement candidate storage, user promotion, max-three narrow retrieval, expiry/revocation, and a separate recurrence benchmark. Remove it if false transfer or prompt cost erases the gain.

---

## 13. Go / no-go criteria

**Go to prompt-only prototype** if all of these are true:

- Canonical prototype invocation is `/offcut-close`, default off
- Kernel and generated artifacts stay unchanged
- Prototype has no Stop hook, parser mutation, persistence, or auto-write trigger
- Phase prompts are short, role-separated, and evidence-first
- A benchmark is designed before marketplace copy claims closure

**Go to product v1** only if all of these are also true:

- Close beats one good review on independently verified required defects under the preregistered cost margin
- A deterministic controller, not the model, owns IDs, transitions, budgets, state, and receipts
- Applicable repository instructions reach the evaluator, while implementer rationale/self-assessment does not
- Product v1 still has no persistent lessons or automatic trigger

**Go to persistent learning** only if a separate fresh-session recurrence benchmark shows net benefit and lessons remain user-promoted, narrowly retrieved, expiring, revocable, and capped.

**No-go** if any of these are the actual ask:

- Native always-on loop across all four hosts
- “Make agents smarter” as the success metric
- Auto-persist into `AGENTS.md`
- Model-owned hashes, counters, state transitions, or lesson promotion
- Shipping `/offcut close` as universal before invocation parity is tested
- Ship Grok Stop on 1.0.5-era evidence
- Skip measurement because the idea is marketable

**Recommendation:** **Go for the unadvertised prompt/eval prototype. No-go for a ledger, lessons, or native loop today.** If the benchmark shows Close is equivalent to one host review on independently verified correctness, delete the prototype and tell users to use the native review. That is the cheapest correct outcome.

---

## 14. Sources

**Offcut (this checkout):**
`README.md`, `AGENTS.md`, `rules/offcut.md`, `skills/offcut{,-review,-audit,-help}/SKILL.md`, `hooks/*`, `adapters/*`, `scripts/{scan.mjs,build-agents-md.js,build-plugin-package.mjs}`, `tools/{bootstrap,install}.mjs`, `package.json`, plugin manifests, `docs/development/{README,HOSTS,COEXIST,EFFICACY-RESULTS,STYLE-BENCHMARK}.md`, `tests/contract.test.js`, `tests/distribution.test.js`.

**Official host docs:**

- https://code.claude.com/docs/en/hooks
- https://code.claude.com/docs/en/memory
- https://code.claude.com/docs/en/sub-agents
- https://code.claude.com/docs/en/code-review
- https://code.claude.com/docs/en/commands.md
- https://code.claude.com/docs/en/best-practices
- https://developers.openai.com/codex/hooks
- https://learn.chatgpt.com/docs/agent-configuration/agents-md
- https://learn.chatgpt.com/docs/customization/memories
- https://developers.openai.com/codex/cli/reference.md
- https://cursor.com/docs/hooks
- https://cursor.com/docs/rules
- https://cursor.com/docs/agent/overview
- https://cursor.com/docs/reference/plugins
- https://docs.x.ai/build/features/hooks
- https://github.com/xai-org/grok-build/blob/main/crates/codegen/xai-grok-pager/docs/user-guide/10-hooks.md
- https://docs.x.ai/build/features/project-rules

**Prompting, workflow, and correction evidence:**

- https://developers.openai.com/api/docs/guides/latest-model
- https://ai.google.dev/gemini-api/docs/prompting-strategies
- https://ai.google.dev/gemini-api/docs/structured-output
- https://www.anthropic.com/engineering/building-effective-agents
- https://www.anthropic.com/engineering/harness-design-long-running-apps
- https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- https://arxiv.org/abs/2303.17651 (Self-Refine)
- https://arxiv.org/abs/2303.11366 (Reflexion)
- https://arxiv.org/abs/2305.11738 (CRITIC)
- https://arxiv.org/abs/2310.01798 (limits of intrinsic self-correction)
- https://arxiv.org/abs/2405.15793 (SWE-agent)
- https://arxiv.org/abs/2505.23060 (small-model code correction; training-based result)
- https://arxiv.org/abs/2607.06065 (SWE-Review preprint; relevant, not Offcut evidence)

**Observed, not official:** `docs/development/HOSTS.md` (2026-08-24–27; Claude 2.1.24x, Codex 0.149.1, Grok 1.0.5, Cursor 3.17.19). Grok 1.0.13 changelog exists; Offcut has **not** remeasured it.

---

## Must / later / reject

**Must have for the research prototype:** `/offcut-close` skill, phase-specific prompts, maximum five acceptance conditions, one fresh evaluator, external evidence, at most two repair cycles, explicit incomplete outcomes, closure receipt, and matched benchmark.

**Must have for a product:** controller-owned IDs/state/budget, evidence-gated transitions, atomic bounded session record, schema validation, applicable repository guidance for evaluators, and an off switch.

**Useful later, only after evidence:** armed Stop adapters, `/offcut close` aliases, user-promoted narrowly retrieved lessons, host-memory adapters, and host telemetry budgets.

**Reject:** auto-after-write, loop mode, model-owned hashes/state, global lesson injection, kernel/`AGENTS.md` mutation, daemons, Grok Stop without current measurement, and “smarter” claims.
