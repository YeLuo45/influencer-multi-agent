import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PublishAgent } from '../src/agents/publish.js';
import { createContent } from '../src/types.js';
import type { AgentContext } from '../src/protocol.js';
import type { PlatformId, PostRecord, PostInput } from '../src/types.js';
import type { QueueItem } from '../src/publish-queue.js';

function makeCtx(opts: {
  posts?: Map<PlatformId, PostRecord | Error>;
  sink?: (item: QueueItem) => Promise<void>;
} = {}): AgentContext & { sinkCalls: QueueItem[] } {
  const sinkCalls: QueueItem[] = [];
  return {
    llm: { async complete() { return ''; } },
    crawler: { async fetch() { return { url: '', title: '', markdown: '' }; } },
    publisher: {
      async post(platform: PlatformId, _content: { title: string; body: string; tags: string[] }): Promise<PostRecord> {
        const entry = opts.posts?.get(platform);
        if (!entry) throw new Error(`no mock for ${platform}`);
        if (entry instanceof Error) throw entry;
        return entry;
      },
      async healthCheck() { return { ok: true, detail: 'mock' }; },
    },
    queueSink: opts.sink ?? (async (it) => { sinkCalls.push(it); }),
    now: () => '2026-06-21T00:00:00.000Z',
    sinkCalls,
  } as AgentContext & { sinkCalls: QueueItem[] };
}

void test('PublishAgent: missing draft returns recoverable error', async () => {
  const agent = new PublishAgent();
  const ctx = makeCtx();
  const c = createContent({ id: 'c-1', topic: 't' });
  const r = await agent.run(undefined, c, ctx);
  assert.equal(r.kind, 'error');
  if (r.kind === 'error') {
    assert.equal(r.message, 'draft missing');
    assert.equal(r.recoverable, true);
  }
});

void test('PublishAgent: writes one queue item per platform via sink (success path)', async () => {
  const posts = new Map<PlatformId, PostRecord | Error>([
    ['x', { platform: 'x', postId: 'x-1', status: 'posted', url: 'https://x.x/p/1' }],
    ['xiaohongshu', { platform: 'xiaohongshu', postId: 'xhs-1', status: 'posted' }],
  ]);
  const ctx = makeCtx({ posts });
  const agent = new PublishAgent();
  const c = createContent({ id: 'c-2', topic: 'AI Agent', now: '2026-06-21T00:00:00.000Z' });
  c.draft = { title: 'T', body: 'B', tags: ['#a'], coverHint: '', cta: '', platformOverrides: {} };
  c.ideas = [{ id: 'i1', angle: 'a', hook: 'h', targetPlatform: ['x', 'xiaohongshu'], score: 0.8 }];

  const r = await agent.run(undefined, c, ctx);
  assert.equal(r.kind, 'ok');
  assert.equal(ctx.sinkCalls.length, 2);
  for (const it of ctx.sinkCalls) {
    assert.equal(it.status, 'posted');
    assert.ok(it.postId);
  }
  assert.equal(ctx.sinkCalls[0]!.platform, 'x');
  assert.equal(ctx.sinkCalls[1]!.platform, 'xiaohongshu');
});

void test('PublishAgent: writes failed_retry item when post throws (partial failure keeps ok)', async () => {
  const posts = new Map<PlatformId, PostRecord | Error>([
    ['x', new Error('503 service unavailable')],
    ['xiaohongshu', { platform: 'xiaohongshu', postId: 'xhs-1', status: 'posted' }],
  ]);
  const ctx = makeCtx({ posts });
  const agent = new PublishAgent();
  const c = createContent({ id: 'c-3', topic: 't' });
  c.draft = { title: 'T', body: 'B', tags: [], coverHint: '', cta: '', platformOverrides: {} };
  c.ideas = [{ id: 'i1', angle: 'a', hook: 'h', targetPlatform: ['x', 'xiaohongshu'], score: 0.8 }];

  const r = await agent.run(undefined, c, ctx);
  assert.equal(r.kind, 'ok');
  assert.equal(ctx.sinkCalls.length, 2);
  const x = ctx.sinkCalls.find((i) => i.platform === 'x')!;
  const xhs = ctx.sinkCalls.find((i) => i.platform === 'xiaohongshu')!;
  assert.equal(x.status, 'failed_retry');
  assert.equal(x.attempts, 1);
  assert.match(x.lastError ?? '', /503/);
  assert.equal(xhs.status, 'posted');
});

void test('PublishAgent: queueSink failure does not mask post failure', async () => {
  const posts = new Map<PlatformId, PostRecord | Error>([
    ['x', new Error('rate limited')],
    ['xiaohongshu', { platform: 'xiaohongshu', postId: 'xhs-1', status: 'posted' }],
  ]);
  const ctx = makeCtx({
    posts,
    sink: async () => { throw new Error('disk full'); },
  });
  const agent = new PublishAgent();
  const c = createContent({ id: 'c-4', topic: 't' });
  c.draft = { title: 'T', body: 'B', tags: [], coverHint: '', cta: '', platformOverrides: {} };
  c.ideas = [{ id: 'i1', angle: 'a', hook: 'h', targetPlatform: ['x', 'xiaohongshu'], score: 0.8 }];

  const r = await agent.run(undefined, c, ctx);
  assert.equal(r.kind, 'ok');
  if (r.kind === 'ok') {
    const x = r.data.find((p) => p.platform === 'x')!;
    assert.equal(x.status, 'failed');
    assert.match(x.error ?? '', /rate limited/);
  }
});

void test('PublishAgent: works without queueSink (backward compatible)', async () => {
  const posts = new Map<PlatformId, PostRecord | Error>([
    ['x', { platform: 'x', postId: 'x-1', status: 'posted' }],
  ]);
  const ctx = makeCtx({ posts });
  // strip the sink entirely
  const ctxNoSink: AgentContext = { ...ctx, queueSink: undefined };
  const agent = new PublishAgent();
  const c = createContent({ id: 'c-5', topic: 't' });
  c.draft = { title: 'T', body: 'B', tags: [], coverHint: '', cta: '', platformOverrides: {} };
  c.ideas = [{ id: 'i1', angle: 'a', hook: 'h', targetPlatform: ['x'], score: 0.8 }];

  const r = await agent.run(undefined, c, ctxNoSink);
  assert.equal(r.kind, 'ok');
  if (r.kind === 'ok') assert.equal(r.data[0]!.postId, 'x-1');
});
