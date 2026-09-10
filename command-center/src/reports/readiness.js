import { round2, usd } from '../lib/format.js';
import { computeBudget } from '../calculators/move-budget.js';
import { computeHouse } from '../calculators/house-rent-vs-sell.js';
import { computeLaunchFund } from '../calculators/launch-fund.js';
import { rankQuestions } from '../research/questions.js';
import { checkFreshness } from '../research/freshness.js';

/**
 * Gate-aware readiness. No composite percentage: a single number would hide
 * the one thing that matters, which is whether a workstream is behind or
 * intentionally premature.
 */
export function buildReadiness(project, { branch = 'house_sell', support = 'unknown', asOf = null } = {}) {
  const questions = new Map(project.questions.questions.map((q) => [q.id, q]));
  const unresolved = (ids) => ids.filter((id) => (questions.get(id)?.status ?? 'open') !== 'resolved');

  const budget = computeBudget(project, { branch, support });
  const launch = computeLaunchFund(project, { branch, support });
  const house = computeHouse(project);
  const venture = project.finance.accounts.find((a) => a.id === 'acct.venture_x');

  const rows = project.readiness.workstreams.map((ws) => {
    const open = unresolved(ws.blocking_questions ?? []);
    let status;
    let reason;

    if (ws.id === 'career') {
      const authorized = project.career.opportunities.some((o) => o.status === 'offer_received');
      const active = project.career.opportunities.filter((o) => o.status !== 'watching').length;
      status = authorized ? 'GREEN' : active > 0 ? 'YELLOW' : 'RED';
      reason = authorized
        ? 'A pathway is authorized.'
        : `${active} live thread(s), no written offer and no approved location change. Gate 1 is not met, so every irreversible action stays blocked.`;
    } else if (ws.id === 'finance') {
      const balance = launch.designated_balance;
      status = balance === null ? 'YELLOW' : balance >= budget.totals.liquidity_required ? 'GREEN' : 'YELLOW';
      reason = balance === null
        ? `No designated Launch Fund balance yet, so readiness cannot be measured against the ${usd(budget.totals.liquidity_required)} the ${branch} branch requires. The ${usd(project.scope['launch_fund.floor'])} floor is not the budget.`
        : `${usd(balance)} designated against ${usd(budget.totals.liquidity_required)} required.`;
    } else if (ws.id === 'debt') {
      const balance = venture?.value ?? 0;
      status = balance > 5000 ? 'RED' : balance > 0 ? 'YELLOW' : 'GREEN';
      reason = `${usd(balance)} at ${(venture.apr * 100).toFixed(2)}% APR, already accruing purchase interest. Payoff is in progress at ${usd(project.finance.debt_plan.baseline_per_paycheck)} per paycheck.`;
    } else if (ws.intentionally_premature) {
      status = 'GREEN';
      reason = `Research menu exists and activation is intentionally premature until ${ws.commitment_gate}. Not started is the correct state.`;
    } else if (open.length === 0) {
      status = 'GREEN';
      reason = 'No blocking inputs outstanding.';
    } else if (ws.research_ok_before_gate) {
      status = 'GREEN/RED';
      reason = `GREEN for research, RED for commitment: ${open.length} input(s) outstanding and ${ws.commitment_gate} is not met.`;
    } else {
      status = 'YELLOW';
      reason = `${open.length} blocking input(s) outstanding: ${open.join(', ')}.`;
    }

    return { id: ws.id, label: ws.label, gate: ws.commitment_gate, status, reason, open_questions: open };
  });

  const freshness = checkFreshness(project, { asOf });

  return {
    branch,
    support,
    rows,
    liquidity_required: budget.totals.liquidity_required,
    lane_net_cost: budget.totals.lane_net_cost,
    launch_fund: launch,
    house_verdict: house.verdict,
    stale_inputs: freshness.stale.length,
    unpriced_items: budget.unpriced.length,
    top_questions: rankQuestions(project).rows.slice(0, 3),
    blocked_actions: project.project.blocked_until_trigger,
    open_contradictions: project.contradictions.items.filter((c) => c.status === 'open' || c.status === 'awaiting_lane_approval'),
    recurring_delta: round2(house.recurring_monthly_delta[branch].delta),
  };
}
