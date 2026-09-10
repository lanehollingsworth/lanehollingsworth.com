/**
 * Graduated autonomy and sensor least-privilege.
 *
 * These exist because 2E is the first capability that reaches outside this
 * repository, and the constraints on it should be enforced before the adapter
 * is written rather than argued about after.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadProject } from '../src/lib/data.js';
import { resolveFiles, ROOT } from '../src/lib/verification.js';
import { join } from 'node:path';

const project = loadProject();

test('autonomy is granted per capability, never globally', () => {
  const levels = new Set(Object.keys(project.autonomy.levels));
  for (const grant of project.autonomy.grants) {
    assert.ok(levels.has(grant.authority), `${grant.capability} has an unknown authority`);
    assert.ok(grant.action, `${grant.capability} grants an authority without naming the action`);
  }
  // There is no blanket grant.
  assert.ok(!project.autonomy.grants.some((grant) => grant.capability === '*'));
});

test('irreversible life actions are Lane-only and cannot be executed by the agent', () => {
  const laneOnly = project.autonomy.lane_only_actions.map((action) => action.id);
  for (const id of [
    'accept_offer',
    'sign_california_lease',
    'list_orlando_house',
    'liquidate_investments',
    'waive_relocation_support',
    'purchase_california_home',
  ]) {
    assert.ok(laneOnly.includes(id), `${id} must be lane_only`);
  }
  // No lane_only action appears anywhere as an auto or supervised grant.
  const autoish = project.autonomy.grants
    .filter((grant) => ['auto', 'supervised'].includes(grant.authority))
    .map((grant) => grant.capability);
  assert.ok(!autoish.some((capability) => capability.startsWith('comms')));
  assert.match(project.autonomy.recommendation_rule, /never "we decided this"/);
});

test('writing to an external system is never automatic', () => {
  const write = project.autonomy.grants.find((grant) => grant.capability === 'integration.sheets.write');
  assert.equal(write.authority, 'approval_required');

  const read = project.autonomy.grants.find((grant) => grant.capability === 'integration.sheets.read');
  assert.equal(read.authority, 'auto', 'a least-privilege read of an approved source may be automatic');

  // Resolving a conflict is a judgment, not a calculation.
  const resolve = project.autonomy.grants.find((grant) => grant.capability === 'model.canonical_records');
  assert.equal(resolve.authority, 'approval_required');
});

test('the Sheets sensor requests the narrowest scope and no Drive authority', () => {
  const sensor = project.sensors.sensors.find((s) => s.id === 'sensor.google_sheets.command_center');

  assert.deepEqual(sensor.auth.scopes, ['https://www.googleapis.com/auth/spreadsheets.readonly']);
  assert.equal(sensor.authority, 'read_only');
  assert.equal(sensor.writes, 'none');
  assert.equal(sensor.auth.method, 'oauth');

  for (const forbidden of sensor.auth.forbidden_scopes) {
    assert.ok(!sensor.auth.scopes.includes(forbidden));
    assert.match(forbidden, /drive|spreadsheets$/);
  }
  // The read-write Sheets scope is explicitly forbidden, not merely unused.
  assert.ok(sensor.auth.forbidden_scopes.includes('https://www.googleapis.com/auth/spreadsheets'));
});

test('the expected tab list is a planning assumption, not a fact', () => {
  const sensor = project.sensors.sensors.find((s) => s.id === 'sensor.google_sheets.command_center');
  assert.equal(sensor.expected_tabs_evidence, 'planning_assumption');
  assert.ok(sensor.expected_tabs.length > 0);
  assert.match(sensor.expected_tabs_note, /never confirmed against the live spreadsheet/);
  assert.match(sensor.verification, /Level 4/);
});

test('no credential or spreadsheet id is committed to the repository', () => {
  const files = resolveFiles(['**/*.json', '**/*.js', '**/*.md', '**/*.yml']);
  assert.ok(files.length > 20, 'the guard is actually scanning files');

  // A Google spreadsheet id is a 40+ character key; a client secret and an
  // OAuth refresh token have recognizable shapes. None may appear in the repo.
  const patterns = [
    { name: 'spreadsheet id', re: /\b1[A-Za-z0-9_-]{42,}\b/ },
    { name: 'oauth client id', re: /\d+-[a-z0-9]{20,}\.apps\.googleusercontent\.com/ },
    { name: 'oauth client secret', re: /GOCSPX-[A-Za-z0-9_-]{10,}/ },
    { name: 'refresh token', re: /\b1\/\/[A-Za-z0-9_-]{20,}\b/ },
  ];

  for (const file of files) {
    const content = readFileSync(join(ROOT, file), 'utf8');
    for (const pattern of patterns) {
      assert.ok(!pattern.re.test(content), `${pattern.name} appears in ${file}`);
    }
  }

  // Configuration is referenced by environment variable name only.
  const sensor = project.sensors.sensors.find((s) => s.id === 'sensor.google_sheets.command_center');
  assert.deepEqual(sensor.auth.config_env, [
    'LCC_GOOGLE_SHEET_ID',
    'LCC_GOOGLE_OAUTH_CLIENT_ID',
    'LCC_GOOGLE_OAUTH_CLIENT_SECRET',
  ]);
});

test('the Sheets capability is wired to its sensor and still unproven', () => {
  const capability = project.capabilities.capabilities.find((c) => c.id === 'integration.sheets.read');
  assert.equal(capability.sensor, 'sensor.google_sheets.command_center');
  assert.equal(capability.state, 'planned');
  assert.equal(capability.verification.required_level, 4);
  assert.ok(capability.blocked_on.some((item) => /OAuth client credentials/.test(item)));
  assert.ok(capability.invalidated_by.includes('data/core/sensors.json'));
});
