import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  appendAuditJsonl,
  appendTokenLedgerJsonl,
  applyAbWinnerDecision,
  applyVariantWeightsToIdeas,
  auditFromAction,
  buildProductionConsoleSnapshot,
  buildReleaseActionPlan,
  buildReleaseLocalJsonReport,
  buildReplyQueueState,
  createCredentialProbe,
  createPlatformAdapters,
  createStubChannelAdapter,
  executeReplyQueue,
  parseTokenLedgerJsonl,
  planLlmProviderWithBudget,
  runChannelAdapterSafetyChain,
  summarizeAuditTrail,
  workReplyQueue,
} from '../src/production-automation.js';
import type { ReplyQueueItem, TokenLedgerSummary, TokenUsageEntry } from '../src/roadmap.js';
import type { Idea } from '../src/types.js';

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

void test('appendAuditJsonl appends serializable production audit rows and summarizes full chain', () => {
  const result = executeReplyQueue([reply], { sandbox: false, now });
  const events = [auditFromAction({ actor: 'cli', kind: 'run', action: 'start', at: now }), ...result.audit, auditFromAction({ actor: 'release', kind: 'release', action: 'gate', ok: false, at: '2026-06-24T01:01:00.000Z' })];
  const jsonl = appendAuditJsonl('', events);
  const rows = jsonl.trim().split('\n').map((line) => JSON.parse(line) as { kind: string; ok: boolean });
  const summary = summarizeAuditTrail(events);
  assert.equal(rows.length, 3);
  assert.equal(summary.byKind.reply, 1);
  assert.equal(summary.failures, 1);
  assert.equal(summary.latestAt, '2026-06-24T01:01:00.000Z');
});

void test('token ledger jsonl round-trips entries that drive budget decisions', () => {
  const entries: TokenUsageEntry[] = [
    { provider: 'live', model: 'gpt', promptTokens: 10, completionTokens: 20, totalTokens: 30, costUsd: 0.5, at: now },
  ];
  const jsonl = appendTokenLedgerJsonl('', entries);
  const parsed = parseTokenLedgerJsonl(jsonl);
  assert.deepEqual(parsed, entries);
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

void test('applyAbWinnerDecision promotes winner weights and applies them to future ideas', () => {
  const collect = applyAbWinnerDecision({ winner: null, confidence: 0.2, uplift: 0, reason: 'tie' }, { A: 1 });
  assert.equal(collect.action, 'collect-more');
  assert.deepEqual(collect.weights, { A: 1 });

  const applied = applyAbWinnerDecision({ winner: 'B', confidence: 0.93, uplift: 0.4, reason: 'winner' }, { A: 1, B: 1 });
  const ideas: Idea[] = [
    { id: 'i-a', angle: 'A', hook: 'a', targetPlatform: ['x'], score: 0.8, variantTag: 'A' },
    { id: 'i-b', angle: 'B', hook: 'b', targetPlatform: ['x'], score: 0.7, variantTag: 'B' },
  ];
  const ranked = applyVariantWeightsToIdeas(ideas, applied.weights);
  assert.equal(applied.weights.B, 1.4);
  assert.equal(ranked[0]!.id, 'i-b');
});

void test('credential probes and platform adapters cover all six production platforms', () => {
  const env = { IMA_X_TOKEN: 'x', IMA_REDDIT_TOKEN: 'r', IMA_YOUTUBE_TOKEN: 'y', IMA_BILIBILI_TOKEN: 'b', IMA_WEIBO_TOKEN: 'w', IMA_XHS_TOKEN: 'xhs' };
  assert.deepEqual(createCredentialProbe('youtube', env), { ok: true, envKey: 'IMA_YOUTUBE_TOKEN', detail: 'credential present' });
  const adapters = createPlatformAdapters(['x', 'reddit', 'youtube', 'bilibili', 'weibo', 'xiaohongshu'], env);
  assert.equal(adapters.length, 6);
  assert.equal(adapters.every((adapter) => adapter.authProbe().ok), true);
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

void test('reply queue state and work operations mirror durable publish queue semantics', () => {
  const low = { ...reply, id: 'reply-x-p1-2', priority: 1 };
  const state = buildReplyQueueState([low, reply]);
  assert.equal(state.total, 2);
  assert.equal(state.next?.id, reply.id);
  const worked = workReplyQueue([low, reply], { limit: 1, sandbox: true, now });
  assert.equal(worked.items.find((item) => item.id === reply.id)?.status, 'skipped');
  assert.equal(worked.items.find((item) => item.id === low.id)?.status, 'queued');
});

void test('buildReleaseLocalJsonReport returns machine-readable evidence and action plan', () => {
  const report = buildReleaseLocalJsonReport([
    { name: 'check', ok: true, durationMs: 10, summary: 'tsc ok' },
    { name: 'coverage', ok: false, durationMs: 20, summary: 'branch low', hint: 'add edge tests' },
  ]);
  const action = buildReleaseActionPlan(report);
  assert.equal(report.ok, false);
  assert.deepEqual(report.failed, ['coverage']);
  assert.equal(action.canDeploy, false);
  assert.match(action.hint, /coverage/);
});

void test('buildProductionConsoleSnapshot exposes all production controls for the web home surface', () => {
  const replies = executeReplyQueue([reply], { sandbox: true, now });
  const budget = planLlmProviderWithBudget({ totalCalls: 1, totalTokens: 30, totalCostUsd: 0.5, byModel: {}, byDay: {} }, { day: '2026-06-24', dailyBudgetUsd: 1, monthlyBudgetUsd: 2, configuredProvider: 'live' });
  const ab = applyAbWinnerDecision({ winner: 'A', confidence: 0.9, uplift: 0.2, reason: 'winner' });
  const channel = runChannelAdapterSafetyChain(createStubChannelAdapter('x', { credential: 'token' }), 'hello', now);
  const release = buildReleaseLocalJsonReport([{ name: 'check', ok: true, durationMs: 1, summary: 'ok' }]);
  const audit = summarizeAuditTrail([...replies.audit, ...channel.audit]);
  const snapshot = buildProductionConsoleSnapshot({ replies, budget, ab, channel, release, audit, tokenLedger: { totalCalls: 1, totalCostUsd: 0.5 }, replyQueue: buildReplyQueueState([reply]) });
  assert.deepEqual(snapshot.replySafety, { mode: 'sandbox', sent: 1, readyForRealReply: false });
  assert.deepEqual(snapshot.release, { ok: true, failed: [], action: { canDeploy: true, command: 'git push origin master', hint: 'all gates passed' } });
  assert.deepEqual(snapshot.tokenLedger, { totalCalls: 1, totalCostUsd: 0.5 });
  assert.deepEqual(snapshot.audit, audit);
});
