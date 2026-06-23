import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { EngagementMetric, PlatformId } from '../src/types.js';
import {
  buildReplyQueue,
  recordTokenUsage,
  summarizeTokenLedger,
  evaluateAbSignificance,
  buildChannelSandboxPlan,
  buildE2EHarnessPlan,
  planRealtimeSse,
  buildOperationAuditPanel,
} from '../src/roadmap.js';

const now = '2026-06-23T00:00:00.000Z';

function metric(overrides: Partial<EngagementMetric> = {}): EngagementMetric {
  return {
    platform: 'x',
    postId: 'p-1',
    likes: 10,
    comments: 2,
    shares: 1,
    views: 100,
    fetchedAt: now,
    ...overrides,
  };
}

void test('buildReplyQueue creates prioritized reply drafts from comment text', () => {
  const queue = buildReplyQueue([
    metric({ postId: 'p-1', comments: 2, commentTexts: ['Great point!', 'Can you share source?'] }),
    metric({ postId: 'p-2', comments: 0, commentTexts: [] }),
  ], { now });

  assert.equal(queue.length, 2);
  assert.equal(queue[0]!.postId, 'p-1');
  assert.equal(queue[0]!.status, 'queued');
  assert.match(queue[0]!.draft, /source/i);
  assert.ok(queue.some((item) => /Thanks/i.test(item.draft)));
});

void test('token ledger summarizes calls, tokens, and cost by provider/model/day', () => {
  const entries = [
    recordTokenUsage({ provider: 'openai', model: 'gpt-4o-mini', promptTokens: 100, completionTokens: 50, costUsd: 0.01, at: now }),
    recordTokenUsage({ provider: 'openai', model: 'gpt-4o-mini', promptTokens: 20, completionTokens: 30, costUsd: 0.02, at: now }),
  ];
  const summary = summarizeTokenLedger(entries);

  assert.equal(summary.totalCalls, 2);
  assert.equal(summary.totalTokens, 200);
  assert.equal(summary.totalCostUsd, 0.03);
  assert.equal(summary.byModel['openai/gpt-4o-mini']!.tokens, 200);
  assert.equal(summary.byDay['2026-06-23']!.costUsd, 0.03);
});

void test('evaluateAbSignificance requires sample size and reports confidence', () => {
  const weak = evaluateAbSignificance([
    { variant: 'A', postCount: 1, engagementCount: 1, likes: 1, comments: 0, shares: 0, views: 20, score: 2 },
    { variant: 'B', postCount: 1, engagementCount: 1, likes: 2, comments: 0, shares: 0, views: 20, score: 3 },
  ], { minSampleSize: 3 });
  assert.equal(weak.winner, null);
  assert.equal(weak.reason, 'insufficient_sample');

  const strong = evaluateAbSignificance([
    { variant: 'A', postCount: 5, engagementCount: 5, likes: 60, comments: 20, shares: 10, views: 500, score: 165 },
    { variant: 'B', postCount: 5, engagementCount: 5, likes: 10, comments: 2, shares: 1, views: 500, score: 43 },
  ], { minSampleSize: 3, confidenceThreshold: 0.8 });
  assert.equal(strong.winner, 'A');
  assert.ok(strong.confidence >= 0.8);
});

void test('channel sandbox plan enforces safe test chain before real publish', () => {
  const plan = buildChannelSandboxPlan(['x', 'reddit']);
  assert.equal(plan.readyForRealPublish, false);
  assert.deepEqual(plan.steps.map((s) => s.kind), ['dry-run', 'channel-test', 'publish-test', 'verify', 'cleanup']);
  assert.equal(plan.steps.every((s) => s.sandbox), true);
});

void test('E2E harness plan exposes release-local commands and required gates', () => {
  const plan = buildE2EHarnessPlan({ includeReadme: true });
  assert.deepEqual(plan.gates, ['bootstrap', 'queue-work', 'feedback', 'ab-report', 'verify-readme']);
  assert.ok(plan.commands.some((cmd) => cmd.includes('npm run bootstrap')));
  assert.ok(plan.commands.some((cmd) => cmd.includes('npm run verify:readme')));
});

void test('planRealtimeSse enables continuous snapshots with bounded interval', () => {
  assert.deepEqual(planRealtimeSse({ intervalMs: 50 }), { mode: 'continuous', intervalMs: 250, replayLast: true });
  assert.deepEqual(planRealtimeSse({ intervalMs: 2_000, replayLast: false }), { mode: 'continuous', intervalMs: 2_000, replayLast: false });
});

void test('buildOperationAuditPanel groups operations by actor and kind', () => {
  const panel = buildOperationAuditPanel([
    { actor: 'web', kind: 'queue-work', at: now, ok: true },
    { actor: 'web', kind: 'bulk-pause', at: now, ok: false },
    { actor: 'cli', kind: 'doctor', at: now, ok: true },
  ]);
  assert.equal(panel.total, 3);
  assert.equal(panel.failures, 1);
  assert.equal(panel.byActor.web, 2);
  assert.equal(panel.byKind['queue-work'], 1);
});
