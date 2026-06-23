import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAuditJsonl,
  applyAbWinnerDecision,
  buildProductionConsoleSnapshot,
  buildReleaseLocalJsonReport,
  createStubChannelAdapter,
  executeReplyQueue,
  planLlmProviderWithBudget,
  runChannelAdapterSafetyChain,
} from '../src/production-automation.js';
import type { ReplyQueueItem, TokenLedgerSummary } from '../src/roadmap.js';

const now = '2026-06-24T01:00:00.000Z';

const reply: ReplyQueueItem = {
  id: 'reply-x-p1-1',
  platform: 'x',
  postId: 'p1',
  comment: 'source?',
  draft: 'Here is the source.',
  priority: 10,
  status: 'queued',
  createdAt: now,
};

void test('executeReplyQueue keeps sandbox replies off external platforms and audits each item', () => {
  const result = executeReplyQueue([reply], { sandbox: true, now });
  assert.equal(result.mode, 'sandbox');
  assert.equal(result.readyForRealReply, false);
  assert.equal(result.sent[0]!.status, 'skipped');
  assert.equal(result.audit[0]!.action, 'sandbox-reply');
  assert.match(result.audit[0]!.note ?? '', /no external platform call/);
});

void test('appendAuditJsonl appends serializable production audit rows', () => {
  const result = executeReplyQueue([reply], { sandbox: false, now });
  const jsonl = appendAuditJsonl('', result.audit);
  const rows = jsonl.trim().split('\n').map((line) => JSON.parse(line) as { kind: string; ok: boolean });
  assert.equal(rows.length, 1);
  assert.equal(rows[0]!.kind, 'reply');
  assert.equal(rows[0]!.ok, true);
});

void test('planLlmProviderWithBudget downgrades provider before exceeding production spend', () => {
  const summary: TokenLedgerSummary = {
    totalCalls: 4,
    totalTokens: 1000,
    totalCostUsd: 20,
    byModel: { 'live/gpt': { calls: 4, tokens: 1000, costUsd: 20 } },
    byDay: { '2026-06-24': { calls: 4, tokens: 1000, costUsd: 20 } },
  };
  const plan = planLlmProviderWithBudget(summary, { day: '2026-06-24', dailyBudgetUsd: 10, monthlyBudgetUsd: 100, configuredProvider: 'live', fallbackProvider: 'mock' });
  assert.equal(plan.provider, 'mock');
  assert.equal(plan.degraded, true);
  assert.equal(plan.audit.action, 'degrade-provider');
});

void test('applyAbWinnerDecision promotes winner weights or keeps collecting samples', () => {
  const collect = applyAbWinnerDecision({ winner: null, confidence: 0.2, uplift: 0, reason: 'tie' }, { A: 1 });
  assert.equal(collect.action, 'collect-more');
  assert.deepEqual(collect.weights, { A: 1 });

  const applied = applyAbWinnerDecision({ winner: 'B', confidence: 0.93, uplift: 0.4, reason: 'winner' }, { A: 1, B: 1 });
  assert.equal(applied.action, 'apply-winner');
  assert.equal(applied.weights.B, 1.4);
});

void test('runChannelAdapterSafetyChain requires auth probe before sandbox post verify cleanup', () => {
  const missing = runChannelAdapterSafetyChain(createStubChannelAdapter('x'), 'hello', now);
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.steps, ['auth-probe:false']);

  const ok = runChannelAdapterSafetyChain(createStubChannelAdapter('reddit', { credential: 'token' }), 'hello', now);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.steps, ['auth-probe:true', 'sandbox-post:true', 'verify:true', 'cleanup:true']);
  assert.equal(ok.audit.length, 4);
});

void test('buildReleaseLocalJsonReport returns machine-readable and markdown evidence', () => {
  const report = buildReleaseLocalJsonReport([
    { name: 'check', ok: true, durationMs: 10, summary: 'tsc ok' },
    { name: 'coverage', ok: false, durationMs: 20, summary: 'branch low', hint: 'add edge tests' },
  ]);
  assert.equal(report.ok, false);
  assert.deepEqual(report.failed, ['coverage']);
  assert.match(report.markdown, /release:local report/);
});

void test('buildProductionConsoleSnapshot exposes all production controls for the web home surface', () => {
  const replies = executeReplyQueue([reply], { sandbox: true, now });
  const budget = planLlmProviderWithBudget({ totalCalls: 0, totalTokens: 0, totalCostUsd: 0, byModel: {}, byDay: {} }, { day: '2026-06-24', dailyBudgetUsd: 1, monthlyBudgetUsd: 2, configuredProvider: 'live' });
  const ab = applyAbWinnerDecision({ winner: 'A', confidence: 0.9, uplift: 0.2, reason: 'winner' });
  const channel = runChannelAdapterSafetyChain(createStubChannelAdapter('x', { credential: 'token' }), 'hello', now);
  const release = buildReleaseLocalJsonReport([{ name: 'check', ok: true, durationMs: 1, summary: 'ok' }]);
  const snapshot = buildProductionConsoleSnapshot({ replies, budget, ab, channel, release });
  assert.deepEqual(snapshot.replySafety, { mode: 'sandbox', sent: 1, readyForRealReply: false });
  assert.deepEqual(snapshot.release, { ok: true, failed: [] });
  assert.equal(snapshot.auditCount, 7);
});
