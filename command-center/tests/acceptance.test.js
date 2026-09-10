/**
 * Phase 1 acceptance tests, taken verbatim from the handoff document.
 * Each test is one question the system is required to answer correctly.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/lib/data.js';
import { computeBudget } from '../src/calculators/move-budget.js';
import { computeRoadTrip } from '../src/calculators/road-trip.js';
import { computeHouse } from '../src/calculators/house-rent-vs-sell.js';
import { buildTimeline } from '../src/planners/timeline.js';
import { checkFreshness } from '../src/research/freshness.js';
import { topQuestions } from '../src/research/questions.js';
import { buildSnapshot, diffSnapshot } from '../src/reports/snapshot.js';

const base = loadProject();

test('"If gas becomes $5.00/gallon, what changes?"', () => {
  const before = computeRoadTrip(base);
  const after = computeRoadTrip(loadProject({ overrides: { 'roadtrip.gas_price': 5.0 } }));
  assert.equal(before.items.find((i) => i.id === 'roadtrip.fuel').amount, 779.17);
  assert.equal(after.items.find((i) => i.id === 'roadtrip.fuel').amount, 916.67);
  assert.equal(Math.round((after.total - before.total) * 100) / 100, 137.5);
  // Nothing else in the trip moves, and the change propagates to the totals.
  assert.equal(after.hotel_nights, before.hotel_nights);
  const budgetAfter = computeBudget(loadProject({ overrides: { 'roadtrip.gas_price': 5.0 } }), { branch: 'house_sell' });
  assert.equal(budgetAfter.totals.liquidity_required, 19291.21);
});

test('"If my actual Tundra MPG is 17, what changes?"', () => {
  const after = computeRoadTrip(loadProject({ overrides: { 'roadtrip.tundra_mpg': 17 } }));
  assert.equal(after.gallons, 161.76);
  assert.equal(after.items.find((i) => i.id === 'roadtrip.fuel').amount, 687.5);
  assert.equal(Math.round((computeRoadTrip(base).total - after.total) * 100) / 100, 91.67);
});

test('"If Disney covers movers and hotels but not deposits, what is my net cash requirement?"', () => {
  const none = computeBudget(base, { branch: 'house_sell', support: 'unknown' });
  const reimbursed = computeBudget(base, { branch: 'house_sell', support: 'movers_hotels_reimbursed' });
  const direct = computeBudget(base, { branch: 'house_sell', support: 'movers_hotels_direct' });

  // Reimbursement lowers the cost but not the liquidity: Lane still fronts it.
  assert.equal(reimbursed.totals.liquidity_required, none.totals.liquidity_required);
  assert.equal(reimbursed.totals.lane_net_cost, 11378.71);
  assert.equal(reimbursed.totals.employer_reimbursed_fronted, 3075);
  assert.ok(reimbursed.caveats.some((c) => c.includes('front the cash')));

  // Direct billing removes the cash-front requirement for those items.
  assert.equal(direct.totals.liquidity_required, 17203.71);
  assert.equal(direct.totals.employer_direct_billed, 1950);

  // Deposits are excluded from coverage in both cases.
  const deposit = reimbursed.items.find((i) => i.id === 'ca_housing.security_deposit');
  assert.equal(deposit.coverage_mode, 'none');
  assert.equal(deposit.lane_fronts, 3200);
});

test('"If I rent the Orlando house, how much liquidity do I need vs selling?"', () => {
  const house = computeHouse(base);
  assert.equal(house.liquidity.house_sell, 19153.71);
  assert.equal(house.liquidity.house_rent, 31153.71);
  assert.equal(house.rent_branch_liquidity_premium, 12000);
  // And the premium is capital, not spend.
  const rent = computeBudget(base, { branch: 'house_rent' });
  assert.equal(rent.totals.by_type.reserve, 12000);
  assert.equal(rent.totals.lane_net_cost, computeBudget(base, { branch: 'house_sell' }).totals.lane_net_cost);
});

test('"If I get an offer on November 18 and need to report in Glendale February 2, what are the dated tasks?"', () => {
  const timeline = buildTimeline(base, { triggerDate: '2026-11-18', reportDate: '2027-02-02' });
  assert.equal(timeline.feasible, true);
  assert.equal(timeline.slack_days, 28);
  assert.equal(timeline.earliest_possible_report_date, '2027-01-05');

  const byId = Object.fromEntries(timeline.schedule.map((s) => [s.id, s]));
  assert.equal(byId.capture_offer.earliest_start, '2026-11-18');
  assert.equal(byId.lease_signed.earliest_start, '2026-12-03');
  assert.equal(byId.lease_signed.latest_start, '2026-12-31');
  assert.equal(byId.depart_orlando.earliest_start, '2026-12-24');
  assert.equal(byId.first_office_day.latest_start, '2027-02-02');
  assert.equal(timeline.irreversible_steps.length, 3);

  // A shorter runway is reported as infeasible with remedies, not quietly compressed.
  const tight = buildTimeline(base, { triggerDate: '2027-01-15', reportDate: '2027-02-15' });
  assert.equal(tight.feasible, false);
  assert.equal(tight.shortfall_days, 17);
  assert.ok(tight.remedies.some((r) => r.includes('remote transition')));
  assert.ok(tight.remedies.some((r) => r.includes('driving longer days')));
});

test('"Which assumptions are older than 30 days or need refreshing before commitment?"', () => {
  const uniform = checkFreshness(base, { asOf: '2026-10-20', maxAgeDays: 30 });
  assert.ok(uniform.stale.some((r) => r.id === 'roadtrip.gas_price'));
  assert.ok(uniform.stale.every((r) => r.age_days > 30));
  assert.ok(uniform.stale.every((r) => r.refresh_rule));

  // Per-status thresholds: a verified mortgage statement does not rot as fast as a gas price.
  const graded = checkFreshness(base, { asOf: '2026-10-20' });
  assert.ok(graded.stale.some((r) => r.id === 'roadtrip.gas_price'));
  assert.ok(!graded.stale.some((r) => r.id === 'orlando.mortgage_payment'));
  assert.equal(checkFreshness(base, { asOf: '2026-09-10' }).stale.length, 0);
});

test('"What are the three highest-value unresolved inputs right now?"', () => {
  const top = topQuestions(base, 3);
  assert.deepEqual(top.map((q) => q.id), ['q.compensation_ca', 'q.realtor_cma_net_sheet', 'q.pm_market_rent']);
  assert.ok(top.every((q) => q.priority > 0 && q.swing_basis));
});

test('"What actions are intentionally blocked until an offer/approval exists?"', () => {
  const blocked = base.project.blocked_until_trigger;
  const lease = blocked.find((b) => b.action.includes('lease'));
  assert.equal(lease.unblocked_by, 'gate_3');
  assert.ok(blocked.some((b) => b.action.includes('List the Orlando house') && b.unblocked_by === 'gate_1'));
  assert.ok(blocked.some((b) => b.action.includes('waive relocation support') && b.unblocked_by === 'never'));
  assert.ok(blocked.some((b) => b.action.includes('Sell the Tundra')));
});

test('"What changed from the previous plan?"', () => {
  const previous = buildSnapshot(base);
  const changed = loadProject({ overrides: { 'roadtrip.gas_price': 5.0, 'house.expected_market_rent': 3300 } });
  const diff = diffSnapshot(changed, previous);

  assert.equal(diff.has_baseline, true);
  const gas = diff.changes.find((c) => c.id === 'roadtrip.gas_price');
  assert.deepEqual({ from: gas.from, to: gas.to }, { from: 4.25, to: 5 });
  assert.ok(diff.changes.some((c) => c.kind === 'liquidity_changed' && c.id === 'house_sell'));
  assert.ok(diff.changes.some((c) => c.kind === 'house_changed' && c.id === 'modeled_subsidy'));

  assert.deepEqual(diffSnapshot(base, previous).changes, [], 'an unchanged model reports no changes');
});

test('"Which spreadsheet records conflict with the latest decisions?"', () => {
  const ids = base.contradictions.items.map((c) => c.id);
  assert.ok(ids.includes('c.truck_disposition'));
  assert.ok(ids.includes('c.cherie_title'));
  assert.ok(base.contradictions.items.every((c) => c.sheet_says && c.latest_decision && c.proposed_resolution));
  // Recruiting threads stay separate until a requisition proves otherwise.
  const cherieThreads = base.career.opportunities.filter((o) => o.id.startsWith('opp.cherie'));
  assert.equal(cherieThreads.length, 2);
  assert.notEqual(cherieThreads[0].path, cherieThreads[1].path);
});

test('windfalls stay out of the base case until they are real', () => {
  assert.ok(base.finance.future_inflows.every((inflow) => inflow.include_in_base_case === false));
  const rsu = base.finance.future_inflows.find((i) => i.id === 'inflow.rsu_dec_2026');
  assert.equal(rsu.net_estimate, null);
  const emergency = base.finance.accounts.find((a) => a.id === 'acct.emergency_fund');
  assert.equal(emergency.status, 'excluded_by_guardrail');
});
