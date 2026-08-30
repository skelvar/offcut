# Offcut response-efficiency benchmark

**Status:** v0.3 has a claimable, task-scoped style receipt and a claimable,
task-scoped five-arm competitive receipt. Both use two counterbalanced
replicates of `busy-helper`. They do not support a general token, cost, LOC, or
cache-savings claim.

Outside that exact ticket and configuration, the result is not claimable and
not comparable.

## What was tested

The style run isolates Offcut's response contract:

| Arm | Construction guidance | Response guidance |
|---|---|---|
| `normal` | Offcut v0.3 kernel | normal prose |
| `terse` | Offcut v0.3 kernel | the one-line control `Be terse.` |
| `concise` | Offcut v0.3 kernel | Offcut's shipped concise contract |

The competitive run uses five isolated profiles:

| Arm | Instruction source |
|---|---|
| `baseline` | no extra instruction |
| `terse` | the literal `Be terse.` |
| `caveman` | the locally installed Caveman skill body |
| `ponytail` | the locally installed Ponytail skill body |
| `offcut` | the native v0.3 `rules/offcut.md` kernel |

All runs used the same ticket, fixture, schedule, requested model
`gpt-5.6-sol`, Codex CLI `0.149.1`, and `low` reasoning effort. Codex did not
report the resolved model ID, so the receipt records
`model_observation: requested_not_reported`. The account was a ChatGPT
subscription; `total_cost_usd: 0` means no provider-priced cost was available,
not that the work was free.

## v0.3 style result

All 6 runs passed executable task acceptance and blinded answer-completeness
review.

| Arm | Gross input | Noncached input | Output | Tools | Duration ms |
|---|---:|---:|---:|---:|---:|
| normal | 99,234 | 36,258 | 1,044.5 | 5 | 54,973.5 |
| terse | 145,647.5 | 26,735.5 | 1,725 | 7.5 | 92,358.5 |
| concise | 117,981.5 | 16,349.5 | 1,265 | 6 | 66,409.5 |

Concise beat the `Be terse.` control on noncached input (-38.847%), output
(-26.667%), tool calls (-20%), and duration (-28.096%). Against normal prose it
reduced noncached input by 54.908%, but regressed gross input (+18.892%), output
(+21.111%), tool calls (+20%), and duration (+20.803%). That is useful
diagnostic evidence, not a general savings win.

Evidence:

- [reviewed JSON](../../bench/live-style-busy-helper-79e24727-reviewed.json)
- [reviewed receipt](../../bench/live-style-busy-helper-79e24727-reviewed.md)
- receipt SHA-256:
  `22f324d1b94984f262313695b7fb3f0ab2c2a52d1ad01173b544aff9ba9a39c9`

## v0.3 competitive result

All 10 runs passed executable task acceptance and blinded answer-completeness
review.

| Arm | Gross input | Noncached input | Output | Tools | Duration ms | Lines added |
|---|---:|---:|---:|---:|---:|---:|
| baseline | 140,091 | 19,771 | 1,890.5 | 7.5 | 85,793 | 11.5 |
| terse | 129,062.5 | 18,854.5 | 1,760 | 7 | 82,283.5 | 12 |
| caveman | 122,527 | 16,287 | 1,483.5 | 6.5 | 70,221 | 17 |
| ponytail | 120,114.5 | 22,322.5 | 1,434.5 | 5.5 | 66,697 | 12 |
| offcut | 99,450.5 | 24,442.5 | 1,228.5 | 5 | 61,216.5 | 17 |

On this ticket, Offcut had the lowest median gross input, output, tool count,
and duration. Its output was 35.017% below baseline, 30.199% below terse,
17.189% below Caveman, and 14.36% below Ponytail. It also used more noncached
input than every arm: +23.628% versus baseline, +29.637% versus terse, +50.074%
versus Caveman, and +9.497% versus Ponytail.

Offcut did **not** match Ponytail's published aggregate claim of 54% fewer LOC
and 20% lower cost. On this one ticket it added a median 17 lines versus
Ponytail's 12 and baseline's 11.5, while the subscription telemetry exposed no
priced cost. Ponytail's published result also covers 12 tasks with four
replicates, so a one-ticket result must not be presented as a reproduction.

Evidence:

- [reviewed JSON](../../bench/live-competitive-busy-helper-79e24727-reviewed.json)
- [reviewed receipt](../../bench/live-competitive-busy-helper-79e24727-reviewed.md)
- receipt SHA-256:
  `07cdebcf042ea8327dc0cb334e49342fcfab85f22279aeb88d8e473087c48097`

Pinned instruction hashes are embedded in the reviewed receipt. The current
Offcut kernel is
`79e24727802b4e91feaf45c62bf810bf821122feb980e55dee3c235b4fcfd699`;
Caveman is
`72969a0f6215f92bdd1766957ca6df28352234a8e91e9eb4b1c821625489f9d6`;
Ponytail is
`a0ff69829e9c80109a17e25adeace231027ffa556d3f131363300f8442c629f9`.

## Cache boundary

Every run was an isolated, one-turn Codex session. Cache-read counters appeared
in the cold aggregate, cache creation was zero, and no session was resumed, so
warm-cache rows are unavailable. Lower gross input or higher cache-read input
is not proof that Offcut improved prompt caching. A cache claim requires a
separate repeated-session experiment with stable prefixes and warm turns.

## Claim gates and review boundary

A receipt fails closed unless every arm is balanced, every ticket passes its
executable acceptance test, controlled model/host/prompt fields match, provider
telemetry is present, instruction hashes remain stable within each arm, and
every answer passes a blind completeness review.

The reviewer sees each final answer without its arm label and checks that it
preserves the result, verification, material caveats, next action, and any
exact safety-critical text. The completed reviews were blinded by arm but were
performed in this development session, not by an independent third party.

Run a plan without model calls:

```powershell
node bench/live-style.mjs busy-helper --reps 2
node bench/live-competitive.mjs busy-helper --reps 2
```

Live execution requires both explicit usage flags. Competitive execution also
requires exact local paths for the Caveman and Ponytail sources; their contents
are read for the run and are not redistributed by Offcut.
