# Scanner recall corpus

Labeled agent-authored pull-request diffs used by `node bench/recall.mjs`.

**Caveat:** labels were produced by one agent in one session, not an independent rater; treat recall as an estimate.

Every manifest line has `"labeled_before_scan": true`. Diffs were read and labeled before `scripts/scan.mjs` or `bench/recall.mjs` ran on this corpus.

Ponytail `benchmarks/results` contains markdown reports, not a directory of per-task diffs, so none were included.
