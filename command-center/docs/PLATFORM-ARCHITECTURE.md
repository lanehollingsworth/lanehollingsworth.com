# Lane Command Center — Platform Architecture v1

**Status:** Architectural North Star · **Current production program:** California Move

This document supersedes earlier scattered platform-level guidance where they
conflict. It does **not** supersede verified California Move domain values,
Phase 1 regression expectations, or the bounded Phase 2 implementation order.

It grants permission to *design* for the larger vision. It does not grant
permission to disappear into an infrastructure rewrite.

## 1. The decision

The platform is **Lane Command Center**. California Move is its first major
program: `project.california_move`. Completing the move must not make the
platform obsolete — and must not require a rewrite to survive.

Do not restructure everything to satisfy the conceptual model. Ensure new
foundational abstractions are generic enough that the program can finish
underneath them.

## 2. Mission

A stateful personal decision and execution system holding an evidence-based
model of goals, commitments, resources, projects, decisions, risks,
opportunities, constraints, preferences and relevant external circumstances.

Its question is: **what materially deserves Lane's attention now, what can be
handled or monitored without him, and what should deliberately be left alone?**

It protects five scarce resources: **attention, money, time, optionality,
energy**. It never optimizes activity for its own sake.

## 3. Constitution

| | Principle |
|---|---|
| A | **Proof over confidence.** `should work != works`; `implemented != verified`; `verified != permanently verified`. |
| B | **Protect attention.** An actionable task existing does not mean acting today. |
| C | **Intentional non-action is valid.** "Do nothing yet" can be the correct answer. |
| D | **Evidence outranks inference.** Never silently promote an inference to a fact. |
| E | **Preserve optionality.** Where waiting is cheap and uncertainty remains, build reversible options. |
| F | **Authority is earned by capability.** Autonomy is not one global permission bit. |
| G | **Decisions retain history.** Answer *why*, not only *what*. |
| H | **Never manufacture urgency.** Urgency comes from deadlines, dependencies, risk, opportunity cost or Lane — never from an agent's need to produce activity. |

## 4. Core domain model

Generic primitives: Project, Goal, Task, Milestone, Decision, Assumption,
Observation, Signal, Risk, Opportunity, Resource, Asset, Commitment, Person,
Organization, Event, Document, Evidence, Guardrail, Preference, Recommendation,
Action, Verification.

Never `MoveTask` / `MoveDecision` / `MoveRisk` when the concept is generic —
`{ "type": "task", "project": "california_move" }` instead. Program-specific
*calculators and rules* may stay program-specific. Do not force generic
abstraction where it buys nothing.

## 5. Evidence, canonical state and verification are separate dimensions

`evidence_type` (what kind of evidence) · `canonical_state` (what role the value
plays now) · `verification_state` (has anyone outside confirmed it). Something
can be externally verified and later superseded; externally verified and still
in conflict with another external source; a planning assumption and still the
canonical planning value. Do not collapse these for schema neatness.

## 6. Decision memory

Decisions behave like lightweight ADRs: subject, previous value, new value,
reasons, review trigger, reversibility. At a review trigger the system does not
overwrite — it says *"we decided X because A, B and C; B has materially changed,
so this decision has reached its review condition."*

## 7. Pipeline (long-term)

```
sensors → observations → deterministic signal engine → synthesis
        → Lane model → reasoning → attention arbitration
        → recommendation / action policy → verification → feedback
```

Use ordinary code for what code can establish reliably (deadline inside 72
hours, calendar collision, stale assumption, decision review reached, budget
variance, missing dependency). Reserve model reasoning for ambiguity,
synthesis, prioritization and cross-domain judgment. Do not store every
observation forever because storage is cheap.

## 8. Memory lifecycle

Ephemeral observation · historical event · synthesized pattern · durable
preference · pinned principle · active guardrail · project-specific rule.
Different lifecycles. **Project rules must not survive their project.**

## 9. Lane model

May eventually hold goals, priorities, preferences, decision patterns,
commitments, relationships, capacity, financial guardrails, risk tolerance and
long-term direction — evidence-based, never invented personality conclusions.
Lane's explicit current instruction outranks any inferred pattern.

## 10. Authority hierarchy

Lane's explicit instruction → active guardrail or approved decision → verified
external fact → current project state → historical pattern → planning
assumption → agent inference. Guidance, not an absolute algorithm: provenance,
recency and context still matter.

## 11. Graduated autonomy

Authority belongs to individual capabilities, not to the system.

| Capability | Authority |
|---|---|
| Refresh deterministic calculation, detect stale assumption, read an approved source, prepare a briefing, draft a recommendation | AUTO |
| Modify a planning record | SUPERVISED / approval depending on the record |
| Send a communication | APPROVAL REQUIRED initially |
| Sign a lease, accept a job, sell the house, liquidate investments, waive relocation benefits | LANE ONLY |

Autonomy may increase where measured performance justifies it, and may be
revoked.

## 12–15. Verification contract

See [ADR-002](ADR-002-verification-contract.md), which implements this section:
work-item lifecycle (`implemented != complete`), evidence types, the
claim-to-proof table, levels 0–5, `cc verify`, and staleness on source change.

## 16. Evidence-based recommendation confidence

Evidence coverage over material inputs, never a self-reported percentage, and
always naming what is unresolved.

## 17. Attention arbitration

The daily shape to build toward: *needs Lane · I can handle · watching ·
waiting on others · deliberately leave alone · something I noticed · decision
approaching*. "Deliberately leave alone" is load-bearing: an agent with broad
visibility will always find something optimizable, and that does not make
optimizing it desirable.

## 18. Anticipation

Eventually notice, before being asked: a commitment with no calendar time, an
approaching deadline with blocked prerequisites, a financial pattern departing
from its guardrail, a decision reaching its review trigger, a stale assumption
becoming decision-critical, a demanding week where low-value work can be
deferred. Rank by materiality. Anticipation must not become nagging.

## 19. California Move

North Star: **living in Los Angeles County in a Disney role by March 2027,
without depleting current financial standing to make it happen.** Three career
pathways (new CA role · current role to Glendale · other qualifying CA role),
independent of the Orlando house branch (sell / rent / defer) and of employer
support. Do not destabilize the California model to generalize the platform.

## 20. Bounded sequencing

`2A` CI enforcement · `2B` canonical state · `2C` Tundra + Cherie migrations ·
`2D` decision log · **`2E` read-only Sheets adapter** · `2F` diff engine ·
`2G` scenario cleanup · `2H` timeline metadata + earliest-safe-Glendale ·
`2I` cash timing / peak liquidity · `2J` freshness contract · `2K` live-data
adapters · `2L` approved write-back · `2M` Offer-Day integration.

## 21. Google Sheets (2E)

OAuth · **read-only** · minimum practical scope · no Drive-wide authority · no
writes in the read adapter. The spreadsheet ID is configuration, not code: it
lives in the environment, never in this repository.

**Acceptance gate.** "OAuth configured" is not completion. "Code should work"
is not completion. Required: real OAuth authentication, real read of the actual
spreadsheet, expected tabs returned, known records parsed, known conflicts
detected, `write_count == 0`, and verification evidence captured.

## 22. Adopted patterns

Deterministic fast path before model judgment · graduated autonomy · observation
→ synthesis → bounded retrieval (not unlimited history in every call) ·
behavioral model kept separate from raw memory · anticipation. Patterns, not
implementations: do not import another system's thresholds, decay constants,
agent counts or schedules without Lane-specific evidence.

## 23. Non-goals

Multi-agent framework, vector database, Docker fleet, event bus, mobile app,
chat UI, autonomous transfers, communications, bookings, purchases or property
transactions, location tracking, background worker fleets, broad scraping.
Infrastructure must be earned by a demonstrated use case.

## 24. The product test

What do we believe · why · how fresh · what conflicts · what changed · which
decisions and why · which have reached review · what matters today · what can
wait · what to ignore · what the agent may handle · what needs approval · which
risks and opportunities deserve attention · what is about to matter · **did the
action actually work?**

And for the current program: *given a real California trigger today, what is the
earliest financially and logistically responsible date Lane can begin working
from Glendale, and exactly what must happen between now and then?*

## 25. Motto

> Protect attention. Surface what matters.

> Ask for proof, not confidence.

---

# Appendix A — Gap analysis, 2026-09-10

Current branch `claude/california-move-command-center-dfi4tp` at `c5118fa`,
assessed against the architecture above.

## Already in place

| Architecture | Where |
|---|---|
| §1 platform / program split | `data/core/` + `data/programs/california_move/`, registry-driven loader |
| §4 generic primitives | Task, Decision, Risk, Question, Assumption, Rule with `program` + `domain` tags |
| §5 three state dimensions | `core/canonical-state.json`, enforced by `cc validate` |
| §6 decision memory | `core/decisions.json`, `cc why <id>` |
| §8 memory lifecycle | `core/rules.json` lifecycles; program rules retire with the program |
| §10 authority hierarchy | `core/rules.json`, `resolveAuthority()`, `inferenceChallenge()` |
| §12–15 verification | `core/verification.json`, `core/capabilities.json`, `cc verify`, CI gate |
| §16 evidence coverage | `evidenceCoverage()`, `recommendations.json` |
| §17 action states (partial) | `core/action-states.json`, `cc attention` |
| §20 sequencing | 2A–2D shipped and verified |

## Gaps that would materially block the direction

1. **§11 graduated autonomy — absent.** Nothing in the model records what a
   capability is allowed to do on its own. Closing this *before* the first
   external integration matters, because 2E is the first capability that
   reaches outside the repo. **Fixed in this pass** (`core/autonomy.json`).
2. **§7 sensors — no concept.** The Sheets adapter would have been the first
   sensor with nowhere to declare itself, its scope or its authority. **Fixed
   in this pass** (`core/sensors.json`), including least-privilege scope and
   configuration by environment variable.
3. **§7 observations and signals — absent.** Needed for 2F's diff
   classification and for anticipation. Deliberately deferred: building it
   before a real sheet read would encode invented assumptions about the data.
4. **§17 attention arbitration — reports, does not rank.** Known and declared
   in the report's own limits. Needs calendar and capacity; not before 2H.
5. **§9 Lane model — absent.** Correctly premature.
6. **§14 `NOT ENABLED` status.** `cc verify` collapses "built but switched off"
   into NOT_IMPLEMENTED. Add when the first switchable capability exists (2L).

## Cosmetic, deliberately not churned

- The architecture writes `project.california_move`; the implementation uses
  `program` (`programs/california_move`, `cc program`). Same concept. Renaming
  would touch every consumer for no behavioral gain.
- `assumptions.json` still holds durable home facts alongside move inputs
  (carried from ADR-001's consequences).

## Environment note

This repository is **public**. Personal financial state — balances, APR,
mortgage principal, named recruiters — is committed to it. That is a decision
for Lane, not a technical gap; recorded here so it is not lost. New
configuration (spreadsheet ID, OAuth client) is kept out of the repository
regardless, and a test enforces it.
