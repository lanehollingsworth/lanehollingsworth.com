import { round2, usd } from '../lib/format.js';
import { computeBudget } from './move-budget.js';

/**
 * Orlando rent-vs-sell economics.
 *
 * The framing is deliberate: renting must earn the right to beat selling.
 * Nothing here decides the branch - it prices what each branch demands so the
 * decision waits on written evidence (PM quotes, a CMA, an inspection) rather
 * than on a mood.
 */
export function computeHouse(project) {
  const s = project.scope;
  const payment = s['orlando.mortgage_payment'];
  const leakage = s['house.pm_rate'] + s['house.vacancy_rate'] + s['house.maintenance_rate'];
  const keepRate = 1 - leakage;
  const guardrail = s['house.subsidy_guardrail'];
  const modeledRent = s['house.expected_market_rent'];

  const netAt = (rent) => round2(rent * keepRate);
  const subsidyAt = (rent) => round2(payment - netAt(rent));

  const breakEvenRent = round2(payment / keepRate);
  const guardrailRent = round2((payment - guardrail) / keepRate);

  const rentScenarios = [2250, 2400, modeledRent, guardrailRent, breakEvenRent]
    .filter((rent, index, all) => all.indexOf(rent) === index)
    .sort((a, b) => a - b)
    .map((rent) => ({
      rent,
      owner_net: netAt(rent),
      monthly_subsidy: subsidyAt(rent),
      clears_guardrail: subsidyAt(rent) <= guardrail,
    }));

  const liquidity = Object.fromEntries(
    ['house_sell', 'house_rent', 'house_defer'].map((branch) => {
      const budget = computeBudget(project, { branch });
      return [branch, budget.totals.liquidity_required];
    }),
  );

  const caRent = s['ca_housing.monthly_rent'];
  const recurringDelta = {
    house_sell: { after: caRent, delta: round2(caRent - payment), note: 'After closing. Until then the sell branch carries the full mortgage as exposure.' },
    house_rent: { after: round2(caRent + subsidyAt(modeledRent)), delta: round2(caRent + subsidyAt(modeledRent) - payment), note: `At the modeled ${usd(modeledRent)} rent, which is an unverified planning assumption.` },
    house_defer: { after: round2(caRent + payment), delta: round2(caRent), note: 'Full Orlando carry plus California rent, every month it lasts.' },
  };

  return {
    payment,
    leakage_rates: { pm: s['house.pm_rate'], vacancy: s['house.vacancy_rate'], maintenance: s['house.maintenance_rate'], total: round2(leakage) },
    break_even_rent: breakEvenRent,
    guardrail,
    guardrail_rent: guardrailRent,
    modeled_rent: modeledRent,
    modeled_subsidy: subsidyAt(modeledRent),
    modeled_clears_guardrail: subsidyAt(modeledRent) <= guardrail,
    rent_scenarios: rentScenarios,
    liquidity,
    rent_branch_liquidity_premium: round2(liquidity.house_rent - liquidity.house_sell),
    recurring_monthly_delta: recurringDelta,
    verdict: subsidyAt(modeledRent) <= guardrail
      ? 'Under the current assumptions the rent branch clears the $350 guardrail. Verify with written PM numbers before trusting it.'
      : `Under the current assumptions the house is not naturally cash-flow positive as a rental: the modeled subsidy is ${usd(subsidyAt(modeledRent))}/month against a ${usd(guardrail)}/month guardrail. Renting has not yet earned the right to beat selling.`,
    evidence_required: project.house.branches.flatMap((b) => b.unresolved ?? []),
    decision_state: project.house.decision_state,
    lean: project.house.lean,
  };
}
