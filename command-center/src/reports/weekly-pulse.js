import { daysBetween, usd } from '../lib/format.js';
import { buildReadiness } from './readiness.js';
import { diffSnapshot } from './snapshot.js';
import { checkFreshness } from '../research/freshness.js';
import { computeHouse } from '../calculators/house-rent-vs-sell.js';
import { supersededHistory } from '../lib/canonical.js';
import { attentionReport } from '../lib/attention.js';

function upcoming(project, asOf, withinDays) {
  const items = [
    ...project.tasks.tasks.filter((t) => t.due).map((t) => ({ date: t.due, label: t.label, kind: 'task', status: t.status })),
    ...project.career.timing_benchmarks.filter((b) => b.status !== 'complete').map((b) => ({ date: b.date, label: b.label, kind: 'benchmark', status: b.status })),
    { date: project.benefits.annual_enrollment.window_end, label: 'Disney Annual Enrollment closes', kind: 'benefits', status: 'open' },
  ];
  return items
    .map((item) => ({ ...item, in_days: daysBetween(asOf, item.date) }))
    .filter((item) => item.in_days >= 0 && item.in_days <= withinDays)
    .sort((a, b) => a.in_days - b.in_days);
}

/** The weekly relocation-readiness pulse. Short enough to act on, long enough to keep context. */
export function buildPulse(project, { asOf, branch = 'house_sell', support = 'unknown' } = {}) {
  const date = asOf ?? project.program.planning_date;
  const readiness = buildReadiness(project, { branch, support, asOf: date });
  const diff = diffSnapshot(project);
  const freshness = checkFreshness(project, { asOf: date });
  const house = computeHouse(project);

  const waitingOn = project.tasks.tasks.filter((t) => t.status === 'awaiting_response' || t.status === 'blocked');
  const actionable = project.tasks.tasks
    .filter((t) => ['open', 'scheduled'].includes(t.status) && ['critical', 'high'].includes(t.priority))
    .sort((a, b) => (a.due ?? '9999').localeCompare(b.due ?? '9999'));

  return {
    date,
    branch,
    support,
    what_changed: diff.has_baseline ? diff.changes : diff.message,
    career: project.career.paths.map((path) => ({
      id: path.id,
      name: path.name,
      status: path.status,
      threads: project.career.opportunities.filter((o) => o.path === path.id).length,
      relocation_support_status: path.relocation_support_status,
    })),
    cash: {
      liquidity_required: readiness.liquidity_required,
      designated_launch_fund: readiness.launch_fund.designated_balance,
      venture: project.finance.accounts.find((a) => a.id === 'acct.venture_x'),
      floor_warning: readiness.launch_fund.floor_warning,
    },
    house_evidence: {
      pm_status: project.house.property_management_workstream.status,
      sale_status: project.house.sale_workstream.status,
      inspection: project.house.inspection.prior_inspector.action,
      verdict: house.verdict,
    },
    assumptions: { stale: freshness.stale.map((row) => ({ id: row.id, age_days: row.age_days, refresh_rule: row.refresh_rule })), low_confidence: freshness.low_confidence_in_use.length },
    deadlines_14: upcoming(project, date, 14),
    deadlines_30: upcoming(project, date, 30),
    top_actions: actionable.slice(0, 3),
    intentionally_not_yet: project.program.deferred_actions.slice(0, 4),
    attention: attentionReport(project, { asOf: date }),
    risks_live: project.risks.risks.filter((r) => r.status === 'realized' || r.status === 'likely_realized_under_current_assumptions'),
    waiting_on: waitingOn,
    decision_needed: readiness.pending_resolution.map((item) => ({
      id: item.id,
      topic: item.label,
      state: item.canonical_state,
      needs: item.resolution_required,
      proposal: item.resolution_rule,
    })),
    settled_this_phase: supersededHistory(project).length,
    honesty_note: waitingOn.length > 0 && actionable.length <= 3
      ? `Much of this week is genuinely waiting: ${waitingOn.map((t) => t.label).join('; ')}. Waiting is the correct action, not a gap to fill with invented work.`
      : null,
    summary_line: `${readiness.rows.filter((r) => r.status === 'RED').length} red, ${readiness.rows.filter((r) => r.status.startsWith('YELLOW')).length} yellow. ${usd(readiness.liquidity_required)} liquidity required for the ${branch} branch at ${support} employer support.`,
  };
}
