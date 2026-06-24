import type { AbSignificanceResult, ReplyQueueItem, TokenLedgerSummary, TokenUsageEntry } from './roadmap.js';
import type { Idea, PlatformId } from './types.js';

export type ProductionAuditKind = 'reply' | 'publish' | 'budget' | 'ab' | 'channel' | 'release' | 'run' | 'llm';

export interface ProductionAuditEvent {
  actor: string;
  kind: ProductionAuditKind;
  action: string;
  at: string;
  ok: boolean;
  target?: string;
  note?: string;
}

export interface ReplyExecutionResult {
  mode: 'sandbox' | 'real';
  sent: ReplyQueueItem[];
  skipped: ReplyQueueItem[];
  readyForRealReply: boolean;
  audit: ProductionAuditEvent[];
}

export function executeReplyQueue(
  items: ReplyQueueItem[],
  opts: { sandbox?: boolean; now?: string; actor?: string } = {},
): ReplyExecutionResult {
  const sandbox = opts.sandbox ?? true;
  const now = opts.now ?? new Date().toISOString();
  const actor = opts.actor ?? 'reply-executor';
  const sent = items.filter((item) => item.status === 'queued').map((item) => ({ ...item, status: sandbox ? 'skipped' as const : 'sent' as const }));
  const skipped = items.filter((item) => item.status !== 'queued').map((item) => ({ ...item }));
  const audit = sent.map((item) => ({
    actor,
    kind: 'reply' as const,
    action: sandbox ? 'sandbox-reply' : 'real-reply',
    at: now,
    ok: true,
    target: item.id,
    note: sandbox ? 'sandbox only; no external platform call' : `sent to ${item.platform}`,
  }));
  return { mode: sandbox ? 'sandbox' : 'real', sent, skipped, readyForRealReply: !sandbox && sent.length > 0, audit };
}

export function appendAuditJsonl(existing: string, events: ProductionAuditEvent[]): string {
  const prefix = existing.trim().length > 0 ? `${existing.trim()}\n` : '';
  return `${prefix}${events.map((event) => JSON.stringify(event)).join('\n')}${events.length > 0 ? '\n' : ''}`;
}

export function auditFromAction(input: { actor: string; kind: ProductionAuditKind; action: string; ok?: boolean; target?: string; note?: string; at?: string }): ProductionAuditEvent {
  return { actor: input.actor, kind: input.kind, action: input.action, at: input.at ?? new Date().toISOString(), ok: input.ok ?? true, ...(input.target ? { target: input.target } : {}), ...(input.note ? { note: input.note } : {}) };
}

export function summarizeAuditTrail(events: ProductionAuditEvent[]): { total: number; failures: number; byKind: Record<string, number>; latestAt: string | null } {
  const out = { total: events.length, failures: 0, byKind: {} as Record<string, number>, latestAt: null as string | null };
  for (const event of events) {
    if (!event.ok) out.failures += 1;
    out.byKind[event.kind] = (out.byKind[event.kind] ?? 0) + 1;
    out.latestAt = out.latestAt === null || event.at > out.latestAt ? event.at : out.latestAt;
  }
  return out;
}

export function appendTokenLedgerJsonl(existing: string, entries: TokenUsageEntry[]): string {
  const prefix = existing.trim().length > 0 ? `${existing.trim()}\n` : '';
  return `${prefix}${entries.map((entry) => JSON.stringify(entry)).join('\n')}${entries.length > 0 ? '\n' : ''}`;
}

export function parseTokenLedgerJsonl(jsonl: string): TokenUsageEntry[] {
  return jsonl.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as TokenUsageEntry);
}

export function planLlmProviderWithBudget(
  summary: TokenLedgerSummary,
  opts: { day: string; dailyBudgetUsd: number; monthlyBudgetUsd: number; configuredProvider: string; fallbackProvider?: string },
): { provider: string; degraded: boolean; reason: string; audit: ProductionAuditEvent } {
  const daily = summary.byDay[opts.day]?.costUsd ?? 0;
  const fallback = opts.fallbackProvider ?? 'mock';
  const exceeded = daily >= opts.dailyBudgetUsd || summary.totalCostUsd >= opts.monthlyBudgetUsd;
  const reason = daily >= opts.dailyBudgetUsd
    ? `daily budget exceeded: ${daily}/${opts.dailyBudgetUsd}`
    : summary.totalCostUsd >= opts.monthlyBudgetUsd
      ? `monthly budget exceeded: ${summary.totalCostUsd}/${opts.monthlyBudgetUsd}`
      : 'within budget';
  const provider = exceeded ? fallback : opts.configuredProvider;
  return {
    provider,
    degraded: exceeded,
    reason,
    audit: { actor: 'budget-breaker', kind: 'budget', action: exceeded ? 'degrade-provider' : 'allow-provider', at: `${opts.day}T00:00:00.000Z`, ok: true, target: provider, note: reason },
  };
}

export function applyAbWinnerDecision(
  result: AbSignificanceResult,
  weights: Record<string, number> = {},
): { action: 'collect-more' | 'apply-winner'; weights: Record<string, number>; audit: ProductionAuditEvent } {
  if (!result.winner || result.reason !== 'winner') {
    return {
      action: 'collect-more',
      weights: { ...weights },
      audit: { actor: 'ab-decision', kind: 'ab', action: 'collect-more', at: new Date(0).toISOString(), ok: true, note: result.reason },
    };
  }
  const next = { ...weights, [result.winner]: Math.round(((weights[result.winner] ?? 1) + Math.max(result.uplift, 0.1)) * 100) / 100 };
  return {
    action: 'apply-winner',
    weights: next,
    audit: { actor: 'ab-decision', kind: 'ab', action: 'apply-winner', at: new Date(0).toISOString(), ok: true, target: result.winner, note: `confidence=${result.confidence}` },
  };
}

export function applyVariantWeightsToIdeas(ideas: Idea[], weights: Record<string, number>): Idea[] {
  return ideas
    .map((idea) => ({ ...idea, score: Math.min(1, Math.round(idea.score * (weights[idea.variantTag ?? ''] ?? 1) * 1000) / 1000) }))
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}

export interface ChannelAdapterV1 {
  platform: PlatformId;
  authProbe: () => { ok: boolean; detail: string };
  sandboxPost: (body: string) => { ok: boolean; postId: string };
  verify: (postId: string) => { ok: boolean; detail: string };
  cleanup: (postId: string) => { ok: boolean; detail: string };
}

export function createCredentialProbe(platform: PlatformId, env: Record<string, string | undefined>): { ok: boolean; envKey: string; detail: string } {
  const envKey = {
    x: 'IMA_X_TOKEN', reddit: 'IMA_REDDIT_TOKEN', youtube: 'IMA_YOUTUBE_TOKEN', bilibili: 'IMA_BILIBILI_TOKEN', weibo: 'IMA_WEIBO_TOKEN', xiaohongshu: 'IMA_XHS_TOKEN',
  }[platform];
  const value = env[envKey];
  return { ok: Boolean(value && value.trim().length > 0), envKey, detail: value ? 'credential present' : 'missing credential' };
}

export function createStubChannelAdapter(platform: PlatformId, opts: { credential?: string } = {}): ChannelAdapterV1 {
  return {
    platform,
    authProbe: () => ({ ok: Boolean(opts.credential), detail: opts.credential ? 'credential present' : 'missing credential' }),
    sandboxPost: (body) => ({ ok: body.trim().length > 0, postId: `sandbox-${platform}-${Math.max(1, body.length)}` }),
    verify: (postId) => ({ ok: postId.startsWith(`sandbox-${platform}-`), detail: 'sandbox post visible' }),
    cleanup: (postId) => ({ ok: postId.startsWith(`sandbox-${platform}-`), detail: 'sandbox post cleaned' }),
  };
}

export function createPlatformAdapters(platforms: PlatformId[], env: Record<string, string | undefined>): ChannelAdapterV1[] {
  return platforms.map((platform) => createStubChannelAdapter(platform, { credential: env[createCredentialProbe(platform, env).envKey] }));
}

export function runChannelAdapterSafetyChain(adapter: ChannelAdapterV1, body: string, now = new Date().toISOString()): { ok: boolean; steps: string[]; audit: ProductionAuditEvent[] } {
  const auth = adapter.authProbe();
  const steps = [`auth-probe:${auth.ok}`];
  const audit: ProductionAuditEvent[] = [{ actor: 'channel-adapter', kind: 'channel', action: 'auth-probe', at: now, ok: auth.ok, target: adapter.platform, note: auth.detail }];
  if (!auth.ok) return { ok: false, steps, audit };
  const post = adapter.sandboxPost(body);
  steps.push(`sandbox-post:${post.ok}`);
  audit.push({ actor: 'channel-adapter', kind: 'channel', action: 'sandbox-post', at: now, ok: post.ok, target: post.postId });
  const verified = post.ok ? adapter.verify(post.postId) : { ok: false, detail: 'post failed' };
  steps.push(`verify:${verified.ok}`);
  audit.push({ actor: 'channel-adapter', kind: 'channel', action: 'verify', at: now, ok: verified.ok, target: post.postId, note: verified.detail });
  const cleaned = verified.ok ? adapter.cleanup(post.postId) : { ok: false, detail: 'verify failed' };
  steps.push(`cleanup:${cleaned.ok}`);
  audit.push({ actor: 'channel-adapter', kind: 'channel', action: 'cleanup', at: now, ok: cleaned.ok, target: post.postId, note: cleaned.detail });
  return { ok: auth.ok && post.ok && verified.ok && cleaned.ok, steps, audit };
}

export function buildReplyQueueState(items: ReplyQueueItem[]): { total: number; byStatus: Record<string, number>; next: ReplyQueueItem | null } {
  const byStatus: Record<string, number> = { queued: 0, sent: 0, skipped: 0 };
  for (const item of items) byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
  const next = [...items].filter((item) => item.status === 'queued').sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id))[0] ?? null;
  return { total: items.length, byStatus, next };
}

export function workReplyQueue(items: ReplyQueueItem[], opts: { limit?: number; sandbox?: boolean; now?: string } = {}): { items: ReplyQueueItem[]; result: ReplyExecutionResult } {
  const limit = opts.limit ?? items.length;
  const selected = [...items].filter((item) => item.status === 'queued').sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id)).slice(0, limit);
  const selectedIds = new Set(selected.map((item) => item.id));
  const result = executeReplyQueue(selected, { sandbox: opts.sandbox ?? true, now: opts.now });
  const statusById = new Map(result.sent.map((item) => [item.id, item.status]));
  return { items: items.map((item) => selectedIds.has(item.id) ? { ...item, status: statusById.get(item.id) ?? item.status } : { ...item }), result };
}

export interface ReleaseGateResult {
  name: string;
  ok: boolean;
  durationMs: number;
  summary: string;
  hint?: string;
}

export function buildReleaseLocalJsonReport(gates: ReleaseGateResult[]): { ok: boolean; gates: ReleaseGateResult[]; failed: string[]; markdown: string } {
  const failed = gates.filter((gate) => !gate.ok).map((gate) => gate.name);
  const markdown = ['# release:local report', '', `- ok: ${failed.length === 0}`, `- failed: ${failed.join(',') || 'none'}`, '', '| gate | ok | ms | summary |', '|---|---:|---:|---|', ...gates.map((gate) => `| ${gate.name} | ${gate.ok ? 'yes' : 'no'} | ${gate.durationMs} | ${gate.summary} |`)].join('\n');
  return { ok: failed.length === 0, gates: gates.map((gate) => ({ ...gate })), failed, markdown: `${markdown}\n` };
}

export function buildReleaseActionPlan(report: ReturnType<typeof buildReleaseLocalJsonReport>): { canDeploy: boolean; command: string; hint: string } {
  return report.ok
    ? { canDeploy: true, command: 'git push origin master', hint: 'all gates passed' }
    : { canDeploy: false, command: 'npm run release:local', hint: `fix failed gates: ${report.failed.join(', ')}` };
}

export function buildProductionConsoleSnapshot(input: {
  replies: ReplyExecutionResult;
  budget: ReturnType<typeof planLlmProviderWithBudget>;
  ab: ReturnType<typeof applyAbWinnerDecision>;
  channel: ReturnType<typeof runChannelAdapterSafetyChain>;
  release: ReturnType<typeof buildReleaseLocalJsonReport>;
  audit?: ReturnType<typeof summarizeAuditTrail>;
  tokenLedger?: { totalCalls: number; totalCostUsd: number };
  replyQueue?: ReturnType<typeof buildReplyQueueState>;
}): Record<string, unknown> {
  return {
    replySafety: { mode: input.replies.mode, sent: input.replies.sent.length, readyForRealReply: input.replies.readyForRealReply },
    replyQueue: input.replyQueue ?? { total: input.replies.sent.length, byStatus: {}, next: null },
    budget: { provider: input.budget.provider, degraded: input.budget.degraded, reason: input.budget.reason },
    tokenLedger: input.tokenLedger ?? { totalCalls: 0, totalCostUsd: 0 },
    ab: { action: input.ab.action, weights: input.ab.weights },
    channel: { ok: input.channel.ok, steps: input.channel.steps },
    release: { ok: input.release.ok, failed: input.release.failed, action: buildReleaseActionPlan(input.release) },
    audit: input.audit ?? { total: input.replies.audit.length + 1 + 1 + input.channel.audit.length, failures: 0, byKind: {}, latestAt: null },
    auditCount: input.replies.audit.length + 1 + 1 + input.channel.audit.length,
  };
}
