import type { Content, HistoryEntry, PlatformId, PostRecord, Source } from './types.js';

export type AgentResult<T> =
  | { kind: 'ok'; data: T }
  | { kind: 'error'; message: string; recoverable: boolean }
  | { kind: 'needs-input'; question: string; options?: string[] };

export interface CrawlerLike {
  fetch(url: string, opts?: { render?: 'static' | 'js' }): Promise<{ url: string; title: string; markdown: string }>;
}

export interface PublisherLike {
  post(platform: PlatformId, content: { title: string; body: string; tags: string[] }): Promise<PostRecord>;
  healthCheck(platform: PlatformId): Promise<{ ok: boolean; detail: string }>;
}

export interface AgentContext {
  llm: { complete(prompt: string, opts?: { system?: string; maxTokens?: number }): Promise<string> };
  crawler: CrawlerLike;
  publisher: PublisherLike;
  /**
   * Optional durable queue sink. When supplied, PublishAgent writes a QueueItem
   * per posted-or-failed platform so a background worker can resume after a
   * crash. If omitted, PublishAgent behaves as before (no persistence).
   */
  queueSink?: (item: import('./publish-queue.js').QueueItem) => Promise<void>;
  /** Optional per-platform limiter. Keys are `publish:<platform>`. */
  rateLimiter?: import('./rate-limit.js').RateLimiter;
  now(): string;
}

export interface Agent<I, O> {
  name: string;
  run(input: I, content: Content, ctx: AgentContext): Promise<AgentResult<O>>;
}

export function makeHistoryEntry(
  from: Content['stage'],
  to: Content['stage'],
  agent: string,
  note: string,
  now: string,
): HistoryEntry {
  return { from, to, agent, note, at: now };
}

export function ok<T>(data: T): AgentResult<T> {
  return { kind: 'ok', data };
}

export function err(message: string, recoverable = true): AgentResult<never> {
  return { kind: 'error', message, recoverable };
}

export function needInput(question: string, options?: string[]): AgentResult<never> {
  return { kind: 'needs-input', question, ...(options ? { options } : {}) };
}

export function sourceToString(s: Source): string {
  return `${s.title}\n${s.snippet}\n${s.url}`;
}