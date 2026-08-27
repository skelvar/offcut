# COEXIST.md — Offcut alongside other plugins

Dated Phase 9 measurements (2026-08-25). Evidence under `bench/phase9-evidence/`.
A claim is only made when a model quoted something, a state file changed, or a
probe mark was written — never from "the hook ran" alone.

---

## Environment

| Field | Value |
|---|---|
| Date | 2026-08-25 |
| OS | Windows |
| Claude Code | 2.1.243 |
| Codex | 0.149.1 |
| Grok Build | 1.0.5 |
| Neighbours used | Claude: ponytail plugin + temporary `coexist-probe`; Codex: impeccable `PostToolUse` + temporary probes |

---

## 1. Do both handlers run?

**Yes — when the host actually invokes them.**

| Host | Evidence |
|---|---|
| **Claude** | UserPromptSubmit: model replied `BOTH_CTX` and quoted `OFFCUT ACTIVE` while the neighbour mark recorded `NEIGHBOR_CTX_9f2a1c` (`claude-multictx.txt`, `~/.offcut-coexist-mark.jsonl`). Ponytail is also enabled as a plugin on SessionStart / UserPromptSubmit; Offcut mode + reminder still delivered. |
| **Codex** | With `--dangerously-bypass-hook-trust`: transcript shows two `PreToolUse Completed` and `PostToolUse Failed` (impeccable) + `PostToolUse Completed` (Offcut) on the same `apply_patch`. Probe label `TRUST-PRE` wrote for `apply_patch`. Without hook trust, write hooks were silent in earlier `workspace-write` runs — trust is required for this Codex version in headless exec. |
| **Grok** | Not re-asserted for multi-plugin delivery (Tier 3 discards stdout). Hooks still install beside each other as separate files under `~/.grok/hooks/`. |

---

## 2. Does more than one `additionalContext` survive?

**Yes on Claude and Codex.** This is the question that matters most.

| Host | Result | Evidence |
|---|---|---|
| **Claude** | **Both survive** | Model: `BOTH_CTX` + verbatim Offcut reminder. Neighbour mark: `NEIGHBOR_CTX_9f2a1c`. Slow-neighbour run also: `BOTH` for Offcut + fast neighbour; `SLOW_CTX_zz` absent (timed out). |
| **Codex** | **Both survive** | Model: `BOTH_CTX` for `CODEX_NBR_42` and `OFFCUT ACTIVE`. Two `UserPromptSubmit Completed`. Mark: `codex-neighbour` with `CODEX_NBR_42`. |
| **Grok** | **N/A (undelivered)** | Hook stdout discarded; zero `additionalContext` reaches the model on Offcut's events. |

Offcut is **not** silently suppressed by a second context-injecting plugin on Claude or Codex.

---

## 3. What happens when another hook denies?

**Offcut never converts deny into allow.** Measured on Claude PreToolUse:

| Order | Write result | Contexts seen |
|---|---|---|
| Deny first, Offcut second | **WRITE_BLOCKED** (`coexist-probe:deny-neighbour`) | `DENY_CTX_b4` only on the write path — Offcut write challenge did not surface (`NO_OFFCUT_CTX`). Reminder still arrived on UserPromptSubmit. |
| Offcut first, deny second | **WRITE_BLOCKED** (`coexist-probe:deny-second`) | **Both** `OFFCUT_CTX` ("one implementation…") and `DENY2_CTX`. File absent. `fired-*` written. |

So: deny still wins either way; Offcut does not cast `permissionDecision: allow`. If a neighbour denies *before* Offcut runs and the host short-circuits, Offcut's write-time context may be dropped with the blocked call — that is host aggregation, not Offcut overriding security.

Contract tests in `tests/phase9.test.js` assert Offcut never emits `allow`/`deny` that could clear a neighbour deny.

---

## 4. Does a slow or hanging neighbour break Offcut?

**No.** Claude UserPromptSubmit with a neighbour that `--sleep 8000` under a 5s hook timeout:

- Elapsed wall time ~12s for the turn; model still received `OFFCUT ACTIVE` and `NEIGHBOR_CTX_9f2a1c`.
- `SLOW_CTX_zz` absent — host killed the slow hook before it returned context.
- Slow probe left no mark (record happens after sleep) — killed mid-flight.

Offcut's own process bound is 5s (`runHook` + install `timeout: 5`). Neighbours are separate processes; their hangs are not awaited by Offcut. Asserted in `tests/phase9.test.js`.

---

## 5. Do the skills collide?

**Initially yes. Sharpened — then the sharpen was reverted, because it bought
single-firing by making Offcut unreachable.**

Prompt: `review this diff for over-engineering`.

| When | Model report |
|---|---|
| Before (2026-08-25) | `SKILL=both` — `offcut-review` and `ponytail-review` both matched |
| After description sharpen (2026-08-25) | `SKILL=ponytail-review` only — Offcut required naming Offcut / `/offcut-review` / "Offcut signals", and explicitly ceded the generic phrases |
| Shipped now (2026-08-27) | **Unmeasured — deliberately.** See below. |

The sharpen worked, and that was the problem. It named ponytail in Offcut's own
shipped metadata and told the agent not to use `offcut-review` for "is this
over-engineered" or "what can we delete". Two consequences, neither measured at
the time:

- **Most machines do not have ponytail.** The description deferred to a plugin
  that may not be installed, so the phrasing a user reaches for first routed to
  nothing at all. A collision between two installed plugins was traded for
  unreachability everywhere else.
- **It hardcoded a third party's naming.** Offcut cannot control ponytail's skill
  names or trigger phrases, and this repo already forbids hardcoded host names
  outside adapter logic for the same reason.

The descriptions now state positively what Offcut is — a deterministic scanner
run over a diff or a tree, reporting exactly which named signals fired — and
their negative triggers only separate Offcut's own skills from each other
(`review` vs `audit` vs mode switches). No third-party plugin is named.

Routing under the new descriptions is **not** claimed here, and is not queued as
pending work. Measuring it needs both plugins installed at their shipped
versions, and "which skill does a generic over-engineering request activate" is
an Offcut-versus-ponytail comparison — so it defers with that benchmark under
[§14 of the plan](implementation-plan.md#14-deferred). If both match, that is an
accurate outcome rather than a bug: one scans, one advises.

No hook-side intent detection was added, then or now.

---

## 6. Uninstall under coexistence

**Removes only Offcut.**

Live Codex `hooks.json` held impeccable `PostToolUse` + Offcut. After `node tools/install.mjs --uninstall`:

- `has offcut? false`
- `has impeccable? true` (`Checking UI changes` group remained)

Snapshots: `bench/phase9-evidence/codex-hooks-before-uninstall.json`, `codex-hooks-after-uninstall.json`.

Contract test covers two foreign hooks (security-guidance + impeccable + ponytail + remember) surviving uninstall via `mergeHooks`.

---

## Verdict

**Offcut is safe to run alongside other plugins** on Claude Code and Codex:

1. Multiple `additionalContext` values both reach the model.
2. Offcut never turns a neighbour `deny` into an allow.
3. A slow neighbour cannot stall Offcut past its own timeout.
4. Uninstall leaves foreign hooks in place.

Caveats to remember:

- **Codex hook trust** — headless `codex exec` needs trusted hooks (or `--dangerously-bypass-hook-trust`) or write hooks stay silent.
- **Deny short-circuit** — if another PreToolUse denies first and the host stops the chain, Offcut's write challenge may not appear; the write stays blocked.
- **Skill descriptions** — with both plugins installed, a generic "review for over-engineering" may match Offcut's review skill and ponytail's. Naming Offcut or invoking `/offcut-review` is unambiguous; which one a host picks otherwise is unmeasured (§5).
- **Grok** — coexistence of *config* is fine; delivery remains Tier 3.
