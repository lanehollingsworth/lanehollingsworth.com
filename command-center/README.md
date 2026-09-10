# California Move Command Center

A stateful relocation operating system: the decision engine, financial model and
dated execution planner behind the move from Orlando to Los Angeles County.

This is **private planning tooling that happens to live in this repo**. It is not
part of lanehollingsworth.com, it renders no pages, it ships no routes, and it
adds no dependencies. `astro build` never looks at it.

## Why it exists

The Google Sheet is a good human dashboard and a bad calculation engine. Once
numbers depend on each other — fuel depends on miles and MPG and gas price;
liquidity depends on the house branch; the lease date depends on the report date —
a spreadsheet stops being a model and starts being a pile of stale cells.

So the responsibilities are split the way a product team would split them:

| Layer | Lives in | Job |
|---|---|---|
| Machine source of truth | `data/*.json` | Facts, assumptions, formulas, provenance |
| Calculation | `src/calculators/`, `src/planners/` | Derive every number, every time |
| Human dashboard | the Google Sheet | Read, edit, share |
| Evidence | quotes, CMAs, inspections | Promote assumptions to verified facts |

Git is the audit trail: every changed assumption is a diff with a date and a
reason, which is exactly the artifact you want when a decision gets questioned
three months later.

## Quickstart

```bash
npm run cc -- readiness          # gate-aware status by workstream
npm run cc -- pulse              # the weekly relocation-readiness pulse
npm run cc -- budget             # move budget, by category and cash-timing bucket
npm run cc -- house              # rent-vs-sell economics and the $350 guardrail
npm run cc -- scenarios          # career path x house branch x employer support
npm run cc -- questions --top 3  # the three highest-value unresolved inputs
npm run cc -- help               # everything else
```

What-if anything without editing a file:

```bash
npm run cc -- budget --set roadtrip.gas_price=5.00
npm run cc -- budget --set roadtrip.tundra_mpg=17
npm run cc -- budget --branch house_rent --support movers_hotels_reimbursed
```

What the model believes, and why:

```bash
npm run cc -- canonical                          # canonical records and how firmly each is held
npm run cc -- why vehicle.tundra.disposition     # belief + evidence + conflicts + decision history
npm run cc -- why career.cherie_role.title       # a record that deliberately believes nothing
npm run cc -- contradictions                     # unsettled conflicts vs superseded history
npm run cc -- decisions                          # the decision log
npm run cc -- validate                           # check canonical-state rules
```

When a trigger becomes real:

```bash
npm run cc -- timeline  --offer 2026-11-18 --report 2027-02-02
npm run cc -- offer-day --date  2026-11-18 --report 2027-02-02
```

Tracking change over time:

```bash
npm run cc -- snapshot   # save the current numbers as the baseline
npm run cc -- diff       # what moved since that baseline
```

## What the model refuses to do

These are enforced in code and data, not in good intentions:

- **A liquidity requirement is never called a cost.** Spend, refundable deposit,
  reserve capital, contingency and recurring exposure are reported separately.
  The rent branch needs ~$31K of liquidity; $12K of that stays Lane's money.
- **Employer coverage is never assumed** in either direction. The default profile
  is `unknown`, modeled at zero coverage — and a *reimbursed* item still shows up
  in the liquidity requirement, because Lane fronts it.
- **Unpriced items stay visible and stay out of every total.** They are listed in
  `budget.unpriced_items`, each pointing at the question that would price it.
- **Windfalls are not cash.** The December RSU gross estimate and any 2027 tax
  refund are excluded from the base case until settled or received. The emergency
  fund is excluded entirely.
- **A typo cannot become $0.** The formula evaluator throws on unknown
  identifiers instead of quietly evaluating them to zero.
- **Recruiting threads are never merged.** Two Cherie-related records exist on
  purpose until a requisition ID says otherwise.
- **Career path and house branch are orthogonal.** No path selects a branch.
- **A short runway is reported, not compressed.** If the required report date is
  earlier than the sequence allows, the timeline says "short by N days" and lists
  remedies — none of which is "drive longer days with the dogs."

## Canonical state: three questions, three fields

Phase 2 added state semantics alongside the existing evidence vocabulary rather
than replacing it, because these are different questions:

| Field | Question | Values |
|---|---|---|
| `evidence_type` | What kind of evidence is this? | verified, sheet_value, lane_confirmed, planning_assumption, historical_observation, research_lead |
| `canonical_state` | What role does this value play in current state? | confirmed, unresolved, conflicting_sources, superseded |
| `verification_state` | Has anyone outside this model confirmed it? | externally_verified, not_externally_verified, not_applicable |

They stay orthogonal because the combinations are real. A **planning assumption
can be the accepted canonical value** — the $4.25 gas price is a placeholder the
model plans on today. A **verified document can be superseded** — the sheet's
"Truck — Evaluate sale" row was once current and is now retired evidence. **Two
externally verified sources can conflict** — an interview itinerary is an
employer document and still does not settle the Cherie title, because the
recruiting context says something else.

`evidence_type` was named `status` in Phase 1. The loader still accepts `status`
as an input alias, and freshness thresholds key off the field exactly as before.

Rules in `data/canonical-state.json` are enforced by `npm run cc -- validate`
and in tests: a `confirmed` record must have a value, `conflicting_sources` must
have none plus at least two sources, `superseded` must point at what replaced it,
and a superseded record must never reach the pending-resolution queue. Only
`confirmed` is commitment-safe; planning continues around everything else.

### The two migrated conflicts

- **`vehicle.tundra.disposition`** — canonical value `drive_to_california`,
  state `confirmed`, with the spreadsheet's `evaluate_sale` retained as a
  `superseded` conflict entry. It is settled history, so it no longer shows up
  as a decision Lane owes anyone. Review is scheduled 3–6 months after arrival.
- **`career.cherie_role.title`** — canonical value `null`, state
  `conflicting_sources`, `resolution_required: external_confirmation`. Both
  titles are preserved with their own provenance. The record is keyed on the
  role, not on a requisition number, because no requisition for it appears in
  any source this model holds.

A third record, **`house.orlando.disposition`**, is `unresolved` (evidence
missing, not contradictory) — which is the distinction the vocabulary exists to
draw. Lane leans toward selling; a lean is not a canonical value.

## Decision log

`data/decisions.json` records meaningful state changes as lightweight ADRs:
subject, previous value, new value, reason, source, reversibility and a review
date. `npm run cc -- why <id>` stitches a record's current belief together with
its conflicts and its decision history, so the model can answer *why* it
believes something, not only *what*.

## Data model

```
data/
  project.json         north star, guardrails, gates, blocked-until-trigger list
  assumptions.json     every modeled input with provenance and a refresh rule
  budget.json          line items as formulas, cash types, timing buckets, support profiles
  house.json           verified mortgage facts, branches, PM and sale workstreams
  career.json          three paths, distinct opportunity threads, timing benchmarks
  finance.json         dated account snapshots, debt plan, launch-fund ladder
  move-sequence.json   the dependency graph the timeline engine walks
  tasks.json           current task state with gates and blockers
  questions.json       the unresolved-input queue and its ranking formula
  risks.json           risk register with probability, impact, mitigation, trigger
  contradictions.json  records that conflict with the latest decisions
  neighborhoods.json / community.json / benefits.json / roadtrip.json / assets.json
  readiness.json       what each workstream is blocked on, and at which gate
```

Every assumption carries `status`, `confidence`, `source`, `last_verified` and a
`refresh_rule`. Freshness thresholds vary by status — a mortgage statement holds
for 90 days, a gas price for 30 — so `npm run cc -- freshness` flags what is
too old to act on rather than treating all inputs as equally durable.

### Changing an assumption

1. Edit the value in `data/assumptions.json`.
2. Update `status`, `source`, `confidence` and `last_verified` in the same edit.
   Promoting `planning_assumption` to `verified` requires an actual document.
3. Run `npm run cc -- diff` to see what moved, then `npm run cc -- snapshot` to
   accept the new baseline.

## Tests

```bash
npm run cc:test
```

`tests/acceptance.test.js` is the Phase 1 acceptance list from the handoff,
one test per question — gas at $5.00, 17 MPG, movers-and-hotels coverage,
rent-vs-sell liquidity, the Nov 18 → Feb 2 timeline, staleness, the top three
unresolved inputs, blocked actions, what changed, and which records conflict.
`tests/model.test.js` locks the arithmetic to the figures the command center
already publishes, so a refactor that quietly changes a total fails loudly.
`tests/canonical.test.js` covers the Phase 2 state semantics: superseded values
do not become open decisions, conflicting sources stay unresolved, the evidence
vocabulary still drives freshness, overrides keep prior provenance, and the
validator actually bites.

CI runs `npm run cc:test` before `npm run build`, so the planning semantics are
enforced on every PR rather than when someone remembers.

## Deliberately not built yet

Phase 1 is about making the state model and the calculations trustworthy.
Not here, on purpose:

- Google Sheets read/write sync — only after the internal model is stable.
- Autonomous web research (live rents, fuel prices, hotel inventory) — needs
  provenance and freshness rules attached to fetched data, or it just launders
  guesses into the model.
- Actual-vs-budget tracking after the move starts.
- Routed road-trip legs with real mileage and pet-friendly hotel candidates.
