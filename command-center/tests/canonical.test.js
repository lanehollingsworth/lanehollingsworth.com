/**
 * Phase 2 (2A-2D) tests: CI enforcement, canonical-state semantics, the two
 * conflict migrations, and the decision log.
 *
 * Numbered comments map to the test list in the Phase 2 brief.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProject, normalizeAssumption } from '../src/lib/data.js';
import {
  validateCanonical,
  pendingResolution,
  supersededHistory,
  explain,
  stateNodes,
  commitmentSafe,
  decisionsFor,
} from '../src/lib/canonical.js';
import { checkFreshness } from '../src/research/freshness.js';
import { buildSnapshot, diffSnapshot } from '../src/reports/snapshot.js';
import { buildReadiness } from '../src/reports/readiness.js';

const project = loadProject();

// 2A. CI must run the Command Center tests, not just the site build.
test('CI runs cc:test alongside the site build', () => {
  const workflow = readFileSync(new URL('../../.github/workflows/ci.yml', import.meta.url), 'utf8');
  assert.match(workflow, /npm run cc:test/);
  assert.match(workflow, /npm run build/);
});

// 1. A superseded spreadsheet value does not create an unresolved decision.
test('the stale truck row is superseded history, not an open decision', () => {
  const truck = project.canonical.records.find((r) => r.id === 'vehicle.tundra.disposition');
  assert.equal(truck.canonical_value, 'drive_to_california');
  assert.equal(truck.canonical_state, 'confirmed');

  const retired = truck.conflicts[0];
  assert.equal(retired.value, 'evaluate_sale');
  assert.equal(retired.canonical_state, 'superseded');
  assert.equal(retired.superseded_by, 'vehicle.tundra.disposition');
  assert.ok(retired.resolution_reason);

  const pendingIds = pendingResolution(project).map((item) => item.id);
  assert.ok(!pendingIds.includes('vehicle.tundra.disposition'));
  assert.ok(!pendingIds.includes('c.truck_disposition'));
  assert.ok(supersededHistory(project).some((row) => row.id === 'c.truck_disposition'));

  // And it is still safe to plan the road trip on it.
  assert.equal(commitmentSafe(project, stateNodes(project).find((n) => n.id === 'vehicle.tundra.disposition')), true);
});

// 2. Two genuinely conflicting source facts remain unresolved.
test('the Cherie title stays unresolved with both sources preserved', () => {
  const title = project.canonical.records.find((r) => r.id === 'career.cherie_role.title');
  assert.equal(title.canonical_value, null);
  assert.equal(title.canonical_state, 'conflicting_sources');
  assert.equal(title.resolution_required, 'external_confirmation');
  assert.equal(title.sources.length, 2);

  const values = title.sources.map((s) => s.value);
  assert.ok(values.includes('Senior Product Manager II'));
  assert.ok(values.some((v) => v.startsWith('Sr Principal Product Manager')));
  assert.ok(title.sources.every((s) => s.source && s.evidence_type && s.verification_state));

  // Externally verified is not the same as decisive.
  const itinerary = title.sources.find((s) => s.verification_state === 'externally_verified');
  assert.equal(itinerary.evidence_type, 'verified');
  assert.equal(commitmentSafe(project, stateNodes(project).find((n) => n.id === 'career.cherie_role.title')), false);

  // No requisition number was invented to key the record.
  assert.equal(title.requisition_id, null);

  // The two recruiting threads are still separate records.
  const threads = project.career.opportunities.filter((o) => o.id.startsWith('opp.cherie'));
  assert.equal(threads.length, 2);
});

// 3. The existing evidence vocabulary still drives freshness behavior.
test('freshness still keys off the evidence vocabulary after the rename', () => {
  const graded = checkFreshness(project, { asOf: '2026-10-20' });
  assert.ok(graded.stale.some((r) => r.id === 'roadtrip.gas_price'), 'a 40-day-old planning assumption is stale');
  assert.ok(!graded.stale.some((r) => r.id === 'orlando.mortgage_payment'), 'a 40-day-old verified statement is not');
  assert.ok(graded.all.every((r) => r.evidence_type));
  assert.equal(checkFreshness(project, { asOf: '2026-09-10' }).stale.length, 0);

  // `status` is still accepted as an input alias.
  const legacy = normalizeAssumption({ id: 'legacy', value: 1, status: 'verified', last_verified: '2026-09-10' });
  assert.equal(legacy.evidence_type, 'verified');
  assert.equal(legacy.status, undefined);
  assert.equal(legacy.canonical_state, 'confirmed');
});

// 4. canonical_state coexists with planning_assumption evidence.
test('a planning assumption can be the accepted canonical value', () => {
  const gas = project.assumptions.get('roadtrip.gas_price');
  assert.equal(gas.evidence_type, 'planning_assumption');
  assert.equal(gas.canonical_state, 'confirmed');
  assert.equal(gas.verification_state, 'not_externally_verified');

  // And a verified fact can carry a different verification state again.
  const mortgage = project.assumptions.get('orlando.mortgage_payment');
  assert.equal(mortgage.evidence_type, 'verified');
  assert.equal(mortgage.verification_state, 'externally_verified');

  // The three fields are independent: no single enum could carry this.
  const combinations = new Set(
    [...project.assumptions.values()].map((a) => `${a.evidence_type}|${a.canonical_state}|${a.verification_state}`),
  );
  assert.ok(combinations.size >= 3);
});

// 18. Overriding an assumption keeps the prior provenance rather than erasing it.
test('a session override records what it replaced', () => {
  const overridden = loadProject({ overrides: { 'roadtrip.gas_price': 5.0 } });
  const gas = overridden.assumptions.get('roadtrip.gas_price');
  assert.equal(gas.value, 5.0);
  assert.equal(gas.evidence_type, 'session_override');
  assert.equal(gas.overridden_from, 4.25);
  assert.match(gas.source, /was 4\.25 from planning_assumption/);
  assert.deepEqual(overridden.overrides, [{ id: 'roadtrip.gas_price', from: 4.25, to: 5.0 }]);
});

test('the validator enforces the rules recorded in canonical-state.json', () => {
  assert.deepEqual(validateCanonical(project), [], 'shipped data is clean');

  const confirmedWithoutValue = loadProject();
  const title = confirmedWithoutValue.canonical.records.find((r) => r.id === 'career.cherie_role.title');
  title.canonical_state = 'confirmed';
  assert.ok(
    validateCanonical(confirmedWithoutValue).some((v) => v.rule === 'rule.confirmed_has_value'),
    'a conflict cannot be quietly promoted to confirmed without a value',
  );

  const conflictWithValue = loadProject();
  const contested = conflictWithValue.canonical.records.find((r) => r.id === 'career.cherie_role.title');
  contested.canonical_value = 'Sr Principal Product Manager, Content & Media Platform';
  assert.ok(validateCanonical(conflictWithValue).some((v) => v.rule === 'rule.conflict_has_no_value'));

  const danglingSupersede = loadProject();
  const truck = danglingSupersede.canonical.records.find((r) => r.id === 'vehicle.tundra.disposition');
  delete truck.conflicts[0].superseded_by;
  assert.ok(validateCanonical(danglingSupersede).some((v) => v.rule === 'rule.superseded_points_forward'));

  const unknownState = loadProject();
  unknownState.canonical.records[0].canonical_state = 'probably_fine';
  assert.ok(validateCanonical(unknownState).some((v) => v.rule === 'rule.known_state'));
});

// 2D. The decision log answers "why does the model believe this?"
test('every contested or decided record has a decision behind it', () => {
  const subjects = new Set(project.decisions.decisions.map((d) => d.subject));
  for (const record of project.canonical.records) {
    assert.ok(subjects.has(record.id), `${record.id} has no decision explaining its state`);
  }
  assert.ok(
    project.decisions.decisions.every(
      (d) => d.decision_id && d.effective_date && d.subject && d.reason && d.source && typeof d.reversible === 'boolean',
    ),
  );

  const tundra = decisionsFor(project, 'vehicle.tundra.disposition');
  assert.equal(tundra.length, 1);
  assert.equal(tundra[0].previous_value, 'evaluate_sale');
  assert.equal(tundra[0].new_value, 'drive_to_california');
  assert.equal(tundra[0].reversible, true);
  assert.match(tundra[0].review_after, /3-6 months/);
});

test('explain() reconstructs belief, evidence, conflict and history', () => {
  const truck = explain(project, 'vehicle.tundra.disposition');
  assert.equal(truck.belief, 'drive_to_california');
  assert.equal(truck.commitment_safe, true);
  assert.equal(truck.conflicts.length, 1);
  assert.equal(truck.decisions.length, 1);

  const title = explain(project, 'career.cherie_role.title');
  assert.match(title.belief, /deliberately believes nothing/);
  assert.equal(title.commitment_safe, false);
  assert.equal(title.sources.length, 2);
  assert.deepEqual(title.blocks_gates, ['gate_1']);
  assert.ok(title.notes.some((note) => note.includes('10158541')), 'the unverified requisition id is flagged, not adopted');

  // Assumptions are explainable through the same entry point.
  const gas = explain(project, 'roadtrip.gas_price');
  assert.equal(gas.kind, 'assumption');
  assert.match(gas.refresh_rule, /Refresh 1-2 weeks before departure/);

  assert.throws(() => explain(project, 'no.such.record'), /No record with id/);
});

test('readiness reports unsettled state without re-litigating settled history', () => {
  const readiness = buildReadiness(project);
  const ids = readiness.pending_resolution.map((item) => item.id);
  assert.ok(ids.includes('career.cherie_role.title'));
  assert.ok(ids.includes('house.orlando.disposition'));
  assert.ok(!ids.includes('c.truck_disposition'));
  // The contradiction row that delegates to a canonical record is not listed twice.
  assert.ok(!ids.includes('c.cherie_title'));
  assert.ok(readiness.pending_resolution.every((item) => item.resolution_required));
});

test('the house branch stays unresolved rather than following the lean', () => {
  const house = project.canonical.records.find((r) => r.id === 'house.orlando.disposition');
  assert.equal(house.canonical_value, null);
  assert.equal(house.canonical_state, 'unresolved');
  assert.equal(house.resolution_required, 'evidence_collection');
  assert.equal(house.lean, 'selling');
  assert.ok(house.evidence_outstanding.length >= 4);
});

test('diff reports a canonical state change and a settled conflict', () => {
  const previous = buildSnapshot(project);
  const resolved = loadProject();
  const title = resolved.canonical.records.find((r) => r.id === 'career.cherie_role.title');
  title.canonical_state = 'confirmed';
  title.canonical_value = 'Senior Product Manager II';

  const diff = diffSnapshot(resolved, previous);
  assert.ok(diff.changes.some((c) => c.kind === 'canonical_state_changed' && c.id === 'career.cherie_role.title'));
  assert.ok(diff.changes.some((c) => c.kind === 'resolution_settled' && c.id === 'career.cherie_role.title'));
  assert.deepEqual(diffSnapshot(project, previous).changes, []);
});
