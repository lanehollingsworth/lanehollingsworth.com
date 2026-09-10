import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { OUTPUT_DIR } from './data.js';
import { round2 } from './format.js';
import { computeBudget, computeCommonMove } from '../calculators/move-budget.js';
import { computeRoadTrip } from '../calculators/road-trip.js';
import { computeHouse } from '../calculators/house-rent-vs-sell.js';
import { buildTimeline } from '../planners/timeline.js';
import { validateCanonical, stateNodes, commitmentSafe } from './canonical.js';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const LOG_PATH = join(OUTPUT_DIR, 'verification-log.json');

/* ------------------------------------------------------------------ *
 * Lifecycle: implemented is not complete.
 * ------------------------------------------------------------------ */

export function canTransition(project, from, to) {
  const allowed = project.verification.work_item_lifecycle.transitions[from];
  if (!allowed) throw new Error(`Unknown work-item state "${from}".`);
  return allowed.includes(to);
}

export function advanceWorkItem(project, item, to) {
  if (!canTransition(project, item.state, to)) {
    throw new Error(
      `Illegal transition ${item.state} -> ${to} for ${item.id}. ` +
        'Completion is reachable only from verified: implemented is not complete.',
    );
  }
  return { ...item, state: to };
}

/* ------------------------------------------------------------------ *
 * Fingerprints: proof from last Tuesday says nothing about today's code.
 * ------------------------------------------------------------------ */

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

function patternToRegExp(pattern) {
  const source = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*\*\//g, '__GLOBSTAR_SLASH__')
    .replace(/\*\*/g, '__GLOBSTAR__')
    .replace(/\*/g, '[^/]*')
    .replace(/__GLOBSTAR_SLASH__/g, '(?:.*/)?')
    .replace(/__GLOBSTAR__/g, '.*');
  return new RegExp(`^${source}$`);
}

export function resolveFiles(patterns) {
  if (!patterns || patterns.length === 0) return [];
  const all = walk(ROOT)
    .map((file) => relative(ROOT, file).split(sep).join('/'))
    .filter((file) => !file.startsWith('outputs/') && !file.startsWith('node_modules/'));
  const matchers = patterns.map(patternToRegExp);
  return all.filter((file) => matchers.some((matcher) => matcher.test(file))).sort();
}

export function fingerprint(patterns) {
  const files = resolveFiles(patterns);
  const hash = createHash('sha256');
  for (const file of files) {
    hash.update(file);
    hash.update(readFileSync(join(ROOT, file)));
  }
  return { hash: hash.digest('hex').slice(0, 16), file_count: files.length, files };
}

/* ------------------------------------------------------------------ *
 * Runners. Each returns { passed, evidence[] } from a real execution.
 * ------------------------------------------------------------------ */

const evidence = (type, fields) => ({ type, ...fields });

export const RUNNERS = {
  tests() {
    const files = resolveFiles(['tests/*.test.js']);
    const result = spawnSync(process.execPath, ['--test', ...files], { cwd: ROOT, encoding: 'utf8' });
    const stdout = result.stdout ?? '';
    const pass = Number(stdout.match(/^# pass (\d+)$/m)?.[1] ?? 0);
    const fail = Number(stdout.match(/^# fail (\d+)$/m)?.[1] ?? 1);
    return {
      passed: result.status === 0 && fail === 0 && pass > 0,
      evidence: [
        evidence('command_execution', { command: `node --test (${files.length} files)`, exit_code: result.status, passed: result.status === 0 }),
        evidence('acceptance_test', { name: 'suite', passed_count: pass, failed_count: fail, passed: fail === 0 && pass > 0 }),
      ],
      summary: `${pass} test(s) passed, ${fail} failed`,
    };
  },

  known_answers(project, capability) {
    const trip = computeRoadTrip(project);
    const common = computeCommonMove(project);
    const sell = computeBudget(project, { branch: 'house_sell' });
    const rent = computeBudget(project, { branch: 'house_rent' });
    const house = computeHouse(project);
    const actuals = {
      'roadtrip.total': trip.total,
      'common.liquidity': common.totals.liquidity_required,
      'sell.liquidity': sell.totals.liquidity_required,
      'rent.liquidity': rent.totals.liquidity_required,
      'rent.reserve': rent.totals.by_type.reserve,
      'sell.net_cost': sell.totals.lane_net_cost,
      'house.break_even_rent': house.break_even_rent,
      'house.guardrail_rent': house.guardrail_rent,
    };
    const rows = capability.known_answers.map((answer) => {
      const actual = round2(actuals[answer.id]);
      return evidence('known_answer_test', {
        name: answer.id,
        label: answer.label,
        expected: answer.expected,
        actual,
        passed: actual === answer.expected,
      });
    });
    return {
      passed: rows.every((row) => row.passed),
      evidence: rows,
      summary: `${rows.filter((row) => row.passed).length}/${rows.length} locked figures reproduced`,
    };
  },

  timeline_scenarios(project, capability) {
    const rows = capability.scenarios.flatMap((scenario) => {
      const timeline = buildTimeline(project, { triggerDate: scenario.trigger, reportDate: scenario.report });
      return Object.entries(scenario.expect).map(([key, expected]) =>
        evidence('acceptance_test', {
          name: `${scenario.id}.${key}`,
          expected,
          actual: timeline[key],
          passed: timeline[key] === expected,
        }),
      );
    });

    // The dog-safety rule is part of the claim, not a nicety.
    const tight = buildTimeline(project, { triggerDate: '2027-01-15', reportDate: '2027-02-15' });
    const compresses = tight.remedies.some((remedy) => /shorten the (road trip|drive)|more hours/i.test(remedy));
    const refuses = tight.remedies.some((remedy) => remedy.includes('driving longer days'));
    rows.push(
      evidence('assertion', {
        name: 'no_unsafe_compression_remedy',
        expected: 'remedies never shorten the dog road trip',
        actual: refuses ? 'explicitly refuses longer driving days' : 'no compression remedy offered',
        passed: !compresses,
      }),
    );

    return {
      passed: rows.every((row) => row.passed),
      evidence: rows,
      summary: `${capability.scenarios.length} scenario(s) checked`,
    };
  },

  canonical_validation(project) {
    const violations = validateCanonical(project);
    const contested = stateNodes(project).filter((node) =>
      ['unresolved', 'conflicting_sources'].includes(node.canonical_state),
    );
    const contestedSafe = contested.every((node) => !commitmentSafe(project, node));
    return {
      passed: violations.length === 0 && contestedSafe,
      evidence: [
        evidence('schema_validation', {
          name: 'canonical_rules',
          expected: 0,
          actual: violations.length,
          passed: violations.length === 0,
        }),
        evidence('assertion', {
          name: 'contested_records_are_not_commitment_safe',
          expected: true,
          actual: contestedSafe,
          passed: contestedSafe,
        }),
      ],
      summary: `${stateNodes(project).length} records, ${violations.length} violations`,
    };
  },

  cli_execution(project, capability) {
    const rows = capability.commands.flatMap((entry) => {
      const result = spawnSync(process.execPath, ['src/cli.js', ...entry.argv], { cwd: ROOT, encoding: 'utf8' });
      const stdout = result.stdout ?? '';
      const items = [
        evidence('command_execution', {
          command: `cc ${entry.argv.join(' ')}`,
          exit_code: result.status,
          passed: result.status === 0,
        }),
      ];
      for (const marker of entry.expect_stdout) {
        items.push(
          evidence('output_assertion', {
            name: `${entry.argv[0]}: "${marker}"`,
            expected: marker,
            actual: stdout.includes(marker) ? marker : `absent (${stdout.length} bytes of stdout)`,
            passed: stdout.includes(marker),
          }),
        );
      }
      return items;
    });
    return {
      passed: rows.every((row) => row.passed !== false),
      evidence: rows,
      summary: `${capability.commands.length} command(s) executed for real`,
    };
  },
};

/* ------------------------------------------------------------------ *
 * Running and reporting.
 * ------------------------------------------------------------------ */

function achievedLevel(project, rows) {
  const weights = project.verification.evidence_types;
  return rows.reduce((max, row) => Math.max(max, weights[row.type] ?? 0), 0);
}

export function loadLog() {
  if (!existsSync(LOG_PATH)) return { runs: {} };
  return JSON.parse(readFileSync(LOG_PATH, 'utf8'));
}

function saveLog(log) {
  if (!existsSync(OUTPUT_DIR)) mkdirSync(OUTPUT_DIR, { recursive: true });
  writeFileSync(LOG_PATH, `${JSON.stringify(log, null, 2)}\n`);
}

/**
 * Runs every capability that has a runner, records the evidence, and reports
 * status. A capability without a runner reports NOT IMPLEMENTED rather than
 * borrowing someone else's proof.
 */
export function runVerification(project, { only = null, persist = true, runners = RUNNERS } = {}) {
  const runId = `run_${new Date().toISOString().replace(/[^0-9]/g, '').slice(0, 14)}`;
  const log = persist ? loadLog() : { runs: {} };
  const results = [];

  for (const capability of project.capabilities.capabilities) {
    if (only && !only.includes(capability.id)) continue;
    const contract = capability.verification;

    if (!contract.runner || !runners[contract.runner]) {
      results.push({
        id: capability.id,
        label: capability.label,
        claim: capability.claim,
        state: capability.state,
        status: capability.state === 'planned' ? 'NOT_IMPLEMENTED' : 'NOT_VERIFIED',
        required: contract.required,
        required_level: contract.required_level,
        achieved_level: 0,
        evidence: [],
        blocked_on: capability.blocked_on ?? [],
        summary: capability.state === 'planned' ? 'Not built. No evidence, and none borrowed.' : 'No runner registered.',
      });
      continue;
    }

    const print = fingerprint(capability.invalidated_by);
    const outcome = runners[contract.runner](project, capability);
    const level = achievedLevel(project, outcome.evidence);
    const meetsLevel = level >= contract.required_level;
    const status = !outcome.passed ? 'FAILED' : meetsLevel ? 'VERIFIED' : 'INSUFFICIENT_PROOF';
    const verifiedAt = new Date().toISOString();

    if (persist) {
      log.runs[capability.id] = {
        run_id: runId,
        verified_at: verifiedAt,
        status,
        achieved_level: level,
        required_level: contract.required_level,
        method: contract.method,
        source_fingerprint: print.hash,
        source_file_count: print.file_count,
        evidence: outcome.evidence,
        summary: outcome.summary,
      };
    }

    results.push({
      id: capability.id,
      label: capability.label,
      claim: capability.claim,
      state: capability.state,
      status,
      required: contract.required,
      required_level: contract.required_level,
      achieved_level: level,
      evidence: outcome.evidence,
      summary: outcome.summary,
      verified_at: verifiedAt,
      run_id: runId,
      source_fingerprint: print.hash,
    });
  }

  if (persist) saveLog(log);

  const failing = results.filter((row) => row.required && row.status !== 'VERIFIED');
  return { run_id: runId, results, failing, ok: failing.length === 0 };
}

/**
 * Status without re-running: what the log claims, checked against the current
 * source fingerprint. Changed sources make a past pass stale, not current.
 */
export function verificationStatus(project, { log = loadLog() } = {}) {
  return project.capabilities.capabilities.map((capability) => {
    const record = log.runs?.[capability.id];
    if (!record) {
      return {
        id: capability.id,
        label: capability.label,
        status: capability.state === 'planned' ? 'NOT_IMPLEMENTED' : 'NOT_VERIFIED',
        required: capability.verification.required,
        blocked_on: capability.blocked_on ?? [],
        detail: capability.state === 'planned' ? 'Not built.' : 'Never verified.',
      };
    }
    const print = fingerprint(capability.invalidated_by);
    const stale = record.source_fingerprint !== print.hash;
    return {
      id: capability.id,
      label: capability.label,
      status: stale ? 'VERIFICATION_STALE' : record.status,
      required: capability.verification.required,
      verified_at: record.verified_at,
      achieved_level: record.achieved_level,
      required_level: record.required_level,
      summary: record.summary,
      detail: stale
        ? `Sources changed since ${record.verified_at}. Past proof does not cover current code.`
        : record.summary,
    };
  });
}

/* ------------------------------------------------------------------ *
 * Recommendation support: coverage, never a fabricated percentage.
 * ------------------------------------------------------------------ */

export function evidenceCoverage(project, recommendation, { status = null } = {}) {
  const verification = status ?? verificationStatus(project);
  const nodes = stateNodes(project);

  const inputs = recommendation.material_inputs.map((input) => {
    if (input.kind === 'canonical_record') {
      const node = nodes.find((candidate) => candidate.id === input.id);
      const settled = node?.canonical_state === 'confirmed';
      return { ...input, evidence_class: settled ? 'verified' : 'unresolved', detail: node?.canonical_state ?? 'missing' };
    }
    if (input.kind === 'assumption') {
      const assumption = project.assumptions.get(input.id);
      const verified = assumption?.evidence_type === 'verified';
      return { ...input, evidence_class: verified ? 'verified' : 'planning_assumption', detail: assumption?.evidence_type ?? 'missing' };
    }
    if (input.kind === 'question') {
      const question = project.questions.questions.find((candidate) => candidate.id === input.id);
      const resolved = question?.status === 'resolved';
      return { ...input, evidence_class: resolved ? 'verified' : 'unresolved', detail: question?.status ?? 'missing' };
    }
    const row = verification.find((entry) => entry.id === input.capability);
    return { ...input, evidence_class: row?.status === 'VERIFIED' ? 'modeled' : 'unresolved', detail: row?.status ?? 'missing' };
  });

  // An input is covered when the model knows what it is standing on - including
  // knowing it is a placeholder. Only "unresolved" is a hole.
  const covered = inputs.filter((input) => input.evidence_class !== 'unresolved');
  const assumptionBacked = inputs.filter((input) => input.evidence_class === 'planning_assumption');
  const unresolved = inputs.filter((input) => input.evidence_class === 'unresolved');

  const supported = recommendation.support_when === 'all_inputs_covered'
    ? unresolved.length === 0
    : unresolved.length > 0;

  return {
    id: recommendation.id,
    statement: recommendation.statement,
    inputs,
    coverage: `${covered.length}/${inputs.length}`,
    covered_count: covered.length,
    material_count: inputs.length,
    assumption_backed: assumptionBacked,
    unresolved,
    supported,
    support_rule: recommendation.support_when,
    basis: recommendation.conclusion_rule,
    note: "Coverage of material inputs. Not a probability, and not the model's own certainty.",
  };
}
