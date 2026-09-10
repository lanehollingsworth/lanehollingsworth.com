const GATE_WEIGHT = { gate_1: 3, gate_2: 3, gate_3: 2, gate_4: 2, gate_5: 1, gate_6: 1 };

function swingBucket(swing) {
  if (swing === null || swing === undefined) return 0;
  if (swing < 2000) return 1;
  if (swing < 10000) return 2;
  if (swing < 25000) return 3;
  return 4;
}

/** Ranks the unresolved-input queue by the formula recorded in data/questions.json. */
export function rankQuestions(project, { includeResolved = false } = {}) {
  const rows = project.questions.questions
    .filter((q) => includeResolved || q.status !== 'resolved')
    .map((q) => {
      const bucket = swingBucket(q.dollar_swing_estimate);
      const gate = GATE_WEIGHT[q.blocks_gate] ?? 1;
      return {
        ...q,
        swing_bucket: bucket,
        gate_weight: gate,
        priority: q.decision_leverage * 2 + bucket + gate,
      };
    })
    .sort((a, b) => b.priority - a.priority || (b.dollar_swing_estimate ?? 0) - (a.dollar_swing_estimate ?? 0));

  return { formula: project.questions.ranking_formula, rows };
}

export function topQuestions(project, count = 3) {
  return rankQuestions(project).rows.slice(0, count);
}
