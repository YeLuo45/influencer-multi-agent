import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublishAgent } from '../src/agents/publish.js';
import { createContent } from '../src/types.js';
import type { AgentContext } from '../src/protocol.js';
import type { PlatformId, PostRecord } from '../src/types.js';
import type { QueueItem } from '../src/publish-queue.js';

function contentForPlatforms(platforms: PlatformId[]) {
  const content = createContent({ id: 'c-rate', topic: 'rate limit' });
  content.draft = { title: 'T', body: 'B', tags: ['ai'], coverHint: '', cta: '', platformOverrides: {} };
  content.ideas = [{ id: 'i1', angle: 'a', hook: 'h', targetPlatform: platforms, score: 0.9 }];
  return content;
}

void test('PublishAgent: rate limiter blocks saturated platform before posting and queues retry', async () => {
  const sinkCalls: QueueItem[] = [];
  const posted: PlatformId[] = [];
  const ctx: AgentContext = {
    llm: { async complete() { return ''; } },
    crawler: { async fetch() { return { url: '', title: '', markdown: '' }; } },
    publisher: {
      async post(platform: PlatformId): Promise<PostRecord> {
        posted.push(platform);
        return { platform, postId: `${platform}-1`, status: 'posted' };
      },
      async healthCheck() { return { ok: true, detail: 'mock' }; },
    },
    queueSink: async (item) => { sinkCalls.push(item); },
    rateLimiter: {
      tryAcquire: (key: string) => key !== 'publish:x',
      reset: () => undefined,
      getStats: () => ({ capacity: 1, remaining: 0 }),
    },
    now: () => '2026-06-23T00:00:00.000Z',
  } as AgentContext;

  const result = await new PublishAgent().run(undefined, contentForPlatforms(['x', 'reddit']), ctx);

  assert.equal(result.kind, 'ok');
  assert.deepEqual(posted, ['reddit']);
  const blocked = sinkCalls.find((item) => item.platform === 'x');
  assert.equal(blocked?.status, 'failed_retry');
  assert.match(blocked?.lastError ?? '', /rate limit/i);
  if (result.kind === 'ok') {
    const x = result.data.find((post) => post.platform === 'x');
    assert.equal(x?.status, 'failed');
    assert.match(x?.error ?? '', /rate limit/i);
  }
});

void test('PublishAgent: all platforms rate limited returns recoverable error', async () => {
  const ctx: AgentContext = {
    llm: { async complete() { return ''; } },
    crawler: { async fetch() { return { url: '', title: '', markdown: '' }; } },
    publisher: {
      async post(): Promise<PostRecord> { throw new Error('should not post'); },
      async healthCheck() { return { ok: true, detail: 'mock' }; },
    },
    queueSink: async () => undefined,
    rateLimiter: {
      tryAcquire: () => false,
      reset: () => undefined,
      getStats: () => ({ capacity: 1, remaining: 0 }),
    },
    now: () => '2026-06-23T00:00:00.000Z',
  } as AgentContext;

  const result = await new PublishAgent().run(undefined, contentForPlatforms(['x']), ctx);

  assert.equal(result.kind, 'error');
  if (result.kind === 'error') {
    assert.match(result.message, /all platforms failed/i);
    assert.equal(result.recoverable, false);
  }
});
