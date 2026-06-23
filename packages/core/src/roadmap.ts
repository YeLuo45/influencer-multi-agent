import type { AbVariantSummary } from './ab-test.js';
import type { EngagementMetric, PlatformId } from './types.js';

export interface ReplyQueueItem {
  id: string;
  platform: PlatformId;
  postId: string;
  comment: string;
  draft: string;
  priority: number;
  status: 'queued' | 'sent' | 'skipped';
  createdAt: string;
}

export function buildReplyQueue(metrics: Array<EngagementMetric & { commentTexts?: string[] }>, opts: { now?: string } = {}): ReplyQueueItem[] {
  const now = opts.now ?? new Date().toISOString();
  const items: ReplyQueueItem[] = [];
  for (const metric of metrics) {
    const comments = metric.commentTexts ?? [];
    comments.forEach((comment, index) => {
      const wantsSource = /source|link|where|出处|来源/i.test(comment);
      items.push({
        id: `reply-${metric.platform}-${metric.postId}-${index + 1}`,
        platform: metric.platform,
        postId: metric.postId,
        comment,
        draft: wantsSource
          ? 'Thanks for asking — I will add the source link and context in a follow-up.'
          : 'Thanks for the thoughtful comment — appreciate you adding to the discussion.',
        priority: metric.likes + metric.shares * 2 + (wantsSource ? 10 : 0),
        status: 'queued',
        createdAt: now,
      });
    });
  }
  return items.sort((a, b) => b.priority - a.priority || a.id.localeCompare(b.id));
}

export interface TokenUsageEntry {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
  costUsd: number;
  at: string;
}

export function recordTokenUsage(input: {
  provider: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  costUsd?: number;
  at?: string;
}): TokenUsageEntry {
  const totalTokens = input.promptTokens + input.completionTokens;
  return {
    provider: input.provider,
    model: input.model,
    promptTokens: input.promptTokens,
    completionTokens: input.completionTokens,
    totalTokens,
    costUsd: input.costUsd ?? 0,
    at: input.at ?? new Date().toISOString(),
  };
}

export interface TokenLedgerSummary {
  totalCalls: number;
  totalTokens: number;
  totalCostUsd: number;
  byModel: Record<string, { calls: number; tokens: number; costUsd: number }>;
  byDay: Record<string, { calls: number; tokens: number; costUsd: number }>;
}

export function summarizeTokenLedger(entries: TokenUsageEntry[]): TokenLedgerSummary {
  const summary: TokenLedgerSummary = { totalCalls: 0, totalTokens: 0, totalCostUsd: 0, byModel: {}, byDay: {} };
  for (const entry of entries) {
    summary.totalCalls += 1;
    summary.totalTokens += entry.totalTokens;
    summary.totalCostUsd = roundMoney(summary.totalCostUsd + entry.costUsd);
    const modelKey = `${entry.provider}/${entry.model}`;
    const model = summary.byModel[modelKey] ?? { calls: 0, tokens: 0, costUsd: 0 };
    model.calls += 1;
    model.tokens += entry.totalTokens;
    model.costUsd = roundMoney(model.costUsd + entry.costUsd);
    summary.byModel[modelKey] = model;
    const dayKey = entry.at.slice(0, 10);
    const day = summary.byDay[dayKey] ?? { calls: 0, tokens: 0, costUsd: 0 };
    day.calls += 1;
    day.tokens += entry.totalTokens;
    day.costUsd = roundMoney(day.costUsd + entry.costUsd);
    summary.byDay[dayKey] = day;
  }
  return summary;
}

export interface AbSignificanceResult {
  winner: string | null;
  confidence: number;
  uplift: number;
  reason: 'winner' | 'tie' | 'insufficient_sample' | 'no_variants';
}

export function evaluateAbSignificance(
  variants: AbVariantSummary[],
  opts: { minSampleSize?: number; confidenceThreshold?: number } = {},
): AbSignificanceResult {
  if (variants.length === 0) return { winner: null, confidence: 0, uplift: 0, reason: 'no_variants' };
  const minSampleSize = opts.minSampleSize ?? 3;
  const eligible = variants.filter((variant) => variant.engagementCount >= minSampleSize);
  if (eligible.length < 2) return { winner: null, confidence: 0, uplift: 0, reason: 'insufficient_sample' };
  const sorted = [...eligible].sort((a, b) => b.score / Math.max(b.engagementCount, 1) - a.score / Math.max(a.engagementCount, 1));
  const top = sorted[0]!;
  const second = sorted[1]!;
  const topRate = top.score / Math.max(top.engagementCount, 1);
  const secondRate = second.score / Math.max(second.engagementCount, 1);
  const uplift = topRate <= 0 ? 0 : (topRate - secondRate) / Math.max(secondRate, 1);
  const pooled = Math.max(top.views + second.views, 1);
  const confidence = clamp01(Math.abs(top.score - second.score) / Math.sqrt(pooled));
  const threshold = opts.confidenceThreshold ?? 0.8;
  if (confidence < threshold || uplift <= 0) return { winner: null, confidence, uplift, reason: 'tie' };
  return { winner: top.variant, confidence, uplift, reason: 'winner' };
}

export interface ChannelSandboxStep {
  kind: 'dry-run' | 'channel-test' | 'publish-test' | 'verify' | 'cleanup';
  platform: PlatformId | 'all';
  command: string;
  sandbox: boolean;
}

export function buildChannelSandboxPlan(platforms: PlatformId[]): { platforms: PlatformId[]; readyForRealPublish: boolean; steps: ChannelSandboxStep[] } {
  const platformArg = platforms.join(',');
  return {
    platforms: [...platforms],
    readyForRealPublish: false,
    steps: [
      { kind: 'dry-run', platform: 'all', command: `npm run cli dry-run <content-id> --json --out reports/dry-${platformArg}.json`, sandbox: true },
      { kind: 'channel-test', platform: 'all', command: `npm run cli channel-test ${platformArg}`, sandbox: true },
      { kind: 'publish-test', platform: 'all', command: `npm run cli publish-cli --rc --sandbox ${platformArg}`, sandbox: true },
      { kind: 'verify', platform: 'all', command: `npm run cli status <content-id>`, sandbox: true },
      { kind: 'cleanup', platform: 'all', command: `npm run cli queue prune`, sandbox: true },
    ],
  };
}

export function buildE2EHarnessPlan(opts: { includeReadme?: boolean } = {}): { gates: string[]; commands: string[] } {
  const gates = ['bootstrap', 'queue-work', 'feedback', 'ab-report'];
  if (opts.includeReadme ?? true) gates.push('verify-readme');
  return {
    gates,
    commands: [
      'npm run bootstrap',
      'npm run queue:work',
      'npm run cli feedback',
      'npm run cli ab report <content-id> --min-samples 1',
      ...(gates.includes('verify-readme') ? ['npm run verify:readme'] : []),
    ],
  };
}

export function planRealtimeSse(opts: { intervalMs?: number; replayLast?: boolean } = {}): { mode: 'continuous'; intervalMs: number; replayLast: boolean } {
  const requested = opts.intervalMs ?? 1_000;
  return {
    mode: 'continuous',
    intervalMs: Math.min(60_000, Math.max(250, requested)),
    replayLast: opts.replayLast ?? true,
  };
}

export interface OperationAuditEvent {
  actor: string;
  kind: string;
  at: string;
  ok: boolean;
}

export function buildOperationAuditPanel(events: OperationAuditEvent[]): {
  total: number;
  failures: number;
  latestAt: string | null;
  byActor: Record<string, number>;
  byKind: Record<string, number>;
} {
  const panel = { total: events.length, failures: 0, latestAt: null as string | null, byActor: {} as Record<string, number>, byKind: {} as Record<string, number> };
  for (const event of events) {
    if (!event.ok) panel.failures += 1;
    panel.latestAt = panel.latestAt === null || event.at > panel.latestAt ? event.at : panel.latestAt;
    panel.byActor[event.actor] = (panel.byActor[event.actor] ?? 0) + 1;
    panel.byKind[event.kind] = (panel.byKind[event.kind] ?? 0) + 1;
  }
  return panel;
}

export interface ReplySendPlan {
  readyForRealReply: boolean;
  items: ReplyQueueItem[];
  steps: Array<{ kind: 'sandbox-reply' | 'verify' | 'cleanup' | 'real-reply'; command: string; sandbox: boolean }>;
}

export function buildReplySendPlan(items: ReplyQueueItem[], opts: { sandbox?: boolean; now?: string } = {}): ReplySendPlan {
  const sandbox = opts.sandbox ?? true;
  return {
    readyForRealReply: !sandbox && items.length > 0,
    items: items.map((item) => ({ ...item })),
    steps: sandbox
      ? [
          { kind: 'sandbox-reply', command: 'npm run cli reply send --sandbox', sandbox: true },
          { kind: 'verify', command: 'npm run cli reply verify', sandbox: true },
          { kind: 'cleanup', command: 'npm run cli reply cleanup --sandbox', sandbox: true },
        ]
      : [{ kind: 'real-reply', command: 'npm run cli reply send', sandbox: false }],
  };
}

export function applyBudgetBreaker(
  summary: TokenLedgerSummary,
  opts: { day: string; dailyBudgetUsd: number; monthlyBudgetUsd: number; fallbackProvider?: string } ,
): { action: 'allow' | 'degrade'; provider: string; reason: string } {
  const daily = summary.byDay[opts.day]?.costUsd ?? 0;
  if (daily >= opts.dailyBudgetUsd) {
    return { action: 'degrade', provider: opts.fallbackProvider ?? 'mock', reason: `daily budget exceeded: ${daily}/${opts.dailyBudgetUsd}` };
  }
  if (summary.totalCostUsd >= opts.monthlyBudgetUsd) {
    return { action: 'degrade', provider: opts.fallbackProvider ?? 'mock', reason: `monthly budget exceeded: ${summary.totalCostUsd}/${opts.monthlyBudgetUsd}` };
  }
  return { action: 'allow', provider: 'configured', reason: 'within budget' };
}

export function buildAbDecisionAction(result: AbSignificanceResult):
  | { action: 'collect-more'; note: string }
  | { action: 'apply-winner'; winner: string; note: string } {
  if (!result.winner || result.reason !== 'winner') {
    return { action: 'collect-more', note: 'A/B needs more samples or clearer separation' };
  }
  return { action: 'apply-winner', winner: result.winner, note: `Winner ${result.winner} selected with ${Math.round(result.confidence * 100)}% confidence` };
}

export type ChannelAdapterStepKind = 'auth-probe' | 'sandbox-post' | 'verify' | 'delete-cleanup';

export function buildChannelAdapterV1Plan(platforms: PlatformId[]): {
  platforms: PlatformId[];
  ready: boolean;
  steps: Array<{ platform: PlatformId; kind: ChannelAdapterStepKind; command: string }>;
} {
  const steps = platforms.flatMap((platform) => [
    { platform, kind: 'auth-probe' as const, command: `npm run cli channel-test ${platform}` },
    { platform, kind: 'sandbox-post' as const, command: `npm run cli publish-cli --sandbox ${platform}` },
    { platform, kind: 'verify' as const, command: `npm run cli status <content-id>` },
    { platform, kind: 'delete-cleanup' as const, command: `npm run cli reply cleanup --platform ${platform}` },
  ]);
  return { platforms: [...platforms], ready: false, steps };
}

export function buildPersistentAuditAppend(event: OperationAuditEvent): { path: 'audit.jsonl'; line: string } {
  return { path: 'audit.jsonl', line: JSON.stringify(event) };
}

export function buildReleaseLocalPlan(): { scriptName: 'release:local'; commands: string[]; recursiveVerifyReadme: boolean } {
  return {
    scriptName: 'release:local',
    commands: ['npm run bootstrap', 'npm run queue:work', 'npm run cli feedback', 'npm run cli ab report <content-id> --min-samples 1', 'npm run verify:readme'],
    recursiveVerifyReadme: false,
  };
}

export function buildSseTickPlan(input: { intervalMs?: number; snapshot: Record<string, number> }): {
  intervalMs: number;
  changeHash: string;
  events: Array<{ event: 'snapshot'; data: Record<string, number> }>;
} {
  const intervalMs = Math.min(60_000, Math.max(250, input.intervalMs ?? 1_000));
  const ordered = Object.keys(input.snapshot).sort().map((key) => `${key}:${input.snapshot[key]}`).join('|');
  let hash = 0;
  for (const ch of ordered) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return { intervalMs, changeHash: `sse-${hash.toString(16)}`, events: [{ event: 'snapshot', data: { ...input.snapshot } }] };
}

function roundMoney(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}
