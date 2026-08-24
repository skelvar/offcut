---
name: offcut-review
description: >
  One-shot Offcut review of a diff: run the same write-time signals against
  changed lines and report findings. Use when the user asks to review a diff
  for over-engineering, bloat, speculative abstractions, unused exports, or
  invokes /offcut-review. Do not use for mode switches (/offcut full|lite|
  strict|off), repository-wide audits (use offcut-audit), explaining code,
  rename-only edits, formatting, or answering "what does this function do?".
license: MIT
compatibility: Requires Node.js on PATH to run scripts/scan.mjs. Touches no mode state.
metadata:
  version: "0.3.0"
  author: xyzbk
---

# Offcut review

Apply Offcut's deterministic signals to a **diff**, once. This is a command, not
a mode: do not change `~/.offcut/` or any Offcut state file.

## Steps

1. Obtain the diff the user cares about (`git diff`, `git diff --cached`, a
   pasted patch, or a path they named). Prefer the smallest relevant range.
2. Run the scanner from the repository root (zero deps; read-only):

   ```bash
   node scripts/scan.mjs --diff - <<'DIFF'
   …paste or pipe the unified diff…
   DIFF
   ```

   Or write the diff to a temp file and pass its path:

   ```bash
   node scripts/scan.mjs --diff /path/to/changes.diff
   ```

3. Present every finding. Group by path. Do not invent signals the scanner did
   not emit. If the scanner prints `No Offcut findings.`, say so in one line.
4. For each finding, answer the challenge in plain language: does it need to
   exist, does it already exist, can something cheaper do it, where does it
   belong — then stop. Do not rewrite the whole diff unless asked.

## Rules

- **Do not write Offcut state.** Commands leave the mode exactly as found.
- **Do not re-implement signals in prose.** `hooks/signals.js` via
  `scripts/scan.mjs` is the only definition.
- Signals that only make sense on a live create (`new-file`,
  `large-first-write`) may appear for newly added files in the diff; they do
  not run in a repo audit.
- No network. The scanner must not modify files.
