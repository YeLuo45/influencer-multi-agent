import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { PlatformId, PostInput, PostRecord } from '../src/types.js';
import {
  createQueueItem,
  recordAttemptFailure,
  recordAttemptSuccess,
  isDue,
  selectDue,
  countByStatus,
  processQueue,
  projectToPostRecords,
  DEFAULT_MAX_ATTEMPTS,
  DEFAULT_BASE_DELAY_MS,
  type QueueItem,
  type QueueChannelLike,
  type ChannelResolver,
} from '../src/publish-queue.js';

function makeItem(overrides: Partial<QueueItem> = {}): QueueItem {
  const base = createQueueItem({
    contentId: 'c-test',
    platform: 'x',
    payload: { title: 't', body: 'b', tags: ['a'] },
    now: '2026-06-21T00:00:00.000Z',
  });
  return { ...base, ...overrides };
}

void test('createQueueItem: initializes pending state', () => {
  const it = createQueueItem({
    contentId: 'c-1',
    platform: 'xiaohongshu',
    payload: { title: 't', body: 'b', tags: [] },
    now: '2026-06-21T00:00:00.000Z',
  });
  assert.equal(it.status, 'pending');
  assert.equal(it.attempts, 0);
  assert.equal(it.maxAttempts, DEFAULT_MAX_ATTEMPTS);
  assert.equal(it.postId, null);
  assert.equal(it.lastError, null);
  assert.equal(it.enqueuedAt, it.nextAttemptAt);
  assert.ok(it.id.startsWith('q-'));
});

void test('createQueueItem: honors custom maxAttempts', () => {
  const it = createQueueItem({ contentId: 'c-1', platform: 'x', payload: { title: 't', body: 'b', tags: [] }, maxAttempts: 7 });
  assert.equal(it.maxAttempts, 7);
});

void test('recordAttemptFailure: first failure schedules retry with backoff', () => {
  const it = makeItem({ attempts: 0 });
  const next = recordAttemptFailure(it, 'boom', '2026-06-21T00:01:00.000Z', 1000);
  assert.equal(next.attempts, 1);
  assert.equal(next.status, 'failed_retry');
  assert.equal(next.lastError, 'boom');
  // baseDelayMs * 3^(1-1) = 1000
  assert.equal(next.nextAttemptAt, '2026-06-21T00:01:01.000Z');
});

void test('recordAttemptFailure: second failure applies 3x backoff', () => {
  const it = makeItem({ attempts: 1 });
  const next = recordAttemptFailure(it, 'boom2', '2026-06-21T00:01:00.000Z', 1000);
  assert.equal(next.attempts, 2);
  assert.equal(next.status, 'failed_retry');
  // 1000 * 3^(2-1) = 3000
  assert.equal(next.nextAttemptAt, '2026-06-21T00:01:03.000Z');
});

void test('recordAttemptFailure: hitting max attempts dead-letters', () => {
  const it = makeItem({ attempts: 2, maxAttempts: 3 });
  const next = recordAttemptFailure(it, 'fatal', '2026-06-21T00:01:00.000Z', 1000);
  assert.equal(next.attempts, 3);
  assert.equal(next.status, 'failed_dead');
  assert.equal(next.postedAt, '2026-06-21T00:01:00.000Z');
});

void test('recordAttemptFailure: backoff is capped at 1h', () => {
  const it = makeItem({ attempts: 0 });
  const next = recordAttemptFailure(it, 'x', '2026-06-21T00:00:00.000Z', 10_000_000);
  // would be 10Mms, but cap is 1h
  const delay = Date.parse(next.nextAttemptAt) - Date.parse('2026-06-21T00:00:00.000Z');
  assert.equal(delay, 60 * 60 * 1000);
});

void test('recordAttemptSuccess: marks posted with postId and url', () => {
  const it = makeItem({ attempts: 0 });
  const next = recordAttemptSuccess(
    it,
    { platform: it.platform, postId: 'p-1', status: 'posted', url: 'https://x.example.com/p/p-1' },
    '2026-06-21T00:00:01.000Z',
  );
  assert.equal(next.status, 'posted');
  assert.equal(next.attempts, 1);
  assert.equal(next.postId, 'p-1');
  assert.equal(next.url, 'https://x.example.com/p/p-1');
  assert.equal(next.postedAt, '2026-06-21T00:00:01.000Z');
  assert.equal(next.lastError, null);
});

void test('isDue: pending past nextAttemptAt is due', () => {
  const it = makeItem({ nextAttemptAt: '2026-06-21T00:00:00.000Z' });
  assert.equal(isDue(it, '2026-06-21T00:00:01.000Z'), true);
  assert.equal(isDue(it, '2026-06-20T23:59:59.000Z'), false);
});

void test('isDue: posted and failed_dead are never due', () => {
  const posted = makeItem({ status: 'posted' });
  const dead = makeItem({ status: 'failed_dead' });
  assert.equal(isDue(posted, '9999-01-01T00:00:00.000Z'), false);
  assert.equal(isDue(dead, '9999-01-01T00:00:00.000Z'), false);
});

void test('selectDue: returns only due items sorted by nextAttemptAt asc', () => {
  const a = makeItem({ id: 'a', nextAttemptAt: '2026-06-21T00:00:01.000Z', status: 'pending' });
  const b = makeItem({ id: 'b', nextAttemptAt: '2026-06-21T00:00:00.000Z', status: 'pending' });
  const c = makeItem({ id: 'c', nextAttemptAt: '2026-06-20T00:00:00.000Z', status: 'posted' });
  const out = selectDue([a, b, c], '2026-06-21T00:00:02.000Z');
  assert.deepEqual(out.map((i) => i.id), ['b', 'a']);
});

void test('countByStatus: tallies each bucket', () => {
  const items: QueueItem[] = [
    makeItem({ id: 'a', status: 'pending' }),
    makeItem({ id: 'b', status: 'pending' }),
    makeItem({ id: 'c', status: 'posted' }),
    makeItem({ id: 'd', status: 'failed_retry' }),
    makeItem({ id: 'e', status: 'failed_dead' }),
  ];
  const counts = countByStatus(items);
  assert.deepEqual(counts, { pending: 2, posting: 0, posted: 1, failed_retry: 1, failed_dead: 1 });
});

void test('processQueue: posts all due items via channel resolver', async () => {
  const items: QueueItem[] = [
    makeItem({ id: 'a', platform: 'x', status: 'pending' }),
    makeItem({ id: 'b', platform: 'xiaohongshu', status: 'pending' }),
  ];
  const seen: PlatformId[] = [];
  const channelFor = (p: PlatformId): QueueChannelLike => ({
    async post(input: PostInput): Promise<PostRecord> {
      seen.push(p);
      return { platform: p, postId: `${p}-1`, status: 'posted', url: `https://${p}.x/p/1` };
    },
  });
  const resolver: ChannelResolver = { resolve: (p) => channelFor(p) };
  const { items: next, result } = await processQueue(items, resolver, { now: '2026-06-21T00:00:00.000Z' });
  assert.equal(result.processed, 2);
  assert.equal(result.posted, 2);
  assert.equal(result.retryScheduled, 0);
  assert.equal(result.deadLettered, 0);
  assert.equal(seen.length, 2);
  assert.equal(next.find((i) => i.id === 'a')!.status, 'posted');
  assert.equal(next.find((i) => i.id === 'a')!.postId, 'x-1');
  assert.equal(next.find((i) => i.id === 'b')!.status, 'posted');
});

void test('processQueue: channel not found schedules retry (no channel = transient until max attempts)', async () => {
  const items = [makeItem({ id: 'a', platform: 'x' })];
  const resolver: ChannelResolver = { resolve: () => null };
  const { items: next, result } = await processQueue(items, resolver, { now: '2026-06-21T00:00:00.000Z' });
  assert.equal(result.processed, 1);
  assert.equal(result.retryScheduled, 1);
  assert.equal(result.deadLettered, 0);
  assert.equal(next[0]!.status, 'failed_retry');
  assert.equal(next[0]!.attempts, 1);
  assert.match(next[0]!.lastError ?? '', /no channel for platform x/);
});

void test('processQueue: throws schedule retry; second success recovers', async () => {
  let calls = 0;
  const flaky: QueueChannelLike = {
    async post(): Promise<PostRecord> {
      calls += 1;
      if (calls === 1) throw new Error('503 service unavailable');
      return { platform: 'x', postId: 'p-2', status: 'posted', url: 'https://x.x/p/2' };
    },
  };
  const resolver: ChannelResolver = { resolve: () => flaky };
  const items: QueueItem[] = [makeItem({ id: 'a', platform: 'x', status: 'pending' })];

  const first = await processQueue(items, resolver, { now: '2026-06-21T00:00:00.000Z', baseDelayMs: 60_000 });
  assert.equal(first.result.retryScheduled, 1);
  assert.equal(first.items[0]!.status, 'failed_retry');
  assert.equal(first.items[0]!.attempts, 1);
  assert.equal(first.items[0]!.nextAttemptAt, '2026-06-21T00:01:00.000Z');

  // time passes, second run succeeds
  const second = await processQueue(first.items, resolver, { now: '2026-06-21T00:01:30.000Z' });
  assert.equal(second.result.posted, 1);
  assert.equal(second.items[0]!.status, 'posted');
  assert.equal(second.items[0]!.postId, 'p-2');
});

void test('processQueue: respects limit option', async () => {
  const items: QueueItem[] = [
    makeItem({ id: 'a', platform: 'x', nextAttemptAt: '2026-06-21T00:00:00.000Z' }),
    makeItem({ id: 'b', platform: 'x', nextAttemptAt: '2026-06-21T00:00:00.000Z' }),
    makeItem({ id: 'c', platform: 'x', nextAttemptAt: '2026-06-21T00:00:00.000Z' }),
  ];
  let called = 0;
  const channel: QueueChannelLike = {
    async post(): Promise<PostRecord> {
      called += 1;
      return { platform: 'x', postId: `p-${called}`, status: 'posted', url: '' };
    },
  };
  const resolver: ChannelResolver = { resolve: () => channel };
  const { result } = await processQueue(items, resolver, { now: '2026-06-21T00:00:00.000Z', limit: 2 });
  assert.equal(called, 2);
  assert.equal(result.processed, 2);
});

void test('processQueue: untouched items are preserved verbatim', async () => {
  const items: QueueItem[] = [
    makeItem({ id: 'a', platform: 'x', status: 'pending', nextAttemptAt: '2026-06-22T00:00:00.000Z' }),
    makeItem({ id: 'b', platform: 'x', status: 'pending' }),
  ];
  const channel: QueueChannelLike = {
    async post(): Promise<PostRecord> { return { platform: 'x', postId: 'p', status: 'posted' }; },
  };
  const { items: next } = await processQueue(items, { resolve: () => channel }, { now: '2026-06-21T00:00:00.000Z' });
  // a is in the future → not touched
  assert.equal(next.find((i) => i.id === 'a')!.nextAttemptAt, '2026-06-22T00:00:00.000Z');
  // b is posted now
  assert.equal(next.find((i) => i.id === 'b')!.status, 'posted');
});

void test('projectToPostRecords: maps status to PostRecord', () => {
  const items: QueueItem[] = [
    makeItem({ id: 'a', status: 'posted', postId: 'p-1', url: 'https://x.x/p/1', postedAt: '2026-06-21T00:00:01.000Z', platform: 'x' }),
    makeItem({ id: 'b', status: 'failed_dead', lastError: 'oops', postedAt: '2026-06-21T00:00:01.000Z', platform: 'x' }),
    makeItem({ id: 'c', status: 'pending', platform: 'x' }),
    makeItem({ id: 'd', status: 'failed_retry', platform: 'x' }),
  ];
  const out = projectToPostRecords(items);
  assert.equal(out[0]!.status, 'posted');
  assert.equal(out[0]!.postId, 'p-1');
  assert.equal(out[1]!.status, 'failed');
  assert.equal(out[1]!.error, 'oops');
  assert.equal(out[2]!.status, 'queued');
  assert.equal(out[3]!.status, 'queued');
});

void test('processQueue: empty queue short-circuits to zero counts', async () => {
  const resolver: ChannelResolver = { resolve: () => null };
  const { items, result } = await processQueue([], resolver);
  assert.deepEqual(items, []);
  assert.equal(result.processed, 0);
  assert.equal(result.posted, 0);
});

void test('DEFAULT_BASE_DELAY_MS is 1 minute', () => {
  assert.equal(DEFAULT_BASE_DELAY_MS, 60_000);
});
