import { round2 } from '../lib/format.js';
import { computeBudget, BRANCHES } from './move-budget.js';
import { computeHouse } from './house-rent-vs-sell.js';

/**
 * Career path x house branch x employer support.
 *
 * Career path does not change the physical move today - and that is the point.
 * The matrix shows it explicitly so nobody assumes Path B is cheaper just
 * because employment continues.
 */
export function computeScenarioMatrix(project, { supports = ['unknown', 'movers_hotels_reimbursed', 'movers_hotels_direct'] } = {}) {
  const paths = project.career.paths.map((p) => p.id);
  const house = computeHouse(project);
  const rows = [];

  for (const path of paths) {
    for (const branch of BRANCHES) {
      for (const support of supports) {
        const budget = computeBudget(project, { branch, support });
        rows.push({
          path,
          branch,
          support,
          liquidity_required: budget.totals.liquidity_required,
          cash_at_risk: round2(budget.totals.by_type.spend + budget.totals.by_type.exposure - budget.totals.employer_covered),
          refundable: budget.totals.by_type.refundable,
          reserve_capital: budget.totals.by_type.reserve,
          contingency: budget.totals.by_type.contingency,
          lane_net_cost: budget.totals.lane_net_cost,
          recurring_monthly_delta: house.recurring_monthly_delta[branch].delta,
          unpriced_count: budget.unpriced.length,
        });
      }
    }
  }

  return {
    rows,
    dimensions: {
      career_path: paths,
      house_branch: BRANCHES,
      employer_support: supports,
      not_modeled_yet: ['California housing timing', 'Orlando listing timing', 'household move shape', 'financial windfalls'],
    },
    orthogonality_note: 'Career path and house branch are independent. A path never selects a branch.',
    path_note: 'Liquidity is identical across paths today because no path has stated relocation support. That is a measurement of ignorance, not a finding that the paths cost the same.',
    windfall_note: 'Base case excludes the December RSU gross estimate and any 2027 tax refund. Neither is cash until settled or received.',
  };
}
