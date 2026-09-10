#!/usr/bin/env node
import { loadProject, parseOverrides } from './lib/data.js';
import { heading, subheading, table, usd, round2 } from './lib/format.js';
import { computeBudget, computeCommonMove } from './calculators/move-budget.js';
import { computeRoadTrip } from './calculators/road-trip.js';
import { computeHouse } from './calculators/house-rent-vs-sell.js';
import { computeLaunchFund } from './calculators/launch-fund.js';
import { computeScenarioMatrix } from './calculators/scenario-matrix.js';
import { buildTimeline } from './planners/timeline.js';
import { checkFreshness } from './research/freshness.js';
import { rankQuestions } from './research/questions.js';
import { buildReadiness } from './reports/readiness.js';
import { buildPulse } from './reports/weekly-pulse.js';
import { saveSnapshot, diffSnapshot } from './reports/snapshot.js';
import { validateCanonical, pendingResolution, supersededHistory, explain, stateNodes } from './lib/canonical.js';
import { activeRules, retiredRules, simulateProgramCompletion, ruleStatus } from './lib/rules.js';
import { attentionReport } from './lib/attention.js';

function parseArgs(argv) {
  const args = { _: [], set: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    if (key === 'json') { args.json = true; continue; }
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) { args[key] = true; continue; }
    if (key === 'set') args.set.push(value);
    else args[key] = value;
    i += 1;
  }
  return args;
}

process.stdout.on('error', (error) => {
  if (error.code === 'EPIPE') process.exit(0);
  throw error;
});

const out = (text) => process.stdout.write(`${text}\n`);

function renderOverrides(project) {
  if (project.overrides.length === 0) return;
  out(subheading('Session overrides in effect (not saved to data)'));
  for (const o of project.overrides) out(`  ${o.id}: ${o.from} -> ${o.to}`);
}

function renderBudget(project, args) {
  const branch = args.branch ?? 'house_sell';
  const support = args.support ?? 'unknown';
  const budget = computeBudget(project, { branch, support });
  const common = computeCommonMove(project, { support });

  out(heading(`Move budget - ${branch} branch, employer support: ${budget.support.label}`));
  renderOverrides(project);
  out(subheading('Line items'));
  out(table(budget.items, [
    { header: 'Item', value: (r) => r.label },
    { header: 'Type', value: (r) => r.type },
    { header: 'When', value: (r) => r.timing },
    { header: 'Amount', value: (r) => usd(r.amount), align: 'right' },
    { header: 'Lane fronts', value: (r) => usd(r.lane_fronts), align: 'right' },
    { header: 'Lane net', value: (r) => usd(r.lane_net_cost), align: 'right' },
  ]));

  out(subheading('Categories (never collapsed)'));
  for (const [type, amount] of Object.entries(budget.totals.by_type)) {
    if (amount === 0) continue;
    out(`  ${type.padEnd(12)} ${usd(amount)}`);
  }

  out(subheading('Headline numbers'));
  out(`  Common physical move (no Orlando overlap, no branch): ${usd(common.totals.liquidity_required)}`);
  out(`  Liquidity required (${branch}):                        ${usd(budget.totals.liquidity_required)}`);
  out(`  Lane net cost (money that does not come back):        ${usd(budget.totals.lane_net_cost)}`);
  out(`  Lane net cost if the contingency is fully spent:      ${usd(budget.totals.lane_net_cost_if_contingency_spent)}`);
  if (budget.totals.employer_covered > 0) {
    out(`  Employer covered:                                     ${usd(budget.totals.employer_covered)}`);
    out(`    of which Lane must front and reclaim:               ${usd(budget.totals.employer_reimbursed_fronted)}`);
    out(`    of which is direct-billed (never Lane's cash):      ${usd(budget.totals.employer_direct_billed)}`);
  }
  if (budget.support.lump_sum > 0) out(`  Lump sum offered:                                     ${usd(budget.support.lump_sum)} (timing matters)`);

  out(subheading('Cash timing (what Lane must front, by bucket)'));
  for (const [timing, amount] of Object.entries(budget.totals.by_timing)) {
    out(`  ${timing.padEnd(20)} ${usd(amount)}   ${project.budget.timing_legend[timing]}`);
  }

  out(subheading(`Known but unpriced in this scenario (${budget.unpriced.length}) - excluded from every total above`));
  for (const item of budget.unpriced) out(`  - ${item.label}  [${item.question_id}]`);

  out(subheading('Caveats'));
  for (const caveat of budget.caveats) out(`  - ${caveat}`);
}

function renderRoadTrip(project) {
  const trip = computeRoadTrip(project);
  out(heading('Road trip - Lane, Klein, Tilly, one Tundra'));
  renderOverrides(project);
  out(`  ${trip.base_miles} base miles + ${round2(trip.detour_buffer * 100)}% buffer = ${trip.effective_miles} effective miles`);
  out(`  ${trip.effective_miles} / ${trip.mpg} mpg = ${trip.gallons} gallons at ${usd(trip.gas_price)}/gal`);
  out(`  ${trip.travel_days} travel days, ${trip.hotel_nights} hotel nights, ${trip.driving_load.miles_per_travel_day} miles per travel day`);
  out(subheading('Line items'));
  out(table(trip.items, [
    { header: 'Item', value: (r) => r.label },
    { header: 'Amount', value: (r) => usd(r.amount), align: 'right' },
  ]));
  out(`\n  Total: ${usd(trip.total)}`);
  out(`\n  ${trip.driving_load.note}`);
  out(subheading(`Route skeleton (${trip.route_status})`));
  for (const leg of trip.route_skeleton) out(`  ${leg.leg}. ${leg.from} -> ${leg.to}  (${leg.miles ?? 'unrouted'})`);
  out(`\n  ${project.roadtrip.route_note}`);
}

function renderHouse(project) {
  const house = computeHouse(project);
  out(heading('Orlando house - renting must earn the right to beat selling'));
  renderOverrides(project);
  out(`  Scheduled payment: ${usd(house.payment)}   Leakage (PM+vacancy+maintenance): ${round2(house.leakage_rates.total * 100)}%`);
  out(`  Break-even rent: ${usd(house.break_even_rent)}`);
  out(`  Rent needed to stay inside the ${usd(house.guardrail)}/mo guardrail: ${usd(house.guardrail_rent)}`);
  out(subheading('Rent scenarios'));
  out(table(house.rent_scenarios, [
    { header: 'Rent', value: (r) => usd(r.rent), align: 'right' },
    { header: 'Owner net', value: (r) => usd(r.owner_net), align: 'right' },
    { header: 'Monthly subsidy', value: (r) => usd(r.monthly_subsidy), align: 'right' },
    { header: 'Clears guardrail', value: (r) => (r.clears_guardrail ? 'yes' : 'NO'), align: 'right' },
  ]));
  out(subheading('Liquidity required by branch'));
  for (const [branch, amount] of Object.entries(house.liquidity)) out(`  ${branch.padEnd(12)} ${usd(amount)}`);
  out(`  Rent branch premium over sell: ${usd(house.rent_branch_liquidity_premium)} (mostly the landlord reserve, which stays Lane's capital)`);
  out(subheading('Recurring monthly housing delta vs today'));
  for (const [branch, row] of Object.entries(house.recurring_monthly_delta)) {
    out(`  ${branch.padEnd(12)} ${usd(row.delta, { sign: row.delta > 0 })}/mo   ${row.note}`);
  }
  out(subheading('Verdict'));
  out(`  ${house.verdict}`);
  out(`  Decision state: ${house.decision_state} (Lane leans ${house.lean}; the model keeps both branches alive until the evidence lands)`);
  out(`  Evidence still required: ${[...new Set(house.evidence_required)].join(', ')}`);
}

function renderLaunch(project, args) {
  const launch = computeLaunchFund(project, { branch: args.branch ?? 'house_sell', support: args.support ?? 'unknown' });
  out(heading('California Launch Fund ladder'));
  out(table(launch.rungs, [
    { header: 'Rung', value: (r) => r.label },
    { header: 'Amount', value: (r) => usd(r.amount), align: 'right' },
    { header: 'Gap', value: (r) => (r.gap === null ? 'unmeasurable' : usd(r.gap)), align: 'right' },
    { header: 'Basis', value: (r) => r.basis },
  ]));
  out(`\n  Designated balance: ${launch.designated_balance === null ? `none yet (${launch.balance_status})` : usd(launch.designated_balance)}`);
  if (launch.floor_warning) out(`  ! ${launch.floor_warning}`);
  out(subheading('Excluded by guardrail'));
  for (const label of launch.excluded) out(`  - ${label}`);
  for (const inflow of launch.excluded_inflows) out(`  - ${inflow.label}: ${inflow.treatment}`);
}

function renderScenarios(project, args) {
  const matrix = computeScenarioMatrix(project, args.support ? { supports: [args.support] } : undefined);
  out(heading('Scenario matrix - career path x house branch x employer support'));
  out(table(matrix.rows, [
    { header: 'Path', value: (r) => r.path },
    { header: 'Branch', value: (r) => r.branch },
    { header: 'Support', value: (r) => r.support },
    { header: 'Liquidity', value: (r) => usd(r.liquidity_required), align: 'right' },
    { header: 'Cash at risk', value: (r) => usd(r.cash_at_risk), align: 'right' },
    { header: 'Refundable', value: (r) => usd(r.refundable), align: 'right' },
    { header: 'Reserve', value: (r) => usd(r.reserve_capital), align: 'right' },
    { header: 'Monthly delta', value: (r) => usd(r.recurring_monthly_delta, { sign: true }), align: 'right' },
    { header: 'TBD', value: (r) => r.unpriced_count, align: 'right' },
  ]));
  out(`\n  ${matrix.orthogonality_note}`);
  out(`  ${matrix.path_note}`);
  out(`  ${matrix.windfall_note}`);
}

function renderTimeline(project, args) {
  const trigger = args.offer ?? args.trigger;
  if (!trigger) throw new Error('timeline needs --offer YYYY-MM-DD (the trigger date) and optionally --report YYYY-MM-DD.');
  const timeline = buildTimeline(project, { triggerDate: trigger, reportDate: args.report ?? null });
  out(heading(`Timeline from trigger ${timeline.trigger_date}${timeline.report_date ? ` to required office day ${timeline.report_date}` : ''}`));
  out(table(timeline.schedule, [
    { header: 'T+', value: (r) => r.offsets.es, align: 'right' },
    { header: 'Step', value: (r) => r.label },
    { header: 'Days', value: (r) => r.duration_days, align: 'right' },
    { header: 'Earliest', value: (r) => r.earliest_start },
    { header: 'Latest', value: (r) => r.latest_start },
    { header: 'Slack', value: (r) => r.slack_days, align: 'right' },
    { header: 'Gate', value: (r) => r.gate },
    { header: '!', value: (r) => (r.irreversible ? 'irreversible' : '') },
  ]));
  out(`\n  Earliest possible first office day: ${timeline.earliest_possible_report_date} (${timeline.total_days_from_trigger} days from trigger)`);
  out(`  Feasible: ${timeline.feasible ? `yes, with ${timeline.slack_days ?? 'n/a'} days of slack` : `NO - short by ${timeline.shortfall_days} days`}`);
  out(`  Critical path: ${timeline.critical_path.join(' -> ')}`);
  if (timeline.remedies.length) {
    out(subheading('Remedies'));
    for (const remedy of timeline.remedies) out(`  - ${remedy}`);
  }
  out(subheading('Irreversible steps requiring explicit approval'));
  for (const step of timeline.irreversible_steps) out(`  - ${step.label} (earliest ${step.earliest}, ${step.gate})`);
  out(`\n  ${timeline.assumption_note}`);
}

function renderFreshness(project, args) {
  const report = checkFreshness(project, { asOf: args['as-of'] ?? null, maxAgeDays: args['max-age'] ? Number(args['max-age']) : null });
  out(heading(`Assumption freshness as of ${report.as_of}`));
  out(`  ${report.threshold_note}`);
  out(subheading(`Stale (${report.stale.length})`));
  if (report.stale.length === 0) out('  none');
  else out(table(report.stale, [
    { header: 'Id', value: (r) => r.id },
    { header: 'Value', value: (r) => `${r.value} ${r.unit}` },
    { header: 'Age', value: (r) => `${r.age_days}d`, align: 'right' },
    { header: 'Limit', value: (r) => `${r.threshold_days}d`, align: 'right' },
    { header: 'Refresh rule', value: (r) => r.refresh_rule ?? '' },
  ]));
  out(subheading(`Low confidence and in use (${report.low_confidence_in_use.length})`));
  for (const row of report.low_confidence_in_use) out(`  - ${row.id}: ${row.value} ${row.unit} - ${row.refresh_rule ?? ''}`);
}

function renderQuestions(project, args) {
  const ranked = rankQuestions(project);
  const rows = args.top ? ranked.rows.slice(0, Number(args.top)) : ranked.rows;
  out(heading('Unresolved-input queue'));
  out(`  ${ranked.formula}`);
  out('');
  out(table(rows, [
    { header: 'Pri', value: (r) => r.priority, align: 'right' },
    { header: 'Id', value: (r) => r.id },
    { header: 'Blocks', value: (r) => r.blocks_gate },
    { header: 'Swing', value: (r) => (r.dollar_swing_estimate === null ? 'unknown' : usd(r.dollar_swing_estimate)), align: 'right' },
    { header: 'Owner', value: (r) => r.owner },
    { header: 'Status', value: (r) => r.status },
    { header: 'Due', value: (r) => r.due ?? '' },
  ]));
  out(subheading('Why these matter'));
  for (const row of rows.slice(0, 5)) out(`  ${row.id}: ${row.question}\n    basis: ${row.swing_basis}`);
}

function renderReadiness(project, args) {
  const readiness = buildReadiness(project, { branch: args.branch ?? 'house_sell', support: args.support ?? 'unknown', asOf: args['as-of'] ?? null });
  out(heading(`Relocation readiness - ${readiness.branch} branch, ${readiness.support} employer support`));
  out(table(readiness.rows, [
    { header: 'Workstream', value: (r) => r.label },
    { header: 'Status', value: (r) => r.status },
    { header: 'Gate', value: (r) => r.gate },
    { header: 'Reason', value: (r) => r.reason },
  ]));
  out(`\n  Liquidity required: ${usd(readiness.liquidity_required)}   Lane net cost: ${usd(readiness.lane_net_cost)}   Recurring delta: ${usd(readiness.recurring_delta, { sign: true })}/mo`);
  out(`  Stale inputs: ${readiness.stale_inputs}   Known-but-unpriced items: ${readiness.unpriced_items}`);
  out(subheading('Three highest-value unresolved inputs'));
  for (const q of readiness.top_questions) out(`  ${q.priority}  ${q.id} - ${q.question}`);
  out(subheading('Intentionally blocked until a trigger exists'));
  for (const action of readiness.blocked_actions) out(`  - ${action.action} (revisit at ${action.revisit_trigger}): ${action.deferral_reason}`);
  if (readiness.pending_resolution.length) {
    out(subheading('Unsettled state - what each one needs'));
    for (const item of readiness.pending_resolution) {
      out(`  - [${item.id}] ${item.label}`);
      out(`      state: ${item.canonical_state}, needs: ${item.resolution_required}`);
      if (item.resolution_rule) out(`      ${item.resolution_rule}`);
    }
  }
}

function renderPulse(project, args) {
  const pulse = buildPulse(project, { asOf: args['as-of'] ?? null, branch: args.branch ?? 'house_sell', support: args.support ?? 'unknown' });
  out(heading(`CALIFORNIA MOVE PULSE - ${pulse.date}`));
  out(`  ${pulse.summary_line}`);
  out(subheading('1. What changed since the last snapshot'));
  if (typeof pulse.what_changed === 'string') out(`  ${pulse.what_changed}`);
  else if (pulse.what_changed.length === 0) out('  Nothing. No assumption, total or open question moved.');
  else for (const change of pulse.what_changed) out(`  - ${change.kind}: ${change.id}${change.from !== undefined ? ` ${change.from} -> ${change.to}` : ''}`);

  out(subheading('2. Career path status'));
  for (const path of pulse.career) out(`  ${path.id}: ${path.name} - ${path.status}, ${path.threads} tracked thread(s), relocation support ${path.relocation_support_status}`);

  out(subheading('3. Cash readiness and Venture progress'));
  out(`  Liquidity required: ${usd(pulse.cash.liquidity_required)}`);
  out(`  Designated Launch Fund: ${pulse.cash.designated_launch_fund === null ? 'not yet opened' : usd(pulse.cash.designated_launch_fund)}`);
  out(`  Venture X: ${usd(pulse.cash.venture.value)} at ${(pulse.cash.venture.apr * 100).toFixed(2)}% APR`);
  if (pulse.cash.floor_warning) out(`  ! ${pulse.cash.floor_warning}`);

  out(subheading('4. Orlando house evidence'));
  out(`  Property management: ${pulse.house_evidence.pm_status}`);
  out(`  Sale workstream: ${pulse.house_evidence.sale_status}`);
  out(`  Inspection: ${pulse.house_evidence.inspection}`);
  out(`  ${pulse.house_evidence.verdict}`);

  out(subheading('5. New or stale assumptions'));
  if (pulse.assumptions.stale.length === 0) out('  None past its refresh threshold.');
  else for (const row of pulse.assumptions.stale) out(`  - ${row.id} (${row.age_days}d): ${row.refresh_rule ?? ''}`);
  out(`  ${pulse.assumptions.low_confidence} low-confidence inputs are still load-bearing.`);

  out(subheading('6. Deadlines in the next 14 / 30 days'));
  for (const item of pulse.deadlines_14) out(`  [14d] ${item.date} (T+${item.in_days}) ${item.label}`);
  for (const item of pulse.deadlines_30.filter((d) => d.in_days > 14)) out(`  [30d] ${item.date} (T+${item.in_days}) ${item.label}`);

  out(subheading('7. Top 3 actions now'));
  for (const task of pulse.top_actions) out(`  - ${task.label}${task.due ? ` (due ${task.due})` : ''}`);

  out(subheading('8. Things intentionally NOT to do yet'));
  for (const item of pulse.intentionally_not_yet) out(`  - ${item.action}: ${item.deferral_reason}`);

  out(subheading('9. Live risks'));
  for (const risk of pulse.risks_live) out(`  - [${risk.id}] ${risk.risk} - ${risk.mitigation}`);

  out(subheading('10. Decisions needed from Lane'));
  if (pulse.decision_needed.length === 0) out('  None.');
  else for (const decision of pulse.decision_needed) out(`  - ${decision.topic} (${decision.state}, needs ${decision.needs}): ${decision.proposal ?? ''}`);
  out(`  ${pulse.settled_this_phase} record(s) are settled history and are intentionally not listed here.`);

  if (pulse.honesty_note) out(`\n  ${pulse.honesty_note}`);
}

function renderContradictions(project) {
  const violations = validateCanonical(project);
  const pending = pendingResolution(project);
  const settled = supersededHistory(project).filter((row) => row.kind === 'contradiction' || row.kind === 'conflict_entry');

  out(heading('Canonical state and source conflicts'));
  out(`  ${project.contradictions.rule}`);

  out(subheading(`Unsettled - needs someone (${pending.length})`));
  if (pending.length === 0) out('  none');
  for (const item of pending) {
    out(`  [${item.id}] ${item.label}`);
    out(`     state:  ${item.canonical_state}`);
    out(`     needs:  ${item.resolution_required}`);
    if (item.resolution_rule) out(`     rule:   ${item.resolution_rule}`);
    if (item.sources.length) {
      for (const source of item.sources) {
        out(`     source: "${source.value}" - ${source.source} (${source.evidence_type}, ${source.verification_state})`);
      }
    }
    out('');
  }

  out(subheading(`Settled history - superseded, not open (${settled.length})`));
  for (const row of settled) {
    out(`  [${row.id}] ${row.label}`);
    out(`     retired value: ${row.value ?? 'n/a'}`);
    out(`     superseded by: ${row.superseded_by}`);
    out(`     because:       ${row.reason}`);
  }

  const sheetActions = project.contradictions.items.filter((item) => item.sheet_action);
  out(subheading('Sheet actions still worth taking'));
  for (const item of sheetActions) out(`  - [${item.id}] ${item.sheet_action}`);

  if (violations.length) {
    out(subheading(`Rule violations (${violations.length})`));
    for (const violation of violations) out(`  ! ${violation.id}: ${violation.rule} - ${violation.detail}`);
  }
}

function renderCanonical(project) {
  out(heading('Canonical records - what the model currently believes'));
  out(table(project.canonical.records, [
    { header: 'Id', value: (r) => r.id },
    { header: 'Believes', value: (r) => (r.canonical_value === null ? '(nothing - deliberately)' : r.canonical_value) },
    { header: 'State', value: (r) => r.canonical_state },
    { header: 'Evidence', value: (r) => r.evidence_type ?? '-' },
    { header: 'Verified', value: (r) => r.verification_state ?? '-' },
    { header: 'Needs', value: (r) => r.resolution_required ?? '' },
  ]));
  out(subheading('Why three fields and not one enum'));
  for (const line of project.canonicalState.why_three_dimensions) out(`  - ${line}`);
  out(`\n  Commitment-safe states: ${project.canonicalState.commitment_safe_states.join(', ')}`);
  out(`  ${project.canonicalState.planning_note}`);
}

function renderWhy(project, args) {
  const id = args._[1] ?? args.id;
  if (!id) throw new Error('why needs a record id, e.g. `why vehicle.tundra.disposition`.');
  const explanation = explain(project, id);

  out(heading(`Why the model believes this - ${explanation.id}`));
  out(`  ${explanation.label}`);
  out(subheading('Current belief'));
  out(`  ${explanation.belief}`);
  out(`  canonical_state: ${explanation.canonical_state}   evidence_type: ${explanation.evidence_type ?? '-'}   verification: ${explanation.verification_state ?? '-'}`);
  out(`  Safe to act on irreversibly: ${explanation.commitment_safe ? 'yes' : 'NO'}`);
  if (explanation.detail) { out(subheading('Detail')); for (const line of explanation.detail) out(`  - ${line}`); }
  if (explanation.sources.length) {
    out(subheading('Sources that disagree'));
    for (const source of explanation.sources) {
      out(`  - "${source.value}"`);
      out(`      from ${source.source} (${source.evidence_type}, ${source.verification_state})`);
      if (source.note) out(`      ${source.note}`);
    }
  }
  if (explanation.conflicts.length) {
    out(subheading('Superseded values retained as evidence'));
    for (const conflict of explanation.conflicts) {
      out(`  - "${conflict.value}" from ${conflict.source} (${conflict.canonical_state})`);
      out(`      ${conflict.resolution_reason}`);
    }
  }
  if (explanation.decisions.length) {
    out(subheading('Decision history'));
    for (const decision of explanation.decisions) {
      out(`  ${decision.effective_date}  ${decision.previous_value ?? '(none)'} -> ${decision.new_value ?? '(none)'}`);
      out(`      ${decision.reason}`);
      out(`      source: ${decision.source}   reversible: ${decision.reversible}${decision.review_after ? `   review: ${decision.review_after}` : ''}`);
    }
  }
  if (explanation.resolution_required) {
    out(subheading('What would settle it'));
    out(`  needs: ${explanation.resolution_required}`);
    if (explanation.resolution_rule) out(`  rule:  ${explanation.resolution_rule}`);
  }
  if (explanation.blocks_gates.length) out(`\n  Blocks: ${explanation.blocks_gates.join(', ')}`);
  if (explanation.refresh_rule) out(`  Refresh rule: ${explanation.refresh_rule}`);
  if (explanation.last_verified) out(`  Last verified: ${explanation.last_verified}`);
  if (explanation.review_after) out(`  Review after: ${explanation.review_after}`);
  if (explanation.sheet_action) out(`  Sheet action: ${explanation.sheet_action}`);
  for (const note of explanation.notes) out(`\n  Note: ${note}`);
}

function renderDecisions(project) {
  out(heading('Decision log'));
  out(`  ${project.decisions.note}`);
  out('');
  for (const decision of project.decisions.decisions) {
    out(`  ${decision.effective_date}  [${decision.decision_id}]`);
    out(`     subject:  ${decision.subject}`);
    out(`     change:   ${decision.previous_value ?? '(none)'} -> ${decision.new_value ?? '(none)'}`);
    out(`     reason:   ${decision.reason}`);
    out(`     source:   ${decision.source}   reversible: ${decision.reversible}${decision.review_after ? `   review after: ${decision.review_after}` : ''}`);
    out('');
  }
}

function renderValidate(project) {
  const violations = validateCanonical(project);
  out(heading('Canonical-state validation'));
  if (violations.length === 0) {
    const nodes = stateNodes(project);
    out(`  ${nodes.length} state-bearing records checked against ${project.canonicalState.validation_rules.length} rules. No violations.`);
    return;
  }
  process.exitCode = 1;
  for (const violation of violations) out(`  ! [${violation.kind}] ${violation.id}: ${violation.rule} - ${violation.detail}`);
}

function renderBlocked(project) {
  out(heading('Actions intentionally blocked until a trigger exists'));
  for (const item of project.program.deferred_actions) {
    out(`  - ${item.action}\n      revisit when: ${item.revisit_trigger}\n      why: ${item.deferral_reason}`);
  }
  out(subheading('Gate states'));
  for (const gate of project.program.gates) out(`  ${gate.id.padEnd(7)} ${gate.name.padEnd(32)} ${gate.state}`);
}

function renderOfferDay(project, args) {
  const trigger = args.date ?? args.offer;
  if (!trigger) throw new Error('offer-day needs --date YYYY-MM-DD, and optionally --report YYYY-MM-DD.');
  const branch = args.branch ?? 'house_sell';
  out(heading(`OFFER-DAY EXECUTION MODE - trigger ${trigger}`));
  out('  Readiness mode is off. This is the execution sequence, not a checklist.');

  out(subheading('1. Terms to capture in writing before anything else'));
  for (const term of ['role', 'title and level', 'location / worksite', 'base compensation', 'bonus and LTI if applicable', 'start date', 'in-office cadence', 'relocation support and cap', 'acceptance deadline', 'contingencies']) {
    out(`  [ ] ${term}`);
  }

  out(subheading('2. Missing terms that materially change the move'));
  for (const q of rankQuestions(project).rows.filter((q) => ['gate_1', 'gate_2', 'gate_3'].includes(q.blocks_gate)).slice(0, 6)) {
    out(`  - ${q.question}`);
  }

  out(subheading('3. Net cash requirement under each support outcome'));
  const supports = project.budget.relocation_support_profiles.map((p) => p.id);
  const rows = supports.map((support) => {
    const budget = computeBudget(project, { branch, support });
    return {
      support,
      liquidity: budget.totals.liquidity_required,
      net: budget.totals.lane_net_cost,
      fronted: budget.totals.employer_reimbursed_fronted,
      lump: budget.support.lump_sum,
    };
  });
  out(table(rows, [
    { header: 'Support outcome', value: (r) => r.support },
    { header: 'Liquidity needed', value: (r) => usd(r.liquidity), align: 'right' },
    { header: 'Lane net cost', value: (r) => usd(r.net), align: 'right' },
    { header: 'Fronted then reclaimed', value: (r) => usd(r.fronted), align: 'right' },
    { header: 'Lump sum offered', value: (r) => (r.lump > 0 ? usd(r.lump) : ''), align: 'right' },
  ]));
  out('  A lump sum is not netted off above on purpose: it is usually taxable, and it only helps if it lands');
  out('  before the deposit is due. Ask for the gross-up treatment and the payment date, then net it manually.');

  out(subheading('4. Dated execution plan'));
  const timeline = buildTimeline(project, { triggerDate: trigger, reportDate: args.report ?? null });
  for (const step of timeline.schedule) {
    out(`  T+${String(step.offsets.es).padStart(3)}  ${step.earliest_start}  ${step.label}${step.irreversible ? '   [IRREVERSIBLE - needs Lane approval]' : ''}`);
  }
  out(`\n  Earliest first office day: ${timeline.earliest_possible_report_date}`);
  if (!timeline.feasible) {
    out(`  ! Required report date is ${timeline.shortfall_days} days too early for this sequence.`);
    for (const remedy of timeline.remedies) out(`    - ${remedy}`);
  }

  out(subheading('5. Decisions that still belong to Lane, not to the system'));
  out('  - Whether the Orlando house branch must be chosen now or can stay deferred.');
  out('  - Whether to buy a month of Orlando overlap to list the house vacant.');
  out('  - Every irreversible step listed above.');
}

function renderAttention(project, args) {
  const report = attentionReport(project, { asOf: args['as-of'] ?? null });
  out(heading(`What deserves attention - ${report.date}`));
  out(`  ${report.summary}`);

  out(subheading(`Needs attention now (${report.needs_attention.length})`));
  for (const item of report.needs_attention) {
    out(`  [${item.action_state}] ${item.label}`);
    out(`      ${item.domain}${item.due ? ` - due ${item.due} (T+${item.in_days})` : ''}${item.routine_candidate ? ' - recurring' : ''}`);
  }

  out(subheading(`Waiting on someone else (${report.waiting_on.length})`));
  for (const item of report.waiting_on) out(`  - ${item.label} - ${item.external_party}`);

  out(subheading(`Scheduled (${report.scheduled.length})`));
  for (const item of report.scheduled) out(`  - ${item.due ?? 'no date'}  ${item.label}`);

  out(subheading(`Watching - no action needed (${report.watching.length})`));
  for (const item of report.watching) out(`  - ${item.label}${item.note ? ` - ${item.note}` : ''}`);

  out(subheading(`Intentionally deferred (${report.deferred.length})`));
  out('  These are decisions, not backlog. Each one has a reason and a trigger.');
  for (const item of report.deferred) {
    out(`  - ${item.label}`);
    out(`      why not now:  ${item.deferral_reason}`);
    out(`      revisit when: ${item.revisit_trigger}`);
  }

  if (report.blocked.length) {
    out(subheading(`Blocked (${report.blocked.length})`));
    for (const item of report.blocked) out(`  - ${item.label} - blocked by ${(item.blocked_by ?? []).join(', ')}`);
  }

  if (report.violations.length) {
    out(subheading('Vocabulary violations'));
    for (const violation of report.violations) out(`  ! ${violation.id} is ${violation.action_state} without ${violation.missing}`);
  }

  out(subheading('Limits of this report'));
  for (const limit of report.limits) out(`  - ${limit}`);
}

function renderRules(project, args) {
  const asOf = args['as-of'] ?? null;
  const active = activeRules(project, { asOf });
  const retired = retiredRules(project, { asOf });

  out(heading('Rules, guardrails and preferences'));
  out(table(active, [
    { header: 'Id', value: (r) => r.id },
    { header: 'Lifecycle', value: (r) => r.lifecycle },
    { header: 'Scope', value: (r) => r.owner_scope },
    { header: 'Retires when', value: (r) => r.expires_when ?? 'never' },
  ]));

  if (retired.length) {
    out(subheading(`Retired (${retired.length})`));
    for (const rule of retired) out(`  - ${rule.id}: ${rule.retirement_reason}`);
  }

  out(subheading('Authority hierarchy'));
  for (const level of project.rules.authority_hierarchy) {
    out(`  ${level.level}. ${level.label}${level.note ? ` - ${level.note}` : ''}`);
  }
  out(`\n  ${project.rules.authority_rule}`);

  const simulation = simulateProgramCompletion(project, project.program.id, { asOf });
  out(subheading(`If ${simulation.program} completed today`));
  out(`  ${simulation.retires.length} rule(s) would retire: ${simulation.retires.join(', ')}`);
  out(`  ${simulation.survives.length} would survive, including every enduring preference.`);
  out(`  ${simulation.note}`);
}

function renderProgram(project) {
  const program = project.program;
  out(heading(`${program.name} - ${program.status}`));
  out(`  ${program.north_star}`);
  out(subheading('Where this sits'));
  out(`  ${project.programs.note}`);
  out(`  Programs: ${project.programs.programs.map((p) => `${p.id} (${p.status})`).join(', ')}`);
  out(`  Domains:  ${project.programs.domains.map((d) => d.id).join(', ')}`);
  out(subheading('Completion criteria'));
  for (const criterion of program.completion_criteria) out(`  [ ] ${criterion}`);
  out(subheading('On completion'));
  for (const step of program.on_completion) out(`  - ${step}`);
  out(subheading('Not built yet'));
  for (const gap of project.programs.not_built_yet) out(`  - ${gap}`);
}

const COMMANDS = {
  budget: renderBudget,
  roadtrip: renderRoadTrip,
  house: renderHouse,
  launch: renderLaunch,
  scenarios: renderScenarios,
  timeline: renderTimeline,
  freshness: renderFreshness,
  questions: renderQuestions,
  readiness: renderReadiness,
  pulse: renderPulse,
  contradictions: renderContradictions,
  canonical: renderCanonical,
  attention: renderAttention,
  rules: renderRules,
  program: renderProgram,
  why: renderWhy,
  decisions: renderDecisions,
  validate: renderValidate,
  blocked: renderBlocked,
  'offer-day': renderOfferDay,
  snapshot: (project) => {
    const { path } = saveSnapshot(project);
    out(`Snapshot written to ${path}`);
  },
  diff: (project) => {
    const diff = diffSnapshot(project);
    out(heading('What changed since the last snapshot'));
    if (!diff.has_baseline) { out(`  ${diff.message}`); return; }
    out(`  Baseline taken ${diff.since}`);
    if (diff.changes.length === 0) { out('  Nothing changed.'); return; }
    for (const change of diff.changes) {
      out(`  - ${change.kind}: ${change.id}${change.from !== undefined ? ` ${change.from} -> ${change.to}` : ''}${change.delta !== undefined ? ` (${change.delta > 0 ? '+' : ''}${change.delta})` : ''}`);
    }
  },
};

function usage() {
  out(heading('California Move Command Center'));
  out('  node src/cli.js <command> [options]\n');
  out('  Commands:');
  out('    budget         Move budget for a scenario, by category and cash-timing bucket');
  out('    roadtrip       Fuel, nights, dogs and the route skeleton');
  out('    house          Orlando rent-vs-sell economics and the $350 guardrail');
  out('    launch         California Launch Fund ladder');
  out('    scenarios      Career path x house branch x employer support matrix');
  out('    timeline       Dependency-aware dates (--offer, --report)');
  out('    offer-day      Execution mode for a real offer (--date, --report)');
  out('    readiness      Gate-aware readiness by workstream');
  out('    pulse          Weekly relocation-readiness pulse');
  out('    questions      Ranked unresolved-input queue (--top N)');
  out('    freshness      Stale assumptions (--as-of, --max-age)');
  out('    contradictions Records that conflict with the latest decisions');
  out('    blocked        What is intentionally not allowed yet, and why');
  out('    snapshot/diff  Save a baseline / show what changed since it\n');
  out('  Options: --branch house_sell|house_rent|house_defer  --support <profile>');
  out('           --set id=value (repeatable, session-only what-ifs)  --json');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const command = args._[0];
  if (!command || command === 'help' || !COMMANDS[command]) {
    usage();
    if (command && command !== 'help' && !COMMANDS[command]) {
      process.exitCode = 1;
      out(`\n  Unknown command: ${command}`);
    }
    return;
  }
  const project = loadProject({ overrides: parseOverrides(args.set) });
  COMMANDS[command](project, args);
}

main();
