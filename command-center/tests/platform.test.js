/**
 * Platform tests: Lane Command Center is the platform, California Move is the
 * first program running on it. These lock the separation in place before a
 * second program exists to prove it the hard way.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync } from 'node:fs';
import { loadProject } from '../src/lib/data.js';
import {
  activeRules,
  retiredRules,
  ruleStatus,
  simulateProgramCompletion,
  resolveAuthority,
  authorityLevel,
  inferenceChallenge,
} from '../src/lib/rules.js';
import { attentionReport } from '../src/lib/attention.js';

const project = loadProject();

test('core state is separated from program state on disk', () => {
  const core = readdirSync(new URL('../data/core', import.meta.url));
  const program = readdirSync(new URL('../data/programs/california_move', import.meta.url));

  // Life domains that outlive the move live in core.
  for (const file of ['career.json', 'finance.json', 'house.json', 'assets.json', 'decisions.json', 'rules.json']) {
    assert.ok(core.includes(file), `${file} belongs to core`);
  }
  // Relocation-specific state lives under the program.
  for (const file of ['budget.json', 'move-sequence.json', 'roadtrip.json', 'program.json']) {
    assert.ok(program.includes(file), `${file} belongs to the program`);
  }
  assert.ok(!core.includes('move-sequence.json'));
});

test('the active program is discovered through the registry, not hard-coded', () => {
  assert.equal(project.program.id, 'california_move');
  assert.equal(project.program.status, 'active');
  assert.ok(project.programs.programs.some((p) => p.id === 'california_move'));
  assert.ok(project.programs.domains.every((d) => d.outlives_programs));
  assert.throws(() => loadProject({ programId: 'no_such_program' }), /No program/);
});

test('no core object type is named after the move', () => {
  // Generic types with a program tag, not MoveTask / MoveRisk / MoveDecision.
  assert.ok(project.tasks.tasks.every((t) => t.program === 'california_move' && t.domain));
  const keys = new Set(project.tasks.tasks.flatMap((t) => Object.keys(t)));
  for (const key of keys) assert.ok(!/^move_/i.test(key), `task field "${key}" is move-specific`);
  assert.ok('rules' in project && 'decisions' in project && 'canonical' in project);
});

// The 2028 test: a completed program must not keep issuing orders.
test('completing the program retires its rules and leaves Lane\'s preferences standing', () => {
  const simulation = simulateProgramCompletion(project, 'california_move');

  assert.ok(simulation.retires.includes('guard.emergency_fund'), 'a Launch Fund guardrail retires with the move');
  assert.ok(simulation.retires.includes('guard.march_is_a_star'));
  assert.ok(simulation.retires.includes('guard.arrival_grace'));

  assert.ok(simulation.survives.includes('pref.financial_optionality'), 'enduring preferences survive');
  assert.ok(simulation.survives.includes('pref.dogs_are_not_cargo'));
  assert.ok(simulation.survives.includes('pref.no_invented_precision'));
  assert.ok(simulation.survives.includes('guard.threads_never_merged'), 'domain guardrails survive');
  assert.ok(simulation.survives.includes('review.tundra_ownership'), 'a vehicle review outlives the move');

  // Nothing is retired while the program is still running.
  assert.equal(retiredRules(project).length, 0);
  const emergencyFund = project.rules.rules.find((r) => r.id === 'guard.emergency_fund');
  assert.equal(ruleStatus(project, emergencyFund).active, true);
  assert.equal(ruleStatus(project, emergencyFund, { programStates: { california_move: 'complete' } }).active, false);
});

test('rules expire by date as well as by program', () => {
  const asOf = '2026-12-01';
  const retired = retiredRules(project, { asOf }).map((r) => r.id);
  assert.ok(retired.includes('fact.hm_interview'), 'a past interview date is no longer a live fact');
  assert.ok(retired.includes('fact.annual_enrollment'));
  assert.ok(!activeRules(project, { asOf }).some((r) => r.id === 'fact.hm_interview'));
  // And an enduring preference is untouched by any date.
  assert.ok(activeRules(project, { asOf: '2030-01-01' }).some((r) => r.id === 'pref.dogs_are_not_cargo'));
});

test('every rule declares a lifecycle, a scope and an authority', () => {
  const lifecycles = new Set(Object.keys(project.rules.lifecycles));
  for (const rule of project.rules.rules) {
    assert.ok(lifecycles.has(rule.lifecycle), `${rule.id} has an unknown lifecycle`);
    assert.ok(rule.owner_scope, `${rule.id} has no owner_scope`);
    assert.doesNotThrow(() => authorityLevel(project, rule.authority), `${rule.id} has an unknown authority`);
    if (rule.lifecycle === 'temporary_rule') {
      assert.ok(rule.review_trigger || rule.expires_when, `${rule.id} is temporary with no end`);
    }
  }
});

test('an inference cannot overrule a decision', () => {
  const resolution = resolveAuthority(project, 'agent_inference', 'active_guardrail_or_decision');
  assert.equal(resolution.winner, 'active_guardrail_or_decision');
  assert.equal(resolution.must_report, true);

  assert.equal(resolveAuthority(project, 'lane_explicit_instruction', 'verified_external_fact').winner, 'lane_explicit_instruction');
  assert.ok(authorityLevel(project, 'agent_inference') > authorityLevel(project, 'planning_assumption'));

  const challenge = inferenceChallenge(project, {
    subject: 'vehicle.tundra.disposition',
    decision_id: 'decision.tundra.drive_to_ca',
    changed_premise: 'Household goods would no longer move separately',
    reason: 'The mover quote came back above the budget',
  });
  assert.equal(challenge.kind, 'review_trigger');
  assert.equal(challenge.overrides_decision, false);
  assert.equal(challenge.authority, 'agent_inference');
});

test('attention separates what to do from what to deliberately leave alone', () => {
  const report = attentionReport(project);
  assert.ok(report.needs_attention.length > 0);
  assert.ok(report.deferred.length >= 8, 'deferral is a first-class output, not an empty category');
  assert.ok(report.deferred.every((item) => item.deferral_reason && item.revisit_trigger));
  assert.ok(report.waiting_on.every((item) => item.external_party));
  assert.deepEqual(report.violations, [], 'no item sits in a state without what that state requires');

  // Interview week: the search and the neighborhood reading are quiet, not overdue.
  const watching = report.watching.map((item) => item.id);
  assert.ok(watching.includes('t.selective_search'));
  assert.ok(watching.includes('t.neighborhood_research'));

  // The system does not yet claim to rank across domains, and says so.
  assert.ok(report.limits.some((limit) => limit.includes('Cross-domain arbitration')));
});

test('a standing constraint is a rule, not a perpetually open task', () => {
  const taskIds = project.tasks.tasks.map((t) => t.id);
  assert.ok(!taskIds.includes('t.no_invented_transfer'));
  assert.ok(project.rules.rules.some((r) => r.id === 'guard.no_invented_transfer'));
  assert.equal(project.tasks.promoted_to_rules[0].now, 'guard.no_invented_transfer');
});

test('the program knows how it ends', () => {
  assert.ok(project.program.completion_criteria.length >= 3);
  assert.ok(project.program.on_completion.some((step) => step.includes('retires automatically')));
  assert.ok(project.programs.not_built_yet.length > 0, 'the platform is explicit about what it cannot do yet');
});
