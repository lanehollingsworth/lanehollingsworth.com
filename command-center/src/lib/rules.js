/**
 * Rule lifecycle and authority.
 *
 * Two failures this exists to prevent:
 *   1. A rule outliving the thing it belonged to - being told in 2028 that a
 *      California Launch Fund guardrail is being violated.
 *   2. An inference quietly overruling something Lane actually decided.
 */

const RETIRING_PROGRAM_STATES = new Set(['complete', 'abandoned']);
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function programStatus(project, programId, overrides = {}) {
  if (overrides[programId]) return overrides[programId];
  return project.programs.programs.find((p) => p.id === programId)?.status ?? 'unknown';
}

/**
 * Why a rule is or is not live right now.
 * `programStates` lets a caller ask "what happens when this program completes?"
 * without mutating anything.
 */
export function ruleStatus(project, rule, { asOf = null, programStates = {} } = {}) {
  if (rule.lifecycle === 'enduring_preference') {
    return { active: true, reason: 'Enduring preference. Retires only when Lane says so.' };
  }

  if (rule.owner_scope?.startsWith('program:')) {
    const programId = rule.owner_scope.slice('program:'.length);
    const status = programStatus(project, programId, programStates);
    if (RETIRING_PROGRAM_STATES.has(status)) {
      return { active: false, reason: `Retired with program ${programId} (${status}).`, retired_by: programId };
    }
  }

  if (asOf && rule.expires_when && ISO_DATE.test(rule.expires_when) && rule.expires_when < asOf) {
    return { active: false, reason: `Expired ${rule.expires_when}.`, retired_by: 'date' };
  }

  return { active: true, reason: rule.expires_when ? `Live until: ${rule.expires_when}` : 'Live.' };
}

export function activeRules(project, options = {}) {
  return project.rules.rules.filter((rule) => ruleStatus(project, rule, options).active);
}

export function retiredRules(project, options = {}) {
  return project.rules.rules
    .map((rule) => ({ rule, status: ruleStatus(project, rule, options) }))
    .filter((row) => !row.status.active)
    .map((row) => ({ ...row.rule, retirement_reason: row.status.reason }));
}

/** What completing a program would retire, and what would survive it. */
export function simulateProgramCompletion(project, programId, { asOf = null } = {}) {
  const options = { asOf, programStates: { [programId]: 'complete' } };
  const before = activeRules(project, { asOf }).map((r) => r.id);
  const after = activeRules(project, options).map((r) => r.id);
  return {
    program: programId,
    retires: before.filter((id) => !after.includes(id)),
    survives: after,
    note: 'Decisions, evidence and domain guardrails survive. They belong to Lane, not to the program.',
  };
}

export function authorityLevel(project, authorityId) {
  const level = project.rules.authority_hierarchy.find((entry) => entry.id === authorityId);
  if (!level) throw new Error(`Unknown authority "${authorityId}".`);
  return level.level;
}

/**
 * Which source wins when two disagree - and the reminder that winning is not
 * the same as silence. A conflict is always reported.
 */
export function resolveAuthority(project, a, b) {
  const levelA = authorityLevel(project, a);
  const levelB = authorityLevel(project, b);
  if (levelA === levelB) return { winner: null, tie: true, must_report: true };
  return {
    winner: levelA < levelB ? a : b,
    loser: levelA < levelB ? b : a,
    must_report: true,
    rule: project.rules.authority_rule,
  };
}

/** An inference may raise a review trigger; it may never overrule a decision. */
export function inferenceChallenge(project, { subject, decision_id = null, changed_premise, reason }) {
  return {
    kind: 'review_trigger',
    subject,
    decision_id,
    changed_premise,
    reason,
    authority: 'agent_inference',
    overrides_decision: false,
    statement: `A premise behind this changed: ${changed_premise}. That makes it a review trigger, not a reversal.`,
  };
}
