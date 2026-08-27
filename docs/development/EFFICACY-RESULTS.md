# Phase 11 efficacy result

Raw evidence commit: `9263a1f1e30102c3824497ceb083a4d95c6cddcc`

## Result

All 24/24 initial Codex discovery cells completed. Target prevalence was 0/24, acceptance was 22/24, and the preregistered frozen primary outcome was 17/24.

Discovery stop unchanged: no baseline target-positive runs. A user-directed no-opportunity confirmatory grid ran separately.

**Conclusion:** No efficacy estimate. This is not evidence of no effect; enrichment failed for this model/profile or the baseline was already target-free. No off/full claim is supported.

## No-opportunity confirmatory grid

User-directed override after the discovery stop. Six tasks (`event-normalizer`, `query-string`, `inventory-reservation`, `order-label`, `asset-base-url`, `csv-summary`), 96/96 cells. This is not an Offcut efficacy estimate.

Primary counts accepted target-free cells whose sealed failure_kind is not retryable. Frozen primary still requires `failure_kind==null` and is not comparable across arms for cells classified before the CLI-warning fix.

- `off`: accepted 41/48, target 3/48, primary 38/48 (frozen 38/48), LOC +1513/-80
- `full`: accepted 43/48, target 0/48, primary 43/48 (frozen 27/48), LOC +976/-80

## Post-hoc sensitivity

The sealed transcripts contain 5 runs with terminal `turn.completed`, valid usage, and only recoverable item-level tool failures. If those transcript conditions are treated as completion, primary success would be 22/24 (91.67%).

This is a transcript-based post-hoc upper bound, not a corrected outcome. The top-level exit code was not sealed for these runs, so the frozen 17/24 remains authoritative and the sensitivity cannot replace it. It does not change the stop decision because target prevalence remains 0/24.

## Categories

- `new-dependency`: target 0/8, accepted 7/8, frozen primary 7/8
- `speculative-abstraction`: target 0/10, accepted 9/10, frozen primary 4/10
- `large-first-write`: target 0/2, accepted 2/2, frozen primary 2/2
- `new-config-surface`: target 0/2, accepted 2/2, frozen primary 2/2
- `unused-default-param`: target 0/2, accepted 2/2, frozen primary 2/2

## Tasks

- `asset-base-url`: target 0/2, accepted 2/2, frozen primary 2/2
- `audit-redactor`: target 0/2, accepted 2/2, frozen primary 2/2
- `csv-summary`: target 0/2, accepted 2/2, frozen primary 2/2
- `duration-label`: target 0/2, accepted 1/2, frozen primary 1/2
- `event-normalizer`: target 0/2, accepted 2/2, frozen primary 2/2
- `feature-gate`: target 0/2, accepted 2/2, frozen primary 1/2
- `inventory-reservation`: target 0/2, accepted 1/2, frozen primary 0/2
- `order-label`: target 0/2, accepted 2/2, frozen primary 2/2
- `query-string`: target 0/2, accepted 2/2, frozen primary 2/2
- `route-matcher`: target 0/2, accepted 2/2, frozen primary 0/2
- `safe-filename`: target 0/2, accepted 2/2, frozen primary 2/2
- `webhook-signature`: target 0/2, accepted 2/2, frozen primary 1/2

## Cost and telemetry

- LOC: +681/-42
- Duration: 1465425 ms total; median 56197.5 ms; range 38210-98182 ms
- Input tokens: 2123514; median 77521
- Output tokens: 35143; median 1367.5
- Cache-read input tokens: 1709312; median 67328
- Noncached input tokens: 414202
- Reasoning output tokens: 7254; median 264
- Incremental API billing: $0 (ChatGPT subscription; membership cost not measured)

## Environment and history

Codex CLI 0.149.1, requested model `gpt-5.6-sol` (requested_not_reported; observed model ID unavailable), low reasoning, named `ticket-worker` profile, automatic_review, workspace-write (approve-for-me).

9 Codex preflights preceded discovery; 1 passed the final write proof. 3 legacy Claude attempts separately ended in subscription-disabled 403 responses with zero tokens and zero reported cost.
