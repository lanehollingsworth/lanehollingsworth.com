import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/lib/data.js';
import { evaluate, identifiers } from '../src/lib/expr.js';
import { computeBudget, computeCommonMove } from '../src/calculators/move-budget.js';
import { computeRoadTrip } from '../src/calculators/road-trip.js';
import { computeHouse } from '../src/calculators/house-rent-vs-sell.js';
import { buildTimeline } from '../src/planners/timeline.js';

const project = loadProject();

test('formula evaluator refuses unknown identifiers instead of returning zero', () => {
  assert.equal(evaluate('2 * (3 + 4)', {}), 14);
  assert.equal(evaluate('a.b / 2', { 'a.b': 9 }), 4.5);
  assert.throws(() => evaluate('roadtrip.gas_prices * 2', project.scope), /Unknown identifier/);
  assert.throws(() => evaluate('1 + ', {}), /Unexpected end/);
  assert.deepEqual(identifiers('a.b * (c + a.b)'), ['a.b', 'c']);
});

test('road trip reproduces the command center figures', () => {
  const trip = computeRoadTrip(project);
  assert.equal(trip.effective_miles, 2750);
  assert.equal(trip.gallons, 183.33);
  assert.equal(trip.total, 2569.17);
  const fuel = trip.items.find((i) => i.id === 'roadtrip.fuel');
  assert.equal(fuel.amount, 779.17);
});

test('common physical move and base transition match the sheet', () => {
  const common = computeCommonMove(project);
  assert.equal(common.totals.liquidity_required, 14019.17);
  assert.equal(common.totals.by_workstream.ca_housing, 7050);
  assert.equal(common.totals.by_workstream.household_move, 2200);
  assert.equal(common.totals.by_workstream.ca_setup, 700);

  const sell = computeBudget(project, { branch: 'house_sell' });
  assert.equal(sell.totals.liquidity_required, 19153.71);
});

test('categories are never collapsed into a single cost', () => {
  const rent = computeBudget(project, { branch: 'house_rent' });
  assert.equal(rent.totals.by_type.reserve, 12000, 'landlord reserve is reserve capital');
  assert.equal(rent.totals.by_type.refundable, 3200, 'security deposit is refundable');
  assert.equal(rent.totals.by_type.contingency, 1500);
  // Reserve, deposit and contingency are liquidity but not cost.
  assert.equal(rent.totals.liquidity_required, 31153.71);
  assert.equal(rent.totals.lane_net_cost, 14453.71);
  assert.equal(rent.totals.lane_net_cost_if_contingency_spent, 15953.71);
});

test('an unpriced item is listed but never silently summed', () => {
  const sell = computeBudget(project, { branch: 'house_sell' });
  assert.ok(sell.unpriced.length >= 5);
  assert.ok(sell.unpriced.every((item) => !('formula' in item)));
  assert.ok(sell.caveats.some((c) => c.includes('unpriced')));
});

test('house economics reproduce the verified mortgage model', () => {
  const house = computeHouse(project);
  assert.equal(house.break_even_rent, 3698.13);
  assert.equal(house.guardrail_rent, 3249.41);
  const at2250 = house.rent_scenarios.find((r) => r.rent === 2250);
  assert.equal(at2250.monthly_subsidy, 1129.54);
  const at2400 = house.rent_scenarios.find((r) => r.rent === 2400);
  assert.equal(at2400.monthly_subsidy, 1012.54);
  assert.equal(house.modeled_clears_guardrail, false);
  assert.match(house.verdict, /has not yet earned the right/);
});

test('recurring monthly deltas separate the three house branches', () => {
  const house = computeHouse(project);
  assert.equal(house.recurring_monthly_delta.house_sell.delta, 315.46);
  assert.equal(house.recurring_monthly_delta.house_rent.delta, 1328);
  assert.equal(house.recurring_monthly_delta.house_defer.delta, 3200);
});

test('timeline graph is acyclic, ordered, and dates its steps', () => {
  const timeline = buildTimeline(project, { triggerDate: '2026-11-18' });
  assert.equal(timeline.schedule.length, project.moveSequence.steps.length);
  const lease = timeline.schedule.find((s) => s.id === 'lease_signed');
  const pickup = timeline.schedule.find((s) => s.id === 'movers_pickup');
  assert.ok(lease.offsets.ef <= pickup.offsets.es, 'the lease is signed before goods are collected');
  assert.equal(timeline.earliest_possible_report_date, '2027-01-05');
  assert.ok(timeline.critical_path.includes('road_trip'));
});

test('the road trip duration comes from the assumption, not a hard-coded 6', () => {
  const slower = loadProject({ overrides: { 'roadtrip.travel_days': 8 } });
  const base = buildTimeline(project, { triggerDate: '2026-11-18' });
  const stretched = buildTimeline(slower, { triggerDate: '2026-11-18' });
  assert.equal(stretched.total_days_from_trigger - base.total_days_from_trigger, 2);
});
