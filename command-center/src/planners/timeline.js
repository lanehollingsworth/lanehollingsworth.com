import { addDays, daysBetween, round2 } from '../lib/format.js';
import { evaluate } from '../lib/expr.js';

/**
 * Dependency-aware date engine (critical path, forward and backward).
 *
 * Forward pass from the trigger date gives the earliest each step can happen.
 * Backward pass from the required first office day gives the latest it can
 * happen. Negative slack means the runway does not exist - which is a finding,
 * not an error to round away.
 */
export function buildTimeline(project, { triggerDate, reportDate = null } = {}) {
  if (!triggerDate) throw new Error('buildTimeline requires a triggerDate (offer or approved location change).');

  const steps = project.moveSequence.steps.map((step) => ({
    ...step,
    duration: step.duration_formula
      ? Math.round(evaluate(step.duration_formula, project.scope))
      : step.duration_days,
  }));
  const byId = new Map(steps.map((step) => [step.id, step]));
  for (const step of steps) {
    for (const dep of step.after ?? []) {
      if (!byId.has(dep.id)) throw new Error(`Step "${step.id}" depends on unknown step "${dep.id}".`);
    }
  }

  // Topological order (Kahn), so a malformed graph fails loudly instead of looping.
  const indegree = new Map(steps.map((s) => [s.id, (s.after ?? []).length]));
  const dependents = new Map(steps.map((s) => [s.id, []]));
  for (const step of steps) {
    for (const dep of step.after ?? []) dependents.get(dep.id).push(step.id);
  }
  const queue = steps.filter((s) => indegree.get(s.id) === 0).map((s) => s.id);
  const order = [];
  while (queue.length) {
    const id = queue.shift();
    order.push(id);
    for (const next of dependents.get(id)) {
      indegree.set(next, indegree.get(next) - 1);
      if (indegree.get(next) === 0) queue.push(next);
    }
  }
  if (order.length !== steps.length) throw new Error('Cycle detected in move-sequence dependencies.');

  const earliestStart = new Map();
  const earliestFinish = new Map();
  for (const id of order) {
    const step = byId.get(id);
    const start = (step.after ?? []).reduce((max, dep) => {
      const candidate = earliestFinish.get(dep.id) + (dep.lag_days ?? 0);
      return Math.max(max, candidate);
    }, 0);
    earliestStart.set(id, start);
    earliestFinish.set(id, start + step.duration);
  }

  const terminal = steps.find((s) => s.terminal_anchor);
  const projectFinish = Math.max(...earliestFinish.values());
  const reportOffset = reportDate ? daysBetween(triggerDate, reportDate) : earliestFinish.get(terminal.id);

  const latestFinish = new Map();
  const latestStart = new Map();
  for (const id of [...order].reverse()) {
    const step = byId.get(id);
    let lf;
    if (step.terminal_anchor) {
      lf = reportOffset;
    } else {
      const successors = dependents.get(id);
      const constraining = successors.filter((sid) => !byId.get(sid).floats);
      const pool = constraining.length ? constraining : successors;
      lf = pool.length
        ? Math.min(...pool.map((sid) => latestStart.get(sid) - ((byId.get(sid).after.find((d) => d.id === id)?.lag_days) ?? 0)))
        : Math.max(earliestFinish.get(id), reportOffset);
    }
    latestFinish.set(id, lf);
    latestStart.set(id, lf - step.duration);
  }

  // Floating steps (they gate nothing) take their latest dates from their
  // predecessors' latest finish rather than from the report date, so a report
  // date with slack does not make the first paycheck look early.
  for (const id of order) {
    const step = byId.get(id);
    if (!step.floats) continue;
    const successors = dependents.get(id);
    if (successors.length > 0) continue;
    const ls = (step.after ?? []).reduce(
      (max, dep) => Math.max(max, latestFinish.get(dep.id) + (dep.lag_days ?? 0)),
      latestStart.get(id),
    );
    latestStart.set(id, ls);
    latestFinish.set(id, ls + step.duration);
  }

  const drivingSlack = Math.min(
    ...steps.filter((step) => !step.floats).map((step) => latestStart.get(step.id) - earliestStart.get(step.id)),
  );

  const schedule = steps.map((step) => {
    const es = earliestStart.get(step.id);
    const ef = earliestFinish.get(step.id);
    const ls = latestStart.get(step.id);
    const slack = ls - es;
    return {
      id: step.id,
      label: step.label,
      category: step.category,
      gate: step.gate,
      irreversible: Boolean(step.irreversible),
      duration_days: step.duration,
      earliest_start: addDays(triggerDate, es),
      earliest_finish: addDays(triggerDate, ef),
      latest_start: addDays(triggerDate, ls),
      latest_finish: addDays(triggerDate, latestFinish.get(step.id)),
      slack_days: slack,
      critical: !step.floats && slack === drivingSlack,
      note: step.note ?? null,
      offsets: { es, ef, ls, slack },
    };
  }).sort((a, b) => a.offsets.es - b.offsets.es || a.offsets.ef - b.offsets.ef);

  const shortfall = reportDate ? earliestFinish.get(terminal.id) - reportOffset : 0;

  return {
    trigger_date: triggerDate,
    report_date: reportDate,
    earliest_possible_report_date: addDays(triggerDate, earliestFinish.get(terminal.id)),
    total_days_from_trigger: earliestFinish.get(terminal.id),
    project_finish_days: projectFinish,
    schedule,
    critical_path: schedule.filter((s) => s.critical).map((s) => s.id),
    driving_slack_days: drivingSlack,
    feasible: shortfall <= 0,
    shortfall_days: Math.max(0, shortfall),
    slack_days: reportDate ? round2(reportOffset - earliestFinish.get(terminal.id)) : null,
    irreversible_steps: schedule.filter((s) => s.irreversible).map((s) => ({ id: s.id, label: s.label, earliest: s.earliest_start, gate: s.gate })),
    remedies: shortfall > 0
      ? [
          `The sequence needs ${earliestFinish.get(terminal.id)} days from trigger; the report date allows ${reportOffset}. Short by ${shortfall}.`,
          'Ask for a remote transition period before the first required office day.',
          'Ask for a later start date - this is a normal negotiation, not a favor.',
          'Shorten the Orlando prep by deferring the house branch rather than by compressing the road trip or the arrival buffer.',
          'Do not solve a short runway by driving longer days with the dogs.',
        ]
      : [],
    assumption_note: 'Calendar days, not working days. Lead times (carrier pickup, payroll cycle) are placeholders in data/move-sequence.json until confirmed.',
  };
}
