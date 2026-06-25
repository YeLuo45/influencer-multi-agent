import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildApprovalQueue,
  buildCiAutoIngestPlan,
  buildCredentialRotationPlan,
  buildMultiRunAnalytics,
  buildPersistentReleaseOpsLedger,
  buildPlatformConnectorHardeningMatrix,
  buildProductionExecutionReadiness,
  buildProductionReplaySandbox,
  buildRealConnectorExecutionPlan,
  buildPersistentApprovalStore,
  buildCredentialHealthCenter,
  buildCiArtifactIngestExecution,
  buildReplayScenarioLibrary,
  buildReleaseOpsEventTimeline,
  buildSafeExecutePlan,
  buildWebModeEnhancementDirections,
  buildWebCommandPalette,
  buildApprovalDiffPreview,
  buildCredentialSetupWizard,
  filterReleaseOpsTimeline,
  buildScenarioReplayBuilder,
  buildWebNotificationCenter,
  buildOperatorSessionReplay,
  buildWebModeExperiencePack,
  buildWebOpsCompletionPack,
  type PlatformConnectorInput,
  type ProductionApprovalAction,
  type ProductionRunRecord,
} from '../src/production-ops.js';

const connectors: PlatformConnectorInput[] = [
  { platform: 'x', credentialPresent: true, healthOk: true, dryRunOk: true, realPostEnabled: false, retryableErrors: ['rate_limit'] },
  { platform: 'reddit', credentialPresent: false, healthOk: false, dryRunOk: true, realPostEnabled: false, retryableErrors: ['timeout'] },
  { platform: 'youtube', credentialPresent: true, healthOk: true, dryRunOk: true, realPostEnabled: true, retryableErrors: [] },
];

const actions: ProductionApprovalAction[] = [
  { id: 'post-x-1', kind: 'real-post', label: 'Post to X', risk: 'high', command: 'npm run cli publish x --real' },
  { id: 'mcp-forward-1', kind: 'mcp-forward', label: 'Forward proposal', risk: 'medium', command: 'python3 mcp_aisp.py update-proposal-status --status delivered' },
  { id: 'copy-runbook-1', kind: 'runbook-command', label: 'Copy runbook', risk: 'low', command: 'cat docs/runbook.md' },
];

const runs: ProductionRunRecord[] = [
  { id: 'r1', ok: true, durationMs: 1000, failedGates: [], platformErrors: { x: 0 }, at: '2026-06-24T00:00:00.000Z' },
  { id: 'r2', ok: false, durationMs: 3000, failedGates: ['coverage', 'build'], platformErrors: { reddit: 2 }, at: '2026-06-24T01:00:00.000Z' },
  { id: 'r3', ok: true, durationMs: 2000, failedGates: [], platformErrors: { x: 1 }, at: '2026-06-24T02:00:00.000Z' },
];

void test('buildPlatformConnectorHardeningMatrix classifies real platform readiness without posting', () => {
  const matrix = buildPlatformConnectorHardeningMatrix(connectors);
  assert.equal(matrix.ready, 1);
  assert.equal(matrix.blocked, 2);
  assert.equal(matrix.connectors[0]?.status, 'approval_required');
  assert.equal(matrix.connectors[1]?.status, 'missing_credential');
  assert.equal(matrix.connectors[2]?.status, 'ready');
  assert.match(matrix.connectors[1]?.nextStep ?? '', /configure IMA_REDDIT_TOKEN/);
});

void test('buildApprovalQueue orders risky actions and keeps execution gated', () => {
  const queue = buildApprovalQueue(actions);
  assert.deepEqual(queue.items.map((item) => item.id), ['post-x-1', 'mcp-forward-1', 'copy-runbook-1']);
  assert.equal(queue.items[0]?.status, 'pending_approval');
  assert.equal(queue.items[0]?.confirmationRequired, 'APPROVE post-x-1');
  assert.equal(queue.requiresOperator, true);
  assert.equal(queue.executableNow, false);
});

void test('buildPersistentReleaseOpsLedger emits append-only paths and compacted hot rows', () => {
  const ledger = buildPersistentReleaseOpsLedger(runs, { rootDir: '.ima/release-ops', keepLatest: 2 });
  assert.equal(ledger.rootDir, '.ima/release-ops');
  assert.deepEqual(ledger.paths, ['.ima/release-ops/runs.jsonl', '.ima/release-ops/compacted-summary.json', '.ima/release-ops/approvals.jsonl']);
  assert.deepEqual(ledger.hot.map((row) => row.id), ['r2', 'r3']);
  assert.equal(ledger.archive.totalRuns, 1);
});

void test('buildCiAutoIngestPlan makes GitHub Actions ingestion deterministic and non-mutating', () => {
  const plan = buildCiAutoIngestPlan({ provider: 'github-actions', branch: 'master', artifactName: 'release-evidence' });
  assert.equal(plan.mutatesRepo, false);
  assert.deepEqual(plan.commands, ['gh run list --branch master --limit 1 --json databaseId,conclusion,headSha', 'gh run download <run-id> -n release-evidence -D .ima/release-ops/ci']);
  assert.match(plan.expectedArtifactPath, /.ima\/release-ops\/ci/);
});

void test('buildCredentialRotationPlan detects expired, missing, and over-scoped secrets', () => {
  const plan = buildCredentialRotationPlan([
    { platform: 'x', envKey: 'IMA_X_TOKEN', present: true, expiresInDays: 3, scopes: ['post:write'] },
    { platform: 'reddit', envKey: 'IMA_REDDIT_TOKEN', present: false, expiresInDays: null, scopes: [] },
    { platform: 'youtube', envKey: 'IMA_YOUTUBE_TOKEN', present: true, expiresInDays: 30, scopes: ['post:write', 'admin:all'] },
  ]);
  assert.equal(plan.rotationRequired, true);
  assert.deepEqual(plan.items.map((item) => item.status), ['rotate_soon', 'missing', 'scope_review']);
  assert.equal(plan.items[0]?.masked, 'IMA_X_TOKEN=***');
});

void test('buildProductionReplaySandbox wires trend to approval without external side effects', () => {
  const replay = buildProductionReplaySandbox({ topic: 'AI trend', platforms: ['x', 'reddit'], budgetUsd: 1.5 });
  assert.equal(replay.sideEffects, false);
  assert.deepEqual(replay.steps.map((step) => step.kind), ['trend', 'draft', 'platform-payload', 'budget-check', 'approval', 'dry-run-publish']);
  assert.match(replay.copyCommand, /npm run cli dry-run/);
});

void test('buildMultiRunAnalytics summarizes success rate, failed gates, and platform errors', () => {
  const analytics = buildMultiRunAnalytics(runs);
  assert.equal(analytics.totalRuns, 3);
  assert.equal(analytics.successRate, 0.67);
  assert.deepEqual(analytics.topFailedGates, [{ name: 'build', count: 1 }, { name: 'coverage', count: 1 }]);
  assert.deepEqual(analytics.platformErrors, [{ platform: 'reddit', count: 2 }, { platform: 'x', count: 1 }]);
  assert.equal(analytics.meanDurationMs, 2000);
});

void test('buildProductionExecutionReadiness combines all seven next-iteration directions', () => {
  const readiness = buildProductionExecutionReadiness({ connectors, actions, runs, rootDir: '.ima/release-ops', topic: 'AI trend' });
  assert.equal(readiness.status, 'blocked');
  assert.equal(readiness.connectorMatrix.blocked, 2);
  assert.equal(readiness.approvalQueue.items.length, 3);
  assert.equal(readiness.ledger.hot.length, 3);
  assert.equal(readiness.ciIngest.mutatesRepo, false);
  assert.equal(readiness.credentialRotation.rotationRequired, true);
  assert.equal(readiness.replaySandbox.sideEffects, false);
  assert.equal(readiness.analytics.successRate, 0.67);
  assert.ok(readiness.nextActions.includes('Resolve blocked platform connectors'));
});

void test('buildRealConnectorExecutionPlan models prepare to rollback and stays dry-run without approval', () => {
  const plan = buildRealConnectorExecutionPlan({ platform: 'x', contentId: 'c1', approvalText: 'APPROVE wrong' });
  assert.equal(plan.mode, 'dry-run');
  assert.equal(plan.executable, false);
  assert.deepEqual(plan.steps.map((step) => step.kind), ['prepare', 'dryRun', 'approval', 'execute', 'verify', 'rollback']);
  assert.equal(plan.steps.find((step) => step.kind === 'execute')?.willExecute, false);
  const approved = buildRealConnectorExecutionPlan({ platform: 'x', contentId: 'c1', approvalText: 'EXECUTE x c1' });
  assert.equal(approved.mode, 'execute');
  assert.equal(approved.steps.find((step) => step.kind === 'execute')?.willExecute, true);
});

void test('buildPersistentApprovalStore turns approval items into append-only rows', () => {
  const queue = buildApprovalQueue(actions);
  const store = buildPersistentApprovalStore(queue, { rootDir: '.ima/release-ops', now: '2026-06-24T03:00:00.000Z' });
  assert.equal(store.path, '.ima/release-ops/approvals.jsonl');
  assert.equal(store.rows.length, 3);
  assert.deepEqual(store.rows.map((row) => row.status), ['pending', 'pending', 'approved']);
  assert.match(store.appendPreview, /post-x-1/);
});

void test('buildCredentialHealthCenter exposes masked health cards for the web', () => {
  const center = buildCredentialHealthCenter(buildCredentialRotationPlan([
    { platform: 'x', envKey: 'IMA_X_TOKEN', present: true, expiresInDays: 30, scopes: ['post:write'] },
    { platform: 'reddit', envKey: 'IMA_REDDIT_TOKEN', present: false, expiresInDays: null, scopes: [] },
  ]));
  assert.equal(center.ok, false);
  assert.deepEqual(center.cards.map((card) => [card.platform, card.visible, card.severity]), [['x', 'IMA_X_TOKEN=***', 'ok'], ['reddit', 'IMA_REDDIT_TOKEN=***', 'critical']]);
});

void test('buildCiArtifactIngestExecution parses artifact presence into evidence summary', () => {
  const ingest = buildCiArtifactIngestExecution({ runId: '42', conclusion: 'success', artifactPath: '.ima/release-ops/ci/evidence.json', artifactFound: true });
  assert.equal(ingest.ok, true);
  assert.equal(ingest.mutatesRepo, false);
  assert.match(ingest.summary, /run 42/);
  assert.deepEqual(ingest.gates, [{ name: 'github-actions/run-42', ok: true, summary: 'conclusion=success; artifact=found', command: 'gh run view 42' }]);
});

void test('buildReplayScenarioLibrary provides copy-ready web scenarios', () => {
  const library = buildReplayScenarioLibrary(['x', 'reddit']);
  assert.deepEqual(library.scenarios.map((scenario) => scenario.id), ['viral-trend', 'long-form-distribution', 'reply-loop', 'ab-budget-failure', 'platform-retry']);
  assert.equal(library.scenarios.every((scenario) => scenario.sideEffects === false), true);
  assert.match(library.scenarios[0]?.command ?? '', /dry-run/);
});

void test('buildReleaseOpsEventTimeline sorts mixed release events for one-screen web review', () => {
  const timeline = buildReleaseOpsEventTimeline([
    { at: '2026-06-24T03:00:00.000Z', kind: 'push', label: 'push ok', ok: true },
    { at: '2026-06-24T02:00:00.000Z', kind: 'approval', label: 'approval pending', ok: false },
  ]);
  assert.deepEqual(timeline.events.map((event) => event.kind), ['approval', 'push']);
  assert.equal(timeline.failures, 1);
  assert.match(timeline.copyMarkdown, /approval pending/);
});

void test('buildSafeExecutePlan only executes persisted approved actions with exact token', () => {
  const queue = buildApprovalQueue(actions);
  const store = buildPersistentApprovalStore(queue, { rootDir: '.ima/release-ops', now: '2026-06-24T03:00:00.000Z' });
  const dry = buildSafeExecutePlan(store.rows, { actionId: 'post-x-1', approvalToken: 'wrong' });
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.executable, false);
  const approved = buildSafeExecutePlan(store.rows, { actionId: 'copy-runbook-1', approvalToken: 'APPROVED copy-runbook-1' });
  assert.equal(approved.mode, 'execute');
  assert.equal(approved.executable, true);
  assert.match(approved.command, /cat docs\/runbook.md/);
});

void test('buildWebModeEnhancementDirections returns the next web-focused iteration set', () => {
  const directions = buildWebModeEnhancementDirections();
  assert.equal(directions[0]?.id, 'guided-command-palette');
  assert.ok(directions.some((direction) => direction.id === 'approval-diff-preview'));
  assert.ok(directions.every((direction) => direction.area === 'web-mode'));
});

void test('buildWebCommandPalette groups safe operator commands by intent', () => {
  const palette = buildWebCommandPalette(['check', 'test', 'deploy']);
  assert.equal(palette.primary.id, 'run-all-gates');
  assert.deepEqual(palette.commands.map((command) => command.id), ['run-all-gates', 'copy-safe-execute', 'open-credential-wizard']);
  assert.equal(palette.commands.every((command) => command.sideEffects === false), true);
});

void test('buildApprovalDiffPreview summarizes risk, command, payload and changed files', () => {
  const preview = buildApprovalDiffPreview({ actionId: 'post-x-1', command: 'npm run cli publish-cli --real x', payload: { platform: 'x', title: 'T' }, changedFiles: ['packages/core/src/production-ops.ts', 'docs/prd.v9.md'], risk: 'high' });
  assert.equal(preview.actionId, 'post-x-1');
  assert.equal(preview.risk, 'high');
  assert.deepEqual(preview.changedFileGroups.productCode, ['packages/core/src/production-ops.ts']);
  assert.match(preview.copyMarkdown, /npm run cli publish-cli/);
});

void test('buildCredentialSetupWizard gives ordered masked setup steps', () => {
  const wizard = buildCredentialSetupWizard(buildCredentialHealthCenter(buildCredentialRotationPlan([
    { platform: 'x', envKey: 'IMA_X_TOKEN', present: false, expiresInDays: null, scopes: [] },
  ])));
  assert.equal(wizard.steps[0]?.id, 'collect-token');
  assert.equal(wizard.steps.every((step) => step.displaysSecret === false), true);
  assert.match(wizard.copyGuide, /IMA_X_TOKEN=\*\*\*/);
});

void test('filterReleaseOpsTimeline filters and searches one-screen events', () => {
  const timeline = buildReleaseOpsEventTimeline([
    { at: '2026-06-24T01:00:00.000Z', kind: 'approval', label: 'approval pending', ok: false },
    { at: '2026-06-24T02:00:00.000Z', kind: 'ci', label: 'ci success', ok: true },
  ]);
  const filtered = filterReleaseOpsTimeline(timeline, { kind: 'approval', query: 'pending', onlyFailures: true });
  assert.deepEqual(filtered.events.map((event) => event.label), ['approval pending']);
  assert.equal(filtered.empty, false);
});

void test('buildScenarioReplayBuilder turns scenarios into editable web forms', () => {
  const builder = buildScenarioReplayBuilder(buildReplayScenarioLibrary(['x', 'reddit']));
  assert.equal(builder.forms.length, 5);
  assert.deepEqual(builder.forms[0]?.fields.map((field) => field.name), ['contentId', 'platforms', 'budgetUsd']);
  assert.equal(builder.forms.every((form) => form.submitMode === 'dry-run'), true);
});

void test('buildWebNotificationCenter prioritizes failures and pending approvals', () => {
  const center = buildWebNotificationCenter({
    credentialHealth: buildCredentialHealthCenter(buildCredentialRotationPlan([{ platform: 'x', envKey: 'IMA_X_TOKEN', present: false, expiresInDays: null, scopes: [] }])),
    approvalRows: buildPersistentApprovalStore(buildApprovalQueue(actions), { rootDir: '.ima/release-ops', now: '2026-06-24T03:00:00.000Z' }).rows,
    timeline: buildReleaseOpsEventTimeline([{ at: '2026-06-24T01:00:00.000Z', kind: 'ci', label: 'ci failed', ok: false }]),
  });
  assert.equal(center.unread, 3);
  assert.deepEqual(center.items.map((item) => item.kind), ['credential', 'approval', 'timeline']);
});

void test('buildOperatorSessionReplay converts web actions into copy-ready report', () => {
  const replay = buildOperatorSessionReplay([
    { at: '2026-06-24T01:00:00.000Z', action: 'open-production', target: 'web', result: 'ok' },
    { at: '2026-06-24T01:01:00.000Z', action: 'copy-runbook', target: 'approval', result: 'ok' },
  ]);
  assert.equal(replay.total, 2);
  assert.match(replay.copyMarkdown, /copy-runbook/);
  assert.equal(replay.replayCommand, 'npm run cli production');
});

void test('buildWebModeExperiencePack combines command palette, wizard, timeline and next directions', () => {
  const pack = buildWebModeExperiencePack({
    gates: ['check', 'test'],
    approvalQueue: buildApprovalQueue(actions),
    credentialHealth: buildCredentialHealthCenter(buildCredentialRotationPlan([{ platform: 'x', envKey: 'IMA_X_TOKEN', present: false, expiresInDays: null, scopes: [] }])),
    scenarios: buildReplayScenarioLibrary(['x']),
    timeline: buildReleaseOpsEventTimeline([{ at: '2026-06-24T01:00:00.000Z', kind: 'approval', label: 'approval pending', ok: false }]),
  });
  assert.equal(pack.mode, 'operator-workbench');
  assert.equal(pack.commandPalette.commands.length, 3);
  assert.equal(pack.notificationCenter.unread >= 2, true);
  assert.equal(pack.nextDirections[0]?.id, 'guided-command-palette');
});

void test('buildWebOpsCompletionPack aggregates all remaining unattended web ops directions', () => {
  const completion = buildWebOpsCompletionPack({
    proposalId: 'P-20260625-009',
    gates: ['check', 'test', 'coverage', 'build', 'verify:readme'],
    approvalQueue: buildApprovalQueue(actions),
    credentialHealth: buildCredentialHealthCenter(buildCredentialRotationPlan([{ platform: 'x', envKey: 'IMA_X_TOKEN', present: false, expiresInDays: null, scopes: [] }])),
    scenarios: buildReplayScenarioLibrary(['x', 'reddit']),
    timeline: buildReleaseOpsEventTimeline([{ at: '2026-06-24T01:00:00.000Z', kind: 'ci', label: 'ci ok', ok: true }]),
    sessionActions: [{ at: '2026-06-24T01:00:00.000Z', action: 'copy-safe-execute', target: 'approval', result: 'ok' }],
  });
  assert.equal(completion.proposalId, 'P-20260625-009');
  assert.equal(completion.webMode.mode, 'operator-workbench');
  assert.equal(completion.safeExecuteAction.confirmationRequired, 'EXECUTE P-20260625-009');
  assert.equal(completion.scenarioPersistence.path, '.ima/release-ops/scenarios.jsonl');
  assert.equal(completion.ciImport.commands[0], 'gh run list --branch master --limit 1 --json databaseId,conclusion,headSha');
  assert.equal(completion.deliveryClosure.statusPath.join(' -> '), 'in_test_acceptance -> accepted -> deployed -> delivered');
  assert.match(completion.operatorTimeline.copyMarkdown, /copy-safe-execute/);
});
