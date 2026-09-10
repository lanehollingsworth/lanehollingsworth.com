# ADR-001 — Lane Command Center is the platform; California Move is a program

**Status:** accepted · **Date:** 2026-09-10 · **Supersedes:** the implicit assumption that this repo is a relocation tool

## Context

Phase 1 and Phase 2A–2D were built to answer relocation questions, but almost
nothing in them is actually about relocation. State, provenance, freshness,
goals, constraints, resources, scenarios, dependencies, decisions, triggers,
risks, attention and execution are life-management concepts. The move is simply
the first initiative large enough to force us to model them properly.

The risk of not naming this now is concrete: in April 2027 the move completes,
and every core object is called `MoveTask`, `MoveDecision`, `MoveRisk`,
`MoveBudget`, `MoveMilestone`. The useful part of the system would then be
trapped inside a finished project — and worse, a completed program's rules
would keep firing. Nobody wants to be told in 2028 that they are violating a
California Launch Fund guardrail.

## Decision

**Lane Command Center is a stateful personal decision and execution system.** It
maintains an evidence-based model of Lane's goals, commitments, resources,
projects, decisions, risks and opportunities; determines what deserves
attention; protects explicit guardrails; and converts major life initiatives
into executable plans.

**California Move is its first production program**, not its identity.

```
Lane Command Center (platform)
├── core/          rules, authority, action states, canonical state, decisions
│                  and the life domains that outlive any one program
└── programs/
    └── california_move/   north star, gates, budget, sequence, tasks, risks
```

Core object types are generic — Task, Decision, Risk, Question, Assumption,
Rule, Milestone — and carry `program` and `domain` tags. Program-specific
*calculators* stay program-specific: `move-budget.js`, `road-trip.js` and
`house-rent-vs-sell.js` are relocation logic and belong under the move, not in
the platform. Generalizing them would be the mistake in the other direction.

## What this ADR changed immediately

Four things that are cheap now and expensive to retrofit:

1. **Ownership.** Data is split into `core/` and `programs/california_move/`.
   The loader discovers the active program through `core/programs.json` rather
   than hard-coding it.
2. **Rule lifecycle.** Every rule declares `lifecycle`, `owner_scope`,
   `expires_when` and `review_trigger`. A rule scoped `program:california_move`
   retires when that program completes; an enduring preference never does.
   `simulateProgramCompletion()` shows exactly what would retire, before it
   matters.
3. **Authority hierarchy.** Lane's explicit instruction → active guardrail or
   approved decision → verified external fact → current project state →
   historical pattern → planning assumption → agent inference. Conflicts are
   reported, never silently resolved, and an inference that contradicts a
   decision becomes a *review trigger*, not a reversal.
4. **Action states.** ACT_NOW, PLAN_NOW, RESEARCH_NOW, SCHEDULED,
   WAITING_ON_SOMEONE_ELSE, WATCH, INTENTIONALLY_DEFERRED, NOT_WORTH_DOING,
   BLOCKED, COMPLETE. Deferral is a decision with a reason and a revisit
   trigger, reported as deliberate rather than as debt.

## Rule lifecycles, and why they differ

| Lifecycle | Example | Ends when |
|---|---|---|
| `enduring_preference` | Klein and Tilly are never cargo | Lane says so |
| `active_guardrail` | Emergency fund is not program capital | Its scope ends |
| `temporary_rule` | $350/week food cap | Its review fires |
| `project_decision` | Rent in California for 6–12 months | The program completes |
| `current_assumption` | CA rent target $3,200 | Better evidence arrives |
| `external_fact` | Interview on 2026-09-15 | The date passes |
| `future_review` | Reconsider the Tundra at 3–6 months | It fires once, becoming a decision |

Collapsing these into one "rules" list is how a system ends up nagging about a
finished project.

## Consequences

- Adding a second program means adding a directory and a registry entry.
- Completing California Move is a status change, not a teardown:
  `project.california_move → COMPLETE`, its rules retire, and the decision log,
  the domain guardrails and Lane's preferences carry on.
- Decision memory becomes the durable asset. Six months from now the answer to
  "why did we bring the Tundra?" is a record with its reasons, its review
  trigger and what to evaluate at review — not a memory.
- Some duplication remains: `assumptions.json` still holds durable home facts
  (mortgage, escrow) alongside move planning inputs. Promoting those to
  `core/house.json` is a follow-up, deliberately not done in the same pass as
  the directory split.

## Explicit non-goals

The valuable product is trustworthy state, math, sequencing, provenance and
decision logic. Not built, and not to be built merely because they sound
agentic: cross-domain attention arbitration, calendar/energy/capacity modeling,
routines as a first-class object, multi-agent orchestration, autonomous
purchasing, booking, signing, listing or transferring, broad scraping with weak
provenance, vector search without a demonstrated retrieval need, a chat UI, or a
mobile app.

**Monitor** is the agent's job. **Regulate** means helping Lane regulate the
system — never the agent assuming authority over his life. Signing leases,
spending meaningful money, selling assets, accepting jobs and changing financial
strategy stop at *ready for Lane decision*.

## The end state

Sometime after California is normal life, we do not shut this down:

```
project.california_move
status: COMPLETE
```

The Command Center keeps going.
