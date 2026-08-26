---
name: offcut-audit
description: >
  One-shot Offcut audit of a repository or file set: run the deterministic
  signals through scripts/scan.mjs across existing files and report ranked
  findings. Use when the user asks to audit a repo or codebase for
  over-engineering, bloat, unused exports, speculative abstractions or stray
  config surface, asks what Offcut flags across the tree, or invokes
  /offcut-audit. Do not use for mode switches (/offcut full|lite|strict|off),
  reviewing a single diff (use offcut-review), applying the fixes, explaining
  code, rename-only edits, formatting, or "what does this function do?".
license: MIT
compatibility: Requires Node.js on PATH to run scripts/scan.mjs. Touches no mode state.
metadata:
  version: "0.1.0"
  author: xyzbk
---

# Offcut audit

Apply Offcut's deterministic signals across a **repository** (or an explicit
file list), once. This is a command, not a mode: do not change `~/.offcut/` or
any Offcut state file.

The persistent Offcut mode never scans a repository on its own. An audit runs
only because the user asked.

## Steps

1. Decide the scope. Default: the current working tree root. Honor any paths
   the user named. Prefer source files; the scanner already skips
   `node_modules`, `.git`, and common build dirs when walking directories.
2. Run the scanner from the repository root (zero deps; read-only):

   ```bash
   node scripts/scan.mjs .
   ```

   Or pass explicit paths:

   ```bash
   node scripts/scan.mjs hooks skills scripts
   ```

3. Present findings **ranked** as the scanner emits them (paths with more hits
   first). Do not invent signals it did not emit. If it prints
   `No Offcut findings.`, say so in one line.
4. Summarize themes in a short list (unused exports, wrappers, config surfaces,
   etc.), then stop unless the user asks for fixes.

## Rules

- **Do not write Offcut state.** Commands leave the mode exactly as found.
- **Do not re-implement signals in prose.** `hooks/signals.js` via
  `scripts/scan.mjs` is the only definition.
- `large-first-write` **cannot** fire here — every audited file already exists.
  That check only means something at write/diff time.
- `exported-unused` uses a cross-file corpus and requires evidence of a
  multi-module program. Treat its output as authoritative for this scan.
- No network. The scanner must not modify files.
