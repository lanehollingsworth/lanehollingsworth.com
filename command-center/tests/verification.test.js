/**
 * Verification tests: proof over confidence.
 *
 * These check the machinery that checks the machinery - that evidence must
 * match the claim, that a past pass goes stale when its sources change, and
 * that "implemented" can never reach "complete" on its own.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { loadProject } from '../src/lib/data.js';
import {
  advanceWorkItem,
  canTransition,
  evidenceCoverage,
  fingerprint,
  runVerification,
  verificationStatus,
  RUNNERS,
} from '../src/lib/verification.js';

const project = loadProject();

// The runners that spawn the whole test suite are excluded here on purpose:
// this file runs inside that suite.
const localRunners = {
  known_answers: RUNNERS.known_answers,
  timeline_scenarios: RUNNERS.timeline_scenarios,
  canonical_validation: RUNNERS.canonical_validation,
  cli_execution: RUNNERS.cli_execution,
};

test('implemented is not complete', () => {
  const item = { id: 'capability.example', state: 'in_progress' };

  assert.equal(canTransition(project, 'in_progress', 'complete'), false);
  assert.equal(canTransition(project, 'implemented', 'complete'), false);
  assert.equal(canTransition(project, 'verified', 'complete'), true);
  assert.throws(() => advanceWorkItem(project, item, 'complete'), /Illegal transition/);
  assert.throws(() => advanceWorkItem(project, item, 'verified'), /Illegal transition/);

  // The only legal road to complete runs through verification.
  const implemented = advanceWorkItem(project, item, 'implemented');
  const awaiting = advanceWorkItem(project, implemented, 'verification_required');
  const verified = advanceWorkItem(project, awaiting, 'verified');
  assert.equal(advanceWorkItem(project, verified, 'complete').state, 'complete');

  // A failure goes back to work, never sideways into verified.
  const failed = advanceWorkItem(project, awaiting, 'verification_failed');
  assert.throws(() => advanceWorkItem(project, failed, 'verified'), /Illegal transition/);
  assert.equal(advanceWorkItem(project, failed, 'in_progress').state, 'in_progress');

  // Even completed work can go stale when its sources change.
  assert.equal(canTransition(project, 'complete', 'verification_stale'), true);
});

test('the real calculators produce real evidence, not adjectives', () => {
  const report = runVerification(project, {
    only: ['calc.move_budget', 'engine.timeline', 'model.canonical_state'],
    persist: false,
    runners: localRunners,
  });

  assert.equal(report.ok, true);
  for (const row of report.results) {
    assert.equal(row.status, 'VERIFIED');
    assert.ok(row.evidence.length > 0, `${row.id} reported VERIFIED with no evidence`);
    assert.ok(row.achieved_level >= row.required_level);
  }

  // Evidence carries expected-vs-actual, so a reader can check the claim.
  const budget = report.results.find((row) => row.id === 'calc.move_budget');
  const roadTrip = budget.evidence.find((item) => item.name === 'roadtrip.total');
  assert.equal(roadTrip.expected, 2569.17);
  assert.equal(roadTrip.actual, 2569.17);
  assert.equal(roadTrip.type, 'known_answer_test');

  const timeline = report.results.find((row) => row.id === 'engine.timeline');
  assert.ok(timeline.evidence.some((item) => item.name === 'no_unsafe_compression_remedy' && item.passed));
});

test('a CLI claim is proven by running the CLI, not by testing a function', () => {
  const capability = {
    id: 'cli.sample',
    label: 'CLI sample',
    claim: 'cli_works',
    state: 'implemented',
    verification: { required: true, required_level: 3, method: 'real_command_execution', runner: 'cli_execution' },
    invalidated_by: ['src/cli.js'],
    commands: [
      { argv: ['validate'], expect_stdout: ['No violations'] },
      { argv: ['why', 'vehicle.tundra.disposition'], expect_stdout: ['drive_to_california'] },
    ],
  };
  const synthetic = { ...project, capabilities: { capabilities: [capability] } };
  const report = runVerification(synthetic, { persist: false, runners: localRunners });

  const row = report.results[0];
  assert.equal(row.status, 'VERIFIED');
  assert.equal(row.achieved_level, 3, 'real execution is level 3, above any unit test');
  const execution = row.evidence.find((item) => item.type === 'command_execution');
  assert.equal(execution.exit_code, 0);
  assert.ok(row.evidence.some((item) => item.type === 'output_assertion' && item.passed));
});

test('evidence below the required level leaves a capability unverified', () => {
  const capability = {
    id: 'integration.sample',
    label: 'Sample integration',
    claim: 'integration_works',
    state: 'implemented',
    verification: { required: true, required_level: 4, method: 'real_request', runner: 'mock_only' },
    invalidated_by: [],
  };
  const synthetic = { ...project, capabilities: { capabilities: [capability] } };
  const report = runVerification(synthetic, {
    persist: false,
    runners: {
      // A parser unit test against a fixture. Passes, proves the wrong thing.
      mock_only: () => ({
        passed: true,
        evidence: [{ type: 'unit_test', name: 'parses_fixture', passed: true }],
        summary: 'fixture parsed',
      }),
    },
  });

  assert.equal(report.results[0].status, 'INSUFFICIENT_PROOF');
  assert.equal(report.results[0].achieved_level, 2);
  assert.equal(report.ok, false, 'a required capability without adequate proof fails the run');
});

test('a required capability that fails is reported as failed, and fails the run', () => {
  const capability = {
    id: 'calc.sample',
    label: 'Sample calculation',
    claim: 'calculation_works',
    state: 'implemented',
    verification: { required: true, required_level: 2, method: 'known_answer_test', runner: 'broken' },
    invalidated_by: [],
  };
  const synthetic = { ...project, capabilities: { capabilities: [capability] } };
  const report = runVerification(synthetic, {
    persist: false,
    runners: {
      broken: () => ({
        passed: false,
        evidence: [{ type: 'known_answer_test', name: 'total', expected: 100, actual: 99, passed: false }],
        summary: '0/1 reproduced',
      }),
    },
  });

  assert.equal(report.results[0].status, 'FAILED');
  assert.equal(report.ok, false);
  assert.deepEqual(report.failing.map((row) => row.id), ['calc.sample']);
});

test('unbuilt capabilities report NOT IMPLEMENTED and borrow nobody else\'s proof', () => {
  const report = runVerification(project, {
    only: ['integration.sheets.read', 'integration.sheets.write', 'automation.daily_brief'],
    persist: false,
    runners: localRunners,
  });

  for (const row of report.results) {
    assert.equal(row.status, 'NOT_IMPLEMENTED');
    assert.deepEqual(row.evidence, []);
    assert.equal(row.achieved_level, 0);
    assert.ok(row.blocked_on.length > 0, `${row.id} should say what it is waiting on`);
  }

  // The Sheets read claim cannot be satisfied by deterministic tests.
  const sheets = project.capabilities.capabilities.find((c) => c.id === 'integration.sheets.read');
  assert.equal(sheets.verification.required_level, 4);
  assert.ok(sheets.verification.expected.some((item) => item.includes('write_count equals 0')));
});

test('changed sources make a past pass stale rather than current', () => {
  const stable = fingerprint(['data/core/rules.json']);
  assert.equal(stable.hash, fingerprint(['data/core/rules.json']).hash, 'fingerprints are deterministic');
  assert.notEqual(stable.hash, fingerprint(['data/core/programs.json']).hash, 'different sources, different fingerprint');
  assert.ok(fingerprint(['src/calculators/*.js']).file_count >= 4, 'globs resolve to real files');

  const log = {
    runs: {
      'calc.move_budget': {
        verified_at: '2026-09-03T12:00:00.000Z',
        status: 'VERIFIED',
        achieved_level: 2,
        required_level: 2,
        source_fingerprint: 'stale-fingerprint',
        summary: '8/8 locked figures reproduced',
      },
    },
  };
  const rows = verificationStatus(project, { log });
  const budget = rows.find((row) => row.id === 'calc.move_budget');
  assert.equal(budget.status, 'VERIFICATION_STALE');
  assert.match(budget.detail, /Past proof does not cover current code/);

  // Capabilities with no record at all are never implicitly fine.
  const never = rows.find((row) => row.id === 'cli.commands');
  assert.equal(never.status, 'NOT_VERIFIED');
});

test('recommendation support is evidence coverage, not a confidence number', () => {
  const recommendation = project.recommendations.recommendations.find((r) => r.id === 'rec.delay_ca_lease');
  const support = evidenceCoverage(project, recommendation);

  assert.equal(support.material_count, 4);
  assert.equal(support.coverage, '2/4');
  assert.deepEqual(
    support.unresolved.map((input) => input.id).sort(),
    ['career.cherie_role.title', 'q.relocation_support'],
  );
  assert.equal(support.assumption_backed.length, 1, 'the CA rent target is flagged as resting on an assumption');
  assert.equal(support.supported, true, 'a deferral is strengthened by missing evidence');

  // The computed input is only "modeled" because its calculator is verified.
  const computed = support.inputs.find((input) => input.kind === 'computed');
  assert.equal(computed.evidence_class, 'modeled');

  // No percentage anywhere.
  assert.ok(!JSON.stringify(support).includes('%'));
});

test('every capability declares a claim whose minimum proof the platform knows', () => {
  const claims = new Set(project.verification.claim_to_minimum_proof.map((row) => row.claim));
  for (const capability of project.capabilities.capabilities) {
    assert.ok(claims.has(capability.claim), `${capability.id} claims "${capability.claim}", which has no proof standard`);
    const minimum = project.verification.claim_to_minimum_proof.find((row) => row.claim === capability.claim);
    assert.ok(
      capability.verification.required_level >= minimum.minimum_level,
      `${capability.id} requires less proof than its claim demands`,
    );
  }
});
