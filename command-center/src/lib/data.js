import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = join(HERE, '..', '..', 'data');
export const OUTPUT_DIR = join(HERE, '..', '..', 'outputs');

/** Reads every .json in a directory into a map keyed by basename. */
function readDir(dir) {
  return Object.fromEntries(
    readdirSync(dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => [file.replace(/\.json$/, ''), JSON.parse(readFileSync(join(dir, file), 'utf8'))]),
  );
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
export function loadProject({ overrides = {}, programId = null } = {}) {
  const core = readDir(join(DATA_DIR, 'core'));
  const registry = core.programs;
  const active = programId
    ? registry.programs.find((p) => p.id === programId)
    : registry.programs.find((p) => p.status === 'active');
  if (!active) {
    throw new Error(programId ? `No program "${programId}" in core/programs.json.` : 'No active program in core/programs.json.');
  }
  const program = readDir(join(DATA_DIR, active.data_path));

  const assumptions = new Map();
  for (const assumption of program.assumptions.assumptions) {
    assumptions.set(assumption.id, normalizeAssumption(assumption));
  }

  const appliedOverrides = [];
  for (const [id, value] of Object.entries(overrides)) {
    const existing = assumptions.get(id);
    if (!existing) {
      throw new Error(`Cannot override unknown assumption "${id}". Add it to the program's assumptions.json first.`);
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
    // Platform
    programs: registry,
    program: program.program,
    rules: core.rules,
    actionStates: core['action-states'],
    canonicalState: core['canonical-state'],
    verification: core.verification,
    capabilities: core.capabilities,
    autonomy: core.autonomy,
    sensors: core.sensors,
    canonical: core['canonical-records'],
    decisions: core.decisions,
    // Life domains that outlive any one program
    career: core.career,
    finance: core.finance,
    house: core.house,
    assets: core.assets,
    benefits: core.benefits,
    community: core.community,
    neighborhoods: core.neighborhoods,
    // The active program's own state
    assumptions,
    scope,
    overrides: appliedOverrides,
    budget: program.budget,
    tasks: program.tasks,
    questions: program.questions,
    risks: program.risks,
    contradictions: program.contradictions,
    readiness: program.readiness,
    moveSequence: program['move-sequence'],
    roadtrip: program.roadtrip,
    recommendations: program.recommendations,
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
