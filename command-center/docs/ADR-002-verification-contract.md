# ADR-002 — Proof over confidence

**Status:** accepted · **Date:** 2026-09-10 · **Builds on:** [ADR-001](ADR-001-lane-command-center.md)

## Context

Every claim made while building this system has been true. That is not the
point. The point is that the *link* between a claim and its evidence has been
carried in prose, by an agent, in a chat window — which means it has been taken
on trust rather than checked.

A task is not complete because an agent says it worked. Implementation finishing
without throwing an error proves that nothing crashed, not that the thing works.

This matters more, not less, as the Command Center reaches further into Lane's
life. "You have nothing scheduled Thursday evening" is only useful if the system
can say which calendars it read and when. "Your Venture balance is $8,192.11" is
only useful with a source and a retrieval time attached.

## Decision

**Verification is a first-class object**, alongside tasks, decisions,
assumptions, risks and sources. No feature, integration, calculation, sync,
mutation or external action may be reported as working solely because
implementation finished.

### Work items cannot skip verification

```
planned → in_progress → implemented → verification_required → verified → complete
                            ↑                                    ↓
                            └──── verification_failed ←──────────┘
                                       verification_stale
```

`implemented` is not `complete`. There is no transition from `in_progress` or
`implemented` directly to `complete`; `complete` is reachable only from
`verified`. This is enforced in `advanceWorkItem()`, which throws, and tested.

### Evidence must match the claim

| Claim | Minimum acceptable proof | Level |
|---|---|---|
| Code compiles | Successful build | 1 |
| Calculation works | Deterministic / known-answer test | 2 |
| CLI works | Actual CLI execution, exit code, captured output | 3 |
| Integration works | Real external request and validated response | 4 |
| Read sync works | Live read plus expected-data assertion | 4 |
| Write sync works | Live write plus re-read verification | 4 |
| Scheduled action works | An observed scheduled run | 5 |
| Data changed correctly | Pre-state, mutation, post-state, comparison | 4 |

Levels run 0 (unverified) to 5 (operational). Evidence *below* a capability's
required level leaves it `INSUFFICIENT_PROOF`, however much of it there is: a
passing parser test against a fixture does not verify that a live provider is
reachable with our credentials, and a green site build does not verify the
Command Center's behavior — which is exactly why `cc:test` and `cc:verify` both
run in CI.

Not everything needs level 5. The fuel calculator is entirely trustworthy at
level 2. A Sheets write will need level 4 before anyone calls it working.

### Verification goes stale when its sources change

Each verification records a SHA-256 fingerprint of the files its contract
covers (`invalidated_by`). When those files change, the recorded pass becomes
`VERIFICATION_STALE` — dependency tracking for proof. "It passed last Tuesday"
says nothing about code changed today.

### Report proof, not adjectives

Not "Sheets sync is working" but:

```
Google Sheets read-only sync and diff - NOT_IMPLEMENTED
  claim: read_sync_works   needs level 4   not required yet
  Not built. No evidence, and none borrowed.
  blocked on: Sheet ID; OAuth client credentials (never committed)
```

`npm run cc:verify` runs every capability that has a runner, records the
evidence to `outputs/verification-log.json`, prints expected-vs-actual for each
assertion, and **exits non-zero when a required capability is not verified**.
CI runs it.

### Recommendations carry evidence coverage, never a confidence percentage

A recommendation's support is computed from the evidence state of its material
inputs, and always names what is unresolved:

```
Do not sign a California lease yet.
  [ ] career.cherie_role.title - unresolved (conflicting_sources)
  [x] sell.liquidity - modeled (VERIFIED)
  [ ] ca_housing.monthly_rent - planning_assumption
  [ ] q.relocation_support - unresolved (open)
  Evidence coverage: 2/4 material inputs (1 resting on a planning assumption).
```

An input counts as covered when the model knows what it is standing on —
including knowing it is a placeholder. Only `unresolved` is a hole.

## Consequences

- Nine capabilities are registered. Five are verified by evidence from the
  current run; four report NOT IMPLEMENTED with what they are blocked on.
- The Sheets integration cannot be called working until it has reached the real
  spreadsheet, and its contract says so before a line of it is written.
- `cc verify --status` reports from the log without re-running, so staleness is
  visible without paying for a full run.
- Verification is only as honest as its contracts. A capability whose
  `invalidated_by` list is wrong will go stale late — the fingerprint is a
  mechanism, not a guarantee of good contract-writing.

## The two principles together

> What deserves attention today — and what should deliberately be left alone?

> Ask for proof, not confidence.

The Command Center is not meant to be a very smart assistant with wide access.
It is meant to be a skeptical, evidence-driven layer that knows what it knows,
knows why, knows how fresh it is, can prove its own machinery works, and is
comfortable saying **unverified** instead of bluffing.
