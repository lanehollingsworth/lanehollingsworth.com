import { mkdirSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { OUTPUT_DIR } from '../lib/data.js';
import { round2 } from '../lib/format.js';
import { computeBudget } from '../calculators/move-budget.js';
import { computeHouse } from '../calculators/house-rent-vs-sell.js';
import { rankQuestions } from '../research/questions.js';

const SNAPSHOT_PATH = join(OUTPUT_DIR, 'snapshot.json');

/** The set of numbers "what changed since last review?" is measured against. */
export function buildSnapshot(project) {
  const branches = ['house_sell', 'house_rent', 'house_defer'];
  const budgets = Object.fromEntries(
    branches.map((branch) => {
      const budget = computeBudget(project, { branch });
      return [branch, { liquidity: budget.totals.liquidity_required, net_cost: budget.totals.lane_net_cost }];
    }),
  );
  const house = computeHouse(project);
  const openQuestions = rankQuestions(project).rows.map((q) => q.id);

  return {
    taken_at: new Date().toISOString(),
    as_of: project.assumptions.get('orlando.mortgage_payment')?.last_verified ?? null,
    budgets,
    house: { break_even_rent: house.break_even_rent, guardrail_rent: house.guardrail_rent, modeled_subsidy: house.modeled_subsidy },
    assumptions: Object.fromEntries([...project.assumptions.values()].map((a) => [a.id, a.value])),
    open_questions: openQuestions,
    open_contradictions: project.contradictions.items.filter((c) => c.status !== 'resolved_in_model').map((c) => c.id),
  };
}

export function saveSnapshot(project) {
  const snapshot = buildSnapshot(project);
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`);
  return { path: SNAPSHOT_PATH, snapshot };
}

export function loadSnapshot() {
  if (!existsSync(SNAPSHOT_PATH)) return null;
  return JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'));
}

export function diffSnapshot(project, previous = loadSnapshot()) {
  const current = buildSnapshot(project);
  if (!previous) {
    return { has_baseline: false, message: 'No saved snapshot. Run `npm run cc -- snapshot` to set the baseline this report compares against.', current };
  }

  const changes = [];
  for (const [id, value] of Object.entries(current.assumptions)) {
    const before = previous.assumptions[id];
    if (before === undefined) changes.push({ kind: 'assumption_added', id, to: value });
    else if (before !== value) changes.push({ kind: 'assumption_changed', id, from: before, to: value, delta: round2(value - before) });
  }
  for (const id of Object.keys(previous.assumptions)) {
    if (!(id in current.assumptions)) changes.push({ kind: 'assumption_removed', id, from: previous.assumptions[id] });
  }
  for (const [branch, totals] of Object.entries(current.budgets)) {
    const before = previous.budgets?.[branch];
    if (before && before.liquidity !== totals.liquidity) {
      changes.push({ kind: 'liquidity_changed', id: branch, from: before.liquidity, to: totals.liquidity, delta: round2(totals.liquidity - before.liquidity) });
    }
  }
  for (const [key, value] of Object.entries(current.house)) {
    const before = previous.house?.[key];
    if (before !== undefined && before !== value) {
      changes.push({ kind: 'house_changed', id: key, from: before, to: value, delta: round2(value - before) });
    }
  }
  const resolved = (previous.open_questions ?? []).filter((id) => !current.open_questions.includes(id));
  const added = current.open_questions.filter((id) => !(previous.open_questions ?? []).includes(id));
  for (const id of resolved) changes.push({ kind: 'question_resolved', id });
  for (const id of added) changes.push({ kind: 'question_opened', id });

  return { has_baseline: true, since: previous.taken_at, changes, current };
}
