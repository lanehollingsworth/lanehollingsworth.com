import { evaluate, identifiers } from '../lib/expr.js';
import { round2 } from '../lib/format.js';

export const BRANCHES = ['house_sell', 'house_rent', 'house_defer'];

const COST_TYPES = new Set(['spend', 'exposure']);

function resolveSupport(budgetData, supportId) {
  const profile = budgetData.relocation_support_profiles.find((p) => p.id === supportId);
  if (!profile) {
    const known = budgetData.relocation_support_profiles.map((p) => p.id).join(', ');
    throw new Error(`Unknown relocation support profile "${supportId}". Known: ${known}`);
  }
  return profile;
}

/**
 * Builds the move budget for one scenario.
 *
 * Categories are never collapsed. A deposit is not a cost, a reserve is not a
 * cost, and a contingency that stays unspent is not a cost - but all of them
 * are liquidity Lane must actually have. Both numbers are reported.
 */
export function computeBudget(project, options = {}) {
  const {
    branch = 'house_sell',
    includeOrlandoTransition = true,
    support = 'unknown',
  } = options;

  if (!BRANCHES.includes(branch)) {
    throw new Error(`Unknown house branch "${branch}". Known: ${BRANCHES.join(', ')}`);
  }

  const profile = resolveSupport(project.budget, support);
  const covers = new Set(profile.covers ?? []);
  const directBilled = new Set(profile.direct_billed ?? []);

  const scopes = new Set(['common']);
  if (includeOrlandoTransition) scopes.add('orlando_transition');
  scopes.add(branch);

  const items = project.budget.items
    .filter((item) => scopes.has(item.scope))
    .map((item) => {
      const amount = round2(evaluate(item.formula, project.scope));
      const isDirect = directBilled.has(item.id);
      const isCovered = covers.has(item.id) || isDirect;
      const coverageMode = isDirect ? 'direct_billed' : isCovered ? 'reimbursed' : 'none';
      const laneFronts = isDirect ? 0 : amount;
      const coveredAmount = isCovered ? amount : 0;
      const laneNet = COST_TYPES.has(item.type) ? round2(amount - coveredAmount) : 0;
      return {
        ...item,
        amount,
        inputs: identifiers(item.formula),
        coverage_mode: coverageMode,
        covered_amount: coveredAmount,
        lane_fronts: laneFronts,
        lane_net_cost: laneNet,
      };
    });

  const sum = (predicate, field = 'amount') =>
    round2(items.filter(predicate).reduce((total, item) => total + item[field], 0));

  const byType = {};
  for (const type of ['spend', 'refundable', 'reserve', 'contingency', 'exposure']) {
    byType[type] = sum((item) => item.type === type);
  }

  const byWorkstream = {};
  for (const item of items) {
    byWorkstream[item.workstream] = round2((byWorkstream[item.workstream] ?? 0) + item.amount);
  }

  const byTiming = {};
  for (const item of items) {
    byTiming[item.timing] = round2((byTiming[item.timing] ?? 0) + item.lane_fronts);
  }

  const liquidityRequired = sum(() => true, 'lane_fronts');
  const laneNetCost = sum(() => true, 'lane_net_cost');
  const lumpSum = profile.mode === 'lump_sum' ? (profile.amount ?? 0) : 0;

  const unpriced = project.budget.unpriced_items.filter((item) => scopes.has(item.scope));

  return {
    branch,
    support: { id: profile.id, label: profile.label, mode: profile.mode, note: profile.note ?? null, lump_sum: lumpSum },
    includeOrlandoTransition,
    items,
    unpriced,
    totals: {
      gross: sum(() => true),
      by_type: byType,
      by_workstream: byWorkstream,
      by_timing: byTiming,
      liquidity_required: liquidityRequired,
      liquidity_after_lump_sum: round2(liquidityRequired - lumpSum),
      employer_covered: sum((item) => item.covered_amount > 0, 'covered_amount'),
      employer_direct_billed: sum((item) => item.coverage_mode === 'direct_billed', 'amount'),
      employer_reimbursed_fronted: sum((item) => item.coverage_mode === 'reimbursed', 'amount'),
      lane_net_cost: laneNetCost,
      lane_net_cost_if_contingency_spent: round2(laneNetCost + byType.contingency),
    },
    caveats: [
      `${unpriced.length} known item(s) in this scenario are still unpriced and are NOT in any total.`,
      profile.mode === 'reimbursed'
        ? 'Reimbursed items still require Lane to front the cash. Liquidity is unchanged; only net cost falls.'
        : null,
      lumpSum > 0
        ? 'A lump sum reduces liquidity only if it lands before the cash is needed. Confirm the payment date before relying on it.'
        : null,
      byType.reserve > 0 ? 'The landlord reserve is Lane\'s capital, not a cost. It is required liquidity that stays his.' : null,
      byType.exposure > 0 ? 'Orlando overlap is exposure per month. Re-run at 2 and 3 months before committing to a sequence.' : null,
    ].filter(Boolean),
  };
}

/** The common physical move only: no Orlando overlap, no house branch. */
export function computeCommonMove(project, options = {}) {
  const budget = computeBudget(project, { ...options, branch: 'house_defer', includeOrlandoTransition: false });
  return budget;
}
