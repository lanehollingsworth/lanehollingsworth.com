import { daysBetween } from '../lib/format.js';

const STALE_BY_STATUS = { verified: 90, sheet_value: 45, lane_confirmed: 60, planning_assumption: 30, historical_observation: 120, research_lead: 30, session_override: 1 };

/**
 * Which inputs are old enough that acting on them is a risk?
 *
 * Different kinds of facts rot at different speeds: a mortgage statement holds
 * for a quarter, a gas price does not survive a month. Staleness is reported,
 * never silently tolerated.
 */
export function checkFreshness(project, { asOf, maxAgeDays = null } = {}) {
  const today = asOf ?? project.assumptions.get('roadtrip.route_miles')?.last_verified ?? new Date().toISOString().slice(0, 10);

  const rows = [...project.assumptions.values()].map((assumption) => {
    const age = assumption.last_verified ? daysBetween(assumption.last_verified, today) : null;
    const threshold = maxAgeDays ?? STALE_BY_STATUS[assumption.status] ?? 30;
    return {
      id: assumption.id,
      label: assumption.label,
      value: assumption.value,
      unit: assumption.unit,
      status: assumption.status,
      confidence: assumption.confidence,
      last_verified: assumption.last_verified ?? null,
      age_days: age,
      threshold_days: threshold,
      stale: age === null ? true : age > threshold,
      refresh_rule: assumption.refresh_rule ?? null,
    };
  });

  return {
    as_of: today,
    threshold_note: maxAgeDays
      ? `Uniform ${maxAgeDays}-day threshold requested.`
      : 'Per-status thresholds: verified 90d, sheet value 45d, Lane-confirmed 60d, planning assumption 30d, historical observation 120d.',
    stale: rows.filter((row) => row.stale),
    fresh: rows.filter((row) => !row.stale),
    low_confidence_in_use: rows.filter((row) => row.confidence === 'low'),
    all: rows,
  };
}
