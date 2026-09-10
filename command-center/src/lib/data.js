import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(HERE, '..', '..', 'data');
export const OUTPUT_DIR = join(HERE, '..', '..', 'outputs');

function readJson(name) {
  return JSON.parse(readFileSync(join(DATA_DIR, name), 'utf8'));
}

/**
 * Normalizes one assumption record onto the three-field state model.
 *
 * `status` was the Phase 1 name for evidence_type; it is still accepted as an
 * input alias so older records keep working, and freshness thresholds key off
 * evidence_type exactly as they keyed off status. canonical_state defaults to
 * `confirmed` because an assumption in this file is, by definition, the value
 * the model currently plans on - including when its evidence is only a
 * planning placeholder. Those two facts are independent.
 */
export function normalizeAssumption(record) {
  const { status, ...rest } = record;
  return {
    ...rest,
    evidence_type: record.evidence_type ?? status,
    canonical_state: record.canonical_state ?? 'confirmed',
    verification_state: record.verification_state ?? 'not_externally_verified',
  };
}

/**
 * Loads every data file and builds the assumption scope used by formulas.
 *
 * `overrides` is a plain map of assumption id -> number, used for "what if"
 * questions (a $5.00 gas price, a 17 MPG truck). An override never edits a
 * data file; it is recorded as a session-scoped provenance entry so a report
 * can always say which numbers were not the committed ones.
 */
export function loadProject({ overrides = {} } = {}) {
  const files = readdirSync(DATA_DIR).filter((f) => f.endsWith('.json'));
  const raw = Object.fromEntries(files.map((f) => [f.replace(/\.json$/, ''), readJson(f)]));

  const assumptions = new Map();
  for (const assumption of raw.assumptions.assumptions) {
    assumptions.set(assumption.id, normalizeAssumption(assumption));
  }

  const appliedOverrides = [];
  for (const [id, value] of Object.entries(overrides)) {
    const existing = assumptions.get(id);
    if (!existing) {
      throw new Error(`Cannot override unknown assumption "${id}". Add it to data/assumptions.json first.`);
    }
    appliedOverrides.push({ id, from: existing.value, to: value });
    assumptions.set(id, {
      ...existing,
      value,
      evidence_type: 'session_override',
      canonical_state: 'confirmed',
      verification_state: 'not_applicable',
      confidence: 'session',
      source: `session override (was ${existing.value} from ${existing.evidence_type})`,
      overridden_from: existing.value,
    });
  }

  const scope = Object.fromEntries([...assumptions.values()].map((a) => [a.id, a.value]));

  return {
    project: raw.project,
    assumptions,
    scope,
    overrides: appliedOverrides,
    budget: raw.budget,
    house: raw.house,
    career: raw.career,
    finance: raw.finance,
    tasks: raw.tasks,
    questions: raw.questions,
    risks: raw.risks,
    contradictions: raw.contradictions,
    neighborhoods: raw.neighborhoods,
    community: raw.community,
    benefits: raw.benefits,
    readiness: raw.readiness,
    canonical: raw['canonical-records'],
    canonicalState: raw['canonical-state'],
    decisions: raw.decisions,
    moveSequence: raw['move-sequence'],
    roadtrip: raw.roadtrip,
    assets: raw.assets,
  };
}

/** Parses `--set id=value` pairs into an override map. */
export function parseOverrides(pairs = []) {
  const overrides = {};
  for (const pair of pairs) {
    const index = pair.indexOf('=');
    if (index === -1) throw new Error(`Malformed override "${pair}". Use id=value.`);
    const id = pair.slice(0, index).trim();
    const value = Number(pair.slice(index + 1).trim());
    if (Number.isNaN(value)) throw new Error(`Override "${pair}" is not a number.`);
    overrides[id] = value;
  }
  return overrides;
}
