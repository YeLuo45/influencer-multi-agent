import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBudgetBreaker,
  buildAbDecisionAction,
  buildChannelAdapterV1Plan,
  buildPersistentAuditAppend,
  buildReleaseLocalPlan,
  buildReplySendPlan,
  buildSseTickPlan,
  type ReplyQueueItem,
  type TokenLedgerSummary,
} from '../src/roadmap.js';

const now = '2026-06-24T00:00:00.000Z';

const reply: ReplyQueueItem = {
  id: 'reply-x-p1-1',
  platform: 'x',
  postId: 'p1',
  comment: 'source?',
  draft: 'Thanks — source is linked here.',
  priority: 10,
  status: 'queued',
  createdAt: now,
};

void test('buildReplySendPlan only allows sandbox reply before real send', () => {
  const plan = buildReplySendPlan([reply], { sandbox: true, now });
  assert.equal(plan.readyForRealReply, false);
  assert.equal(plan.items[0]!.status, 'queued');
  assert.deepEqual(plan.steps.map((s) => s.kind), ['sandbox-reply', 'verify', 'cleanup']);
});

void test('applyBudgetBreaker degrades provider when daily or monthly budget is exceeded', () => {
  const summary: TokenLedgerSummary = {
    totalCalls: 3,
    totalTokens: 900,
    totalCostUsd: 12,
    byModel: { 'openai/gpt': { calls: 3, tokens: 900, costUsd: 12 } },
    byDay: { '2026-06-24': { calls: 3, tokens: 900, costUsd: 12 } },
  };
  const decision = applyBudgetBreaker(summary, { day: '2026-06-24', dailyBudgetUsd: 10, monthlyBudgetUsd: 100 });
  assert.equal(decision.action, 'degrade');
  assert.equal(decision.provider, 'mock');
  assert.match(decision.reason, /daily budget/);
});

void test('buildAbDecisionAction maps confidence to collect-more or apply-winner', () => {
  assert.deepEqual(buildAbDecisionAction({ winner: null, confidence: 0.5, uplift: 0.1, reason: 'tie' }), {
    action: 'collect-more',
    note: 'A/B needs more samples or clearer separation',
  });
  assert.deepEqual(buildAbDecisionAction({ winner: 'A', confidence: 0.95, uplift: 1.2, reason: 'winner' }), {
    action: 'apply-winner',
    winner: 'A',
    note: 'Winner A selected with 95% confidence',
  });
});

void test('buildChannelAdapterV1Plan requires auth probe and cleanup for x and reddit', () => {
  const plan = buildChannelAdapterV1Plan(['x', 'reddit']);
  assert.equal(plan.ready, false);
  assert.deepEqual(plan.platforms, ['x', 'reddit']);
  assert.ok(plan.steps.some((s) => s.kind === 'auth-probe' && s.platform === 'x'));
  assert.ok(plan.steps.some((s) => s.kind === 'delete-cleanup' && s.platform === 'reddit'));
});

void test('buildPersistentAuditAppend creates jsonl path and serializable line', () => {
  const append = buildPersistentAuditAppend({ actor: 'web', kind: 'reply-send', at: now, ok: true });
  assert.equal(append.path, 'audit.jsonl');
  assert.match(append.line, /"reply-send"/);
  assert.doesNotThrow(() => JSON.parse(append.line));
});

void test('buildReleaseLocalPlan is non-recursive and covers production gates', () => {
  const plan = buildReleaseLocalPlan();
  assert.equal(plan.scriptName, 'release:local');
  assert.ok(plan.commands.includes('npm run bootstrap'));
  assert.ok(plan.commands.includes('npm run queue:work'));
  assert.ok(plan.commands.includes('npm run verify:readme'));
  assert.equal(plan.recursiveVerifyReadme, false);
});

void test('buildSseTickPlan emits interval ticks with stable change hash', () => {
  const plan = buildSseTickPlan({ intervalMs: 100, snapshot: { contents: 1, queue: 2, metrics: 3 } });
  assert.equal(plan.intervalMs, 250);
  assert.equal(plan.events[0]!.event, 'snapshot');
  assert.match(plan.changeHash, /^sse-/);
});
