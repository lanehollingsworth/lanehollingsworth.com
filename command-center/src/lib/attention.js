import { daysBetween } from './format.js';

/**
 * What deserves attention today - and, just as importantly, what does not.
 *
 * This deliberately stops short of cross-domain arbitration. It reports which
 * items are in an attention state and which are deliberately quiet; it does not
 * yet decide which single ACT_NOW item wins a Tuesday. That needs calendar,
 * capacity and energy modeling, which the platform does not have.
 */
export function attentionReport(project, { asOf = null } = {}) {
  const date = asOf ?? project.program.planning_date;
  const states = project.actionStates;
  const attentionStates = new Set(states.attention_states);

  const tasks = project.tasks.tasks.map((task) => ({
    id: task.id,
    label: task.label,
    action_state: task.action_state,
    domain: task.domain,
    program: task.program,
    due: task.due ?? null,
    in_days: task.due ? daysBetween(date, task.due) : null,
    owner: task.external_party ?? 'Lane',
    external_party: task.external_party ?? null,
    blocked_by: task.blocked_by ?? null,
    deferral_reason: task.deferral_reason ?? null,
    revisit_trigger: task.revisit_trigger ?? null,
    note: task.note ?? null,
    routine_candidate: Boolean(task.routine_candidate),
  }));

  const deferred = (project.program.deferred_actions ?? []).map((item) => ({
    id: item.id,
    label: item.action,
    action_state: item.action_state,
    domain: 'program',
    program: project.program.id,
    deferral_reason: item.deferral_reason,
    revisit_trigger: item.revisit_trigger,
  }));

  const all = [...tasks, ...deferred];
  const byState = {};
  for (const item of all) (byState[item.action_state] ??= []).push(item);

  const needsAttention = all
    .filter((item) => attentionStates.has(item.action_state))
    .sort((a, b) => (a.in_days ?? 999) - (b.in_days ?? 999));

  const violations = [];
  for (const item of all) {
    const required = states.states[item.action_state]?.requires ?? [];
    for (const field of required) {
      if (!item[field]) violations.push({ id: item.id, action_state: item.action_state, missing: field });
    }
  }

  return {
    date,
    counts: Object.fromEntries(Object.entries(byState).map(([state, items]) => [state, items.length])),
    needs_attention: needsAttention,
    waiting_on: byState.WAITING_ON_SOMEONE_ELSE ?? [],
    scheduled: byState.SCHEDULED ?? [],
    watching: byState.WATCH ?? [],
    deferred: [...(byState.INTENTIONALLY_DEFERRED ?? []), ...(byState.NOT_WORTH_DOING ?? [])],
    blocked: byState.BLOCKED ?? [],
    violations,
    limits: states.rules,
    summary: `${needsAttention.length} thing(s) deserve attention. ${(byState.WATCH ?? []).length} being watched, ` +
      `${(byState.WAITING_ON_SOMEONE_ELSE ?? []).length} waiting on someone else, ` +
      `${(byState.INTENTIONALLY_DEFERRED ?? []).length} intentionally deferred.`,
  };
}
