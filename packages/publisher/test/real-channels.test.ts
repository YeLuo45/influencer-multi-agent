import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  RealXChannel,
  RealXhsChannel,
  RealBilibiliChannel,
  RealWeiboChannel,
  RealRedditChannel,
  RealYoutubeChannel,
  ChannelAuthError,
  ChannelHttpError,
  createRealChannel,
  envKeyFor,
  summarizeChannel,
} from '../src/real-channels.js';
import type { PostInput } from '../src/channels.js';

function mkFetch(opts: { status?: number; body?: unknown } = {}): typeof fetch {
  const status = opts.status ?? 200;
  const body = opts.body ?? { data: { id: 'p-1' } };
  return (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
}

function mkInput(): PostInput {
  return { title: 'T', body: 'B', tags: ['#a'] };
}

const STUB_NOW = (): string => '2026-06-21T00:00:00.000Z';
const CLEAN_ENV_KEYS = ['IMA_X_BEARER_TOKEN', 'IMA_XHS_COOKIE', 'IMA_WEIBO_COOKIE', 'IMA_BILIBILI_COOKIE', 'IMA_REDDIT_CREDENTIAL', 'IMA_YOUTUBE_OAUTH', 'IMA_REDDIT_CLIENT_ID', 'IMA_REDDIT_CLIENT_SECRET'] as const;
function withCleanEnv<T>(fn: () => T): T {
  const saved: Record<string, string | undefined> = {};
  for (const k of CLEAN_ENV_KEYS) {
    saved[k] = process.env[k];
    delete process.env[k];
  }
  try { return fn(); } finally {
    for (const k of CLEAN_ENV_KEYS) {
      if (saved[k] !== undefined) process.env[k] = saved[k];
      else delete process.env[k];
    }
  }
}

void test('envKeyFor: returns per-platform env variable name', () => {
  assert.equal(envKeyFor('x'), 'IMA_X_BEARER_TOKEN');
  assert.equal(envKeyFor('xiaohongshu'), 'IMA_XHS_COOKIE');
  assert.equal(envKeyFor('bilibili'), 'IMA_BILIBILI_COOKIE');
  assert.equal(envKeyFor('youtube'), 'IMA_YOUTUBE_OAUTH');
  assert.equal(envKeyFor('reddit'), 'IMA_REDDIT_CREDENTIAL');
  assert.equal(envKeyFor('weibo'), 'IMA_WEIBO_COOKIE');
});

void test('summarizeChannel: reports credential presence (offline)', () => withCleanEnv(() => {
  assert.equal(summarizeChannel('x', 'real').hasCredential, false);
  process.env['IMA_X_BEARER_TOKEN'] = 'tok';
  assert.equal(summarizeChannel('x', 'real').hasCredential, true);
  delete process.env['IMA_X_BEARER_TOKEN'];
  // reddit accepts either single credential or split client_id/secret
  process.env['IMA_REDDIT_CLIENT_ID'] = 'cid';
  process.env['IMA_REDDIT_CLIENT_SECRET'] = 'csec';
  assert.equal(summarizeChannel('reddit', 'real').hasCredential, true);
}));

void test('RealXChannel: throws ChannelAuthError when no token', async () => withCleanEnv(async () => {
  const ch = new RealXChannel({ envKey: 'IMA_X_BEARER_TOKEN' });
  await assert.rejects(() => ch.post(mkInput()), (e: unknown) => e instanceof ChannelAuthError && e.platform === 'x');
}));

void test('RealXChannel: posts via mock fetch', async () => withCleanEnv(async () => {
  const ch = new RealXChannel({ envKey: 'IMA_X_BEARER_TOKEN', credential: 'tok', fetchImpl: mkFetch({ body: { data: { id: 'x-1', text: 't' } } }), now: STUB_NOW });
  const r = await ch.post(mkInput());
  assert.equal(r.platform, 'x');
  assert.equal(r.status, 'posted');
  assert.equal(r.postId, 'x-1');
  assert.match(r.url ?? '', /\/x-1$/);
  assert.equal(r.postedAt, '2026-06-21T00:00:00.000Z');
}));

void test('RealXhsChannel: throws when no cookie', async () => withCleanEnv(async () => {
  const ch = new RealXhsChannel({ envKey: 'IMA_XHS_COOKIE' });
  await assert.rejects(() => ch.post(mkInput()), (e: unknown) => e instanceof ChannelAuthError && e.envKey === 'IMA_XHS_COOKIE');
}));

void test('RealBilibiliChannel: posts via mock fetch', async () => withCleanEnv(async () => {
  const ch = new RealBilibiliChannel({ envKey: 'IMA_BILIBILI_COOKIE', credential: 'sess=jct', fetchImpl: mkFetch({ body: { data: { id: 12345 } } }) });
  const r = await ch.post(mkInput());
  assert.equal(r.platform, 'bilibili');
  assert.equal(r.status, 'posted');
  assert.equal(r.postId, '12345');
  assert.match(r.url ?? '', /cv12345$/);
}));

void test('RealWeiboChannel: posts via mock fetch', async () => withCleanEnv(async () => {
  const ch = new RealWeiboChannel({ envKey: 'IMA_WEIBO_COOKIE', credential: 'SUB=...', fetchImpl: mkFetch({ body: { data: { idstr: 'w-1' } } }) });
  const r = await ch.post(mkInput());
  assert.equal(r.platform, 'weibo');
  assert.equal(r.url ?? '', 'https://m.weibo.cn/status/w-1');
}));

void test('RealRedditChannel: posts via single credential', async () => withCleanEnv(async () => {
  const ch = new RealRedditChannel({ envKey: 'IMA_REDDIT_CREDENTIAL', credential: 'cid:csec', fetchImpl: mkFetch({ body: { json: { data: { id: 'r-1', url: 'https://reddit.com/r/test/comments/r-1' } } } }) });
  const r = await ch.post(mkInput());
  assert.equal(r.platform, 'reddit');
  assert.equal(r.postId, 'r-1');
  assert.equal(r.url, 'https://reddit.com/r/test/comments/r-1');
}));

void test('RealRedditChannel: falls back to client_id + client_secret split', async () => withCleanEnv(async () => {
  process.env['IMA_REDDIT_CLIENT_ID'] = 'cid';
  process.env['IMA_REDDIT_CLIENT_SECRET'] = 'csec';
  const ch = new RealRedditChannel({ envKey: 'IMA_REDDIT_CREDENTIAL', fetchImpl: mkFetch({ body: { json: { data: { id: 'r-2' } } } }) });
  assert.equal(ch.hasCredential(), true);
  const r = await ch.post(mkInput());
  assert.equal(r.postId, 'r-2');
}));

void test('RealYoutubeChannel: posts via mock fetch', async () => withCleanEnv(async () => {
  const ch = new RealYoutubeChannel({ envKey: 'IMA_YOUTUBE_OAUTH', credential: 'yt-tok', fetchImpl: mkFetch({ body: { id: 'yt-1' } }) });
  const r = await ch.post(mkInput());
  assert.equal(r.platform, 'youtube');
  assert.equal(r.postId, 'yt-1');
  assert.equal(r.url, 'https://youtu.be/yt-1');
}));

void test('ChannelHttpError: surfaces 4xx with body snippet', async () => withCleanEnv(async () => {
  const ch = new RealXChannel({ envKey: 'IMA_X_BEARER_TOKEN', credential: 'tok', fetchImpl: mkFetch({ status: 401, body: { error: 'unauthorized' } }) });
  await assert.rejects(() => ch.post(mkInput()), (e: unknown) => e instanceof ChannelHttpError && e.status === 401);
}));

void test('createRealChannel: dispatches by platform id', () => {
  assert.equal(createRealChannel('x', { mode: 'real' }).id, 'x');
  assert.equal(createRealChannel('xiaohongshu', { mode: 'real' }).id, 'xiaohongshu');
  assert.equal(createRealChannel('weibo', { mode: 'real' }).id, 'weibo');
  assert.equal(createRealChannel('bilibili', { mode: 'real' }).id, 'bilibili');
  assert.equal(createRealChannel('reddit', { mode: 'real' }).id, 'reddit');
  assert.equal(createRealChannel('youtube', { mode: 'real' }).id, 'youtube');
});

void test('ChannelAuthError: has correct name and platform fields', () => {
  const e = new ChannelAuthError('youtube', 'IMA_YOUTUBE_OAUTH', 'custom');
  assert.equal(e.name, 'ChannelAuthError');
  assert.equal(e.platform, 'youtube');
  assert.equal(e.envKey, 'IMA_YOUTUBE_OAUTH');
  assert.equal(e.message, 'custom');
});

void test('RealXChannel.healthCheck: missing token returns ok=false', async () => withCleanEnv(async () => {
  const ch = new RealXChannel({ envKey: 'IMA_X_BEARER_TOKEN' });
  const r = await ch.healthCheck();
  assert.equal(r.ok, false);
  assert.match(r.detail, /IMA_X_BEARER_TOKEN/);
}));

void test('RealXChannel.healthCheck: with token uses /2/users/me', async () => withCleanEnv(async () => {
  let captured = '';
  const fetchImpl: typeof fetch = (async (url: string) => {
    captured = url;
    return new Response('', { status: 200 });
  }) as unknown as typeof fetch;
  const ch = new RealXChannel({ envKey: 'IMA_X_BEARER_TOKEN', credential: 'tok', fetchImpl });
  const r = await ch.healthCheck();
  assert.equal(r.ok, true);
  assert.match(captured, /\/2\/users\/me/);
}));

void test('RealYoutubeChannel.healthCheck: with token returns ok without live probe', async () => withCleanEnv(async () => {
  const ch = new RealYoutubeChannel({ envKey: 'IMA_YOUTUBE_OAUTH', credential: 'tok' });
  const r = await ch.healthCheck();
  assert.equal(r.ok, true);
}));

void test('All 6 real channels have hasCredential() that returns false when env unset', () => withCleanEnv(() => {
  for (const p of ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit', 'youtube'] as const) {
    const envKey = envKeyFor(p);
    const ch = createRealChannel(p, { mode: 'real' });
    assert.equal(ch.hasCredential(), false, `${p} should not have credential`);
    void envKey;
  }
}));
