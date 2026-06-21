import type { QueueItem } from '@ima/core';
import { processQueue, type ChannelResolver } from '@ima/core';
import type { ChannelRegistry } from '@ima/publisher';
import { QueueStore } from './queue-store.js';

export interface WorkerOptions {
  limit?: number;
  now?: string;
  baseDelayMs?: number;
}

export interface WorkerRunResult {
  scanned: number;
  processed: number;
  posted: number;
  retryScheduled: number;
  deadLettered: number;
}

export class PublishWorker {
  constructor(
    private readonly queue: QueueStore,
    private readonly registry: ChannelRegistry,
  ) {}

  async runOnce(opts: WorkerOptions = {}): Promise<WorkerRunResult> {
    const items = await this.queue.list();
    if (items.length === 0) {
      return { scanned: 0, processed: 0, posted: 0, retryScheduled: 0, deadLettered: 0 };
    }
    const resolver: ChannelResolver = {
      resolve: (p) => {
        if (!this.registry.has(p)) return null;
        const ch = this.registry.get(p);
        return { post: (input, o) => ch.post(input, o) };
      },
    };
    const { items: next, result } = await processQueue(items, resolver, {
      ...(opts.now !== undefined ? { now: opts.now } : {}),
      ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts.baseDelayMs !== undefined ? { baseDelayMs: opts.baseDelayMs } : {}),
    });
    await this.queue.replaceAll(next);
    return {
      scanned: items.length,
      processed: result.processed,
      posted: result.posted,
      retryScheduled: result.retryScheduled,
      deadLettered: result.deadLettered,
    };
  }
}

export function summarizeQueue(items: QueueItem[]): {
  total: number;
  byStatus: Record<QueueItem['status'], number>;
  oldestPending: string | null;
  deadLettered: Array<{ id: string; contentId: string; platform: string; lastError: string | null; attempts: number }>;
} {
  const byStatus: Record<QueueItem['status'], number> = {
    pending: 0,
    posting: 0,
    posted: 0,
    failed_retry: 0,
    failed_dead: 0,
  };
  let oldestPending: string | null = null;
  const deadLettered: Array<{ id: string; contentId: string; platform: string; lastError: string | null; attempts: number }> = [];
  for (const it of items) {
    byStatus[it.status] += 1;
    if (it.status === 'pending' || it.status === 'failed_retry') {
      if (oldestPending === null || it.nextAttemptAt < oldestPending) {
        oldestPending = it.nextAttemptAt;
      }
    }
    if (it.status === 'failed_dead') {
      deadLettered.push({
        id: it.id,
        contentId: it.contentId,
        platform: it.platform,
        lastError: it.lastError,
        attempts: it.attempts,
      });
    }
  }
  return { total: items.length, byStatus, oldestPending, deadLettered };
}
