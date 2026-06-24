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
