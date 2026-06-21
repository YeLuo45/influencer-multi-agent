import type { PlatformId, PostRecord } from './types.js';

/**
 * Minimal contract a channel must satisfy. We don't import the publisher package
 * to keep `@ima/core` framework-agnostic — the CLI wires concrete channels in.
 */
export interface QueuePostInput {
  title: string;
  body: string;
  tags: string[];
}

export interface QueueChannelLike {
  post(input: QueuePostInput, opts?: { now?: string }): Promise<PostRecord>;
}

/**
 * Durable publish queue.
 *
 * One row per (contentId, platform) — survives process restart. Worker re-reads
 * `.ima/queue/<id>.json` and resumes. Status state machine:
 *   pending ─► posting ─► posted
 *                │       (terminal success)
 *                └─────► failed_retry ─► (re-enqueued) ─► posting
 *                └─────► failed_dead  (max retries exceeded; terminal)
 */
export type QueueStatus = 'pending' | 'posting' | 'posted' | 'failed_retry' | 'failed_dead';

export interface QueueItem {
  id: string;
  contentId: string;
  platform: PlatformId;
  payload: QueuePostInput;
  status: QueueStatus;
  attempts: number;
  maxAttempts: number;
  lastError: string | null;
  postId: string | null;
  url: string | null;
  enqueuedAt: string;
  nextAttemptAt: string;
  postedAt: string | null;
}

export interface QueueEnqueueOptions {
  maxAttempts?: number;
  baseDelayMs?: number;
}

export interface QueueProcessResult {
  processed: number;
  posted: number;
  retryScheduled: number;
  deadLettered: number;
  results: Array<{ id: string; status: QueueStatus; postId: string | null; error: string | null }>;
}

export const DEFAULT_MAX_ATTEMPTS = 3;
export const DEFAULT_BASE_DELAY_MS = 60_000; // 1 minute

export function createQueueItem(opts: {
  contentId: string;
  platform: PlatformId;
  payload: QueuePostInput;
  now?: string;
  maxAttempts?: number;
  baseDelayMs?: number;
}): QueueItem {
  const now = opts.now ?? new Date().toISOString();
  return {
    id: `q-${now.replace(/[^0-9]/g, '').slice(0, 14)}-${Math.random().toString(36).slice(2, 6)}`,
    contentId: opts.contentId,
    platform: opts.platform,
    payload: opts.payload,
    status: 'pending',
    attempts: 0,
    maxAttempts: opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    lastError: null,
    postId: null,
    url: null,
    enqueuedAt: now,
    nextAttemptAt: now,
    postedAt: null,
  };
}

export function recordAttemptFailure(
  item: QueueItem,
  error: string,
  now: string,
  baseDelayMs: number = DEFAULT_BASE_DELAY_MS,
): QueueItem {
  const attempts = item.attempts + 1;
  if (attempts >= item.maxAttempts) {
    return {
      ...item,
      attempts,
      status: 'failed_dead',
      lastError: error,
      postedAt: now,
    };
  }
  // exponential backoff: baseDelayMs * 3^(attempts-1), capped at 1h
  const delayMs = Math.min(baseDelayMs * Math.pow(3, attempts - 1), 60 * 60 * 1000);
  return {
    ...item,
    attempts,
    status: 'failed_retry',
    lastError: error,
    nextAttemptAt: new Date(Date.parse(now) + delayMs).toISOString(),
  };
}

export function recordAttemptSuccess(item: QueueItem, post: PostRecord, now: string): QueueItem {
  return {
    ...item,
    attempts: item.attempts + 1,
    status: 'posted',
    postId: post.postId,
    url: post.url ?? null,
    lastError: null,
    postedAt: now,
  };
}

export function isDue(item: QueueItem, now: string): boolean {
  if (item.status === 'posted' || item.status === 'failed_dead') return false;
  return Date.parse(item.nextAttemptAt) <= Date.parse(now);
}

export function selectDue(items: QueueItem[], now: string): QueueItem[] {
  return items
    .filter((i) => isDue(i, now))
    .sort((a, b) => a.nextAttemptAt.localeCompare(b.nextAttemptAt));
}

export function countByStatus(items: QueueItem[]): Record<QueueStatus, number> {
  const out: Record<QueueStatus, number> = {
    pending: 0,
    posting: 0,
    posted: 0,
    failed_retry: 0,
    failed_dead: 0,
  };
  for (const it of items) out[it.status] += 1;
  return out;
}

export interface ChannelResolver {
  resolve(platform: PlatformId): QueueChannelLike | null;
}

export interface QueueProcessOptions {
  now?: string;
  baseDelayMs?: number;
  /** limit how many items to process in this run (default unlimited) */
  limit?: number;
}

/**
 * Pull a snapshot of queue items, attempt each due one, return updated items.
 * Pure function: caller is responsible for persisting the returned array.
 */
export async function processQueue(
  items: QueueItem[],
  resolver: ChannelResolver,
  opts: QueueProcessOptions = {},
): Promise<{ items: QueueItem[]; result: QueueProcessResult }> {
  const now = opts.now ?? new Date().toISOString();
  const due = selectDue(items, now);
  const slice = opts.limit && opts.limit > 0 ? due.slice(0, opts.limit) : due;
  const updated = new Map<string, QueueItem>();
  // pre-copy the input items so untouched rows are preserved verbatim
  for (const it of items) updated.set(it.id, it);

  const results: QueueProcessResult['results'] = [];
  let posted = 0;
  let retryScheduled = 0;
  let deadLettered = 0;

  for (const item of slice) {
    const channel = resolver.resolve(item.platform);
    const inFlight: QueueItem = { ...item, status: 'posting' };
    updated.set(item.id, inFlight);
    if (!channel) {
      const failed: QueueItem = recordAttemptFailure(inFlight, `no channel for platform ${item.platform}`, now, opts.baseDelayMs);
      updated.set(item.id, failed);
      if (failed.status === 'failed_retry') {
        retryScheduled += 1;
      } else {
        deadLettered += 1;
      }
      results.push({ id: item.id, status: failed.status, postId: null, error: failed.lastError });
      continue;
    }
    try {
      const rec = await channel.post(item.payload, { now });
      const ok: QueueItem = recordAttemptSuccess(inFlight, rec, now);
      updated.set(item.id, ok);
      posted += 1;
      results.push({ id: item.id, status: ok.status, postId: ok.postId, error: null });
    } catch (e) {
      const failed: QueueItem = recordAttemptFailure(inFlight, (e as Error).message, now, opts.baseDelayMs);
      updated.set(item.id, failed);
      if (failed.status === 'failed_retry') {
        retryScheduled += 1;
      } else {
        deadLettered += 1;
      }
      results.push({ id: item.id, status: failed.status, postId: null, error: failed.lastError });
    }
  }

  return {
    items: Array.from(updated.values()),
    result: { processed: slice.length, posted, retryScheduled, deadLettered, results },
  };
}

/** Build the PostRecord list a publish step would have returned synchronously. */
export function projectToPostRecords(items: QueueItem[]): PostRecord[] {
  return items.map((it) => {
    if (it.status === 'posted') {
      return {
        platform: it.platform,
        postId: it.postId,
        status: 'posted',
        url: it.url ?? undefined,
        postedAt: it.postedAt ?? it.enqueuedAt,
      };
    }
    if (it.status === 'failed_dead') {
      return {
        platform: it.platform,
        postId: null,
        status: 'failed',
        error: it.lastError ?? 'dead letter',
        postedAt: it.postedAt ?? it.enqueuedAt,
      };
    }
    // pending / posting / failed_retry → expose as queued so the bootstrap status
    // table can still render something meaningful.
    return {
      platform: it.platform,
      postId: null,
      status: 'queued',
      postedAt: it.enqueuedAt,
    };
  });
}
