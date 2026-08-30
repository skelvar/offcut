# Offcut Native Defaults and Competitive Proof Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship Offcut as a reversible native default across Codex, Claude Code,
Cursor, and Grok Build, then produce real concise-style and head-to-head evidence.

**Architecture:** Move the model-facing contract to `rules/offcut.md`; generate
repository, skill, and Cursor artifacts from it; extend the existing installer
with host-native managed rules; make hooks send state instead of duplicated
rules when persistence is detected; and extend the existing isolated live
harness with competitor arms and fail-closed receipts.

**Tech Stack:** Node.js ESM, `node:test`, Markdown native instruction files,
Codex/Claude/Cursor/Grok plugin manifests and hooks, existing Codex live runner.

---

## Task 1: Make a standalone kernel the source of truth

**Files:**

- Create: `rules/offcut.md`
- Create: `.codex-plugin/plugin.json`
- Create: `hooks/hooks.json`
- Modify: `scripts/build-agents-md.js`
- Modify generated: `AGENTS.md`
- Modify generated: `skills/offcut/SKILL.md`
- Create generated: `rules/offcut.mdc`
- Modify: `tests/contract.test.js`

1. Add failing tests for the Codex manifest, default hook entrypoint, kernel, and
   exact generated-artifact equality.
2. Run `node --test tests/contract.test.js` and confirm RED.
3. Move the current skill body to `rules/offcut.md`; make the generator derive
   all three consumers with their required frontmatter/header.
4. Add a minimal Codex manifest and default `hooks/hooks.json` using plugin-root
   environment expansion.
5. Run `node scripts/build-agents-md.js` and the contract test until GREEN.
6. Validate the plugin with the plugin-creator validator.

## Task 2: Install native global guidance reversibly

**Files:**

- Modify: `hooks/host.js`
- Modify: `tools/install.mjs`
- Modify: `tests/cursor.test.js`

1. Add failing fake-home integration tests for all four native destinations,
   foreign-content preservation, Codex override precedence, idempotence,
   backups, and uninstall cleanup.
2. Run `node --test tests/cursor.test.js` and confirm RED.
3. Add host-owned native target discovery in `hooks/host.js`.
4. Add bounded managed-block merge/removal and dedicated Cursor rule handling
   to the installer. Do not create absent harness directories.
5. Run the installer tests until GREEN.

## Task 3: Eliminate duplicate model context without weakening fallback

**Files:**

- Modify: `hooks/host.js`
- Modify: `hooks/rules.js`
- Modify: `hooks/activate.js`
- Modify: `hooks/prompt.js`
- Modify: `hooks/subagent.js`
- Modify: `tests/hooks.test.js`
- Modify: `tests/contract.test.js`

1. Add failing tests for native active markers, native off override, reminder
   suppression, subagent state, and full hook-only fallback.
2. Run `node --test tests/hooks.test.js tests/contract.test.js` and confirm RED.
3. Detect the exact managed marker at the host-native target.
4. Emit a compact state marker when native guidance exists; emit the kernel only
   for hook-only installs; explicitly neutralize persistent guidance in off mode.
5. Suppress recurring reminders only when persistent native guidance is active.
6. Run the focused tests until GREEN.

## Task 4: Diagnose and document the installed truth

**Files:**

- Modify: `hooks/doctor.js`
- Modify: `README.md`
- Modify: `docs/development/HOSTS.md`
- Modify: `tests/phase4.test.js`
- Modify: `tests/cursor.test.js`

1. Add failing tests for doctor output when native guidance is present, missing,
   duplicated, or overridden.
2. Implement native-source reporting and duplicate detection.
3. Replace hooks-only/skill-activation setup docs with the one-install native
   workflow and document the session switches and Grok compatibility boundary.
4. Run the doctor and documentation contract tests until GREEN.

## Task 5: Add a reproducible five-arm competitive benchmark

**Files:**

- Modify: `bench/live-style-lib.mjs`
- Modify: `bench/live-style.mjs`
- Create: `bench/live-competitive.mjs`
- Create: `bench/competitive-receipt.mjs`
- Create: `bench/blind-review.mjs`
- Modify: `tests/live-style.test.js`
- Modify: `docs/development/STYLE-BENCHMARK.md`

1. Add failing tests for five-arm scheduling, source hashes, arm isolation,
   provider cache metrics, anonymized answer export, and fail-closed receipts.
2. Run `node --test tests/live-style.test.js` and confirm RED.
3. Reuse the existing runner and acceptance pipeline; add only a generic receipt
   seam and competitor driver. Read competitor instructions from required CLI
   paths and record hashes without vendoring their text.
4. Add final-answer extraction and anonymized review bundles.
5. Run the live-style tests until GREEN.

## Task 6: Execute, review, and publish measured receipts

**Files:**

- Create under: `bench/live-runs/`
- Create: `bench/STYLE-RECEIPT.md`
- Create: `bench/COMPETITIVE-RECEIPT.md`
- Modify: `docs/development/STYLE-BENCHMARK.md`

1. Run the guarded concise benchmark with at least two repetitions per arm.
2. Review anonymized answers against the task acceptance/completeness contract
   and generate the concise receipt.
3. Run the guarded five-arm benchmark with at least two repetitions per arm,
   using the installed Caveman and Ponytail skill paths.
4. Review anonymized answers and generate the competitive receipt.
5. Update the benchmark document with only the measured, task-scoped result and
   cache observation.

## Task 7: Full verification and local delivery

1. Run `node --test tests/*.test.js` from a fresh command.
2. Run plugin validation and generated-artifact checks again.
3. Inspect `git diff --check`, `git status --short`, and the final receipts.
4. Commit the verified work locally on `codex/offcut-verified-efficiency`; do not
   push or merge.
5. Report exact tests, benchmark scope, measured result, remaining uncertainty,
   and commit hash.

