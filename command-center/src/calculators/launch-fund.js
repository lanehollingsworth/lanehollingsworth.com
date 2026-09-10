import { round2, usd } from '../lib/format.js';
import { computeBudget, computeCommonMove } from './move-budget.js';

/**
 * The Launch Fund is a ladder, not a single $10,000 target.
 * Each rung is computed from the same budget engine, so a changed assumption
 * moves every rung at once.
 */
export function computeLaunchFund(project, { branch = 'house_sell', support = 'unknown' } = {}) {
  const common = computeCommonMove(project, { support });
  const baseTransition = computeBudget(project, { branch: 'house_defer', support, includeOrlandoTransition: true });
  const branchBudget = computeBudget(project, { branch, support, includeOrlandoTransition: true });

  const rungs = [
    { id: 'rung.floor', label: 'Minimum launch floor', amount: project.scope['launch_fund.floor'], basis: 'Static goal carried from the sheet. A floor, not a budget.' },
    { id: 'rung.common_move', label: 'Common physical-move requirement', amount: common.totals.liquidity_required, basis: 'Housing at move-in, household move, road trip, setup, contingency.' },
    { id: 'rung.base_transition', label: 'Base transition requirement', amount: baseTransition.totals.liquidity_required, basis: 'Common move plus Orlando overlap and basic prep.' },
    { id: 'rung.house_branch', label: `House-branch requirement (${branch})`, amount: branchBudget.totals.liquidity_required, basis: 'Adds branch-specific reserve or seller cash.' },
    { id: 'rung.comfort', label: 'Comfort target', amount: round2(branchBudget.totals.liquidity_required * 1.15), basis: '15% cushion over the branch requirement: execute without windfalls or the emergency fund.' },
  ];

  const designated = project.finance.accounts.find((a) => a.id === 'acct.launch_fund');
  const balance = designated?.value ?? null;

  return {
    branch,
    support,
    rungs: rungs.map((rung) => ({
      ...rung,
      gap: balance === null ? null : round2(rung.amount - balance),
      met: balance === null ? null : balance >= rung.amount,
    })),
    designated_balance: balance,
    balance_status: designated?.status ?? 'unknown',
    excluded: project.finance.accounts.filter((a) => a.status === 'excluded_by_guardrail').map((a) => a.label),
    excluded_inflows: project.finance.future_inflows
      .filter((inflow) => !inflow.include_in_base_case)
      .map((inflow) => ({ label: inflow.label, treatment: inflow.treatment })),
    floor_warning: branchBudget.totals.liquidity_required > project.scope['launch_fund.floor']
      ? `The ${branch} branch needs ${usd(branchBudget.totals.liquidity_required)} of liquidity against a ${usd(project.scope['launch_fund.floor'])} floor. The floor is not the budget.`
      : null,
  };
}
