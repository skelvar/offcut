# Phase 11 efficacy result

Raw evidence commit: `4eeea606451623b3a0c18109f33b019413db81cb`

## Result

All 24/24 initial Codex discovery cells completed. Target prevalence was 0/24, acceptance was 22/24, and the preregistered frozen primary outcome was 17/24.

Preregistered stop: no baseline target-positive runs, so no tasks qualified.

**Conclusion:** No efficacy estimate. This is not evidence of no effect; enrichment failed for this model/profile or the baseline was already target-free. No off/full claim is supported.

## Post-hoc sensitivity

5 intermediate tool-command failures were recoverable under the corrected future classifier. Reclassifying them yields 22/24 (91.67%) primary success. This is post hoc and does not change the stop decision because target prevalence remains 0/24.

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
