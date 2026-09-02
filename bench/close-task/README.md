# Offcut Close research task

This directory retains the prompt-only prototype and one real-world Cursor
comparison. The skill here is a benchmark treatment, not a shipped Offcut
command.

`seed/` is the model-visible checkout. `accept.mjs`, `partial/`, and
`reference/` are the external oracle and controls; the live runner copies only
`seed/` into each arm. Run `node run-cursor.mjs --plan` for a no-cost preflight.
Paid execution requires `--run` and an optional `--arm`.

The final result is a no-go for productization. See `../close-runs/RESULTS.md`.
