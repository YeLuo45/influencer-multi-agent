import { test } from 'node:test';
import assert from 'node:assert/strict';
import { channelHealthCheck, summarizeChannelHealth, type ChannelHealth } from '../src/channel-test.js';

void test('channel-test: channelHealthCheck() reports ok=false when credential is missing', async () => {
  const r: ChannelHealth = await channelHealthCheck('x', { credential: undefined, envKey: 'IMA_X_TOKEN', fetchImpl: (async () => new Response('{}', { status: 200 })) as unknown as typeof fetch });
  assert.equal(r.platform, 'x');
  assert.equal(r.ok, false);
  assert.match(r.detail, /credential/i);
  assert.equal(r.skippedReason, 'auth');
});

void test('channel-test: channelHealthCheck() pings the platform when credential is present', async () => {
  let calledUrl = '';
  const r: ChannelHealth = await channelHealthCheck('x', {
    credential: 'sk-test',
    envKey: 'IMA_X_TOKEN',
    fetchImpl: (async (input: unknown) => {
      calledUrl = String(input);
      return new Response(JSON.stringify({ data: { id: 'u-1' } }), { status: 200 });
    }) as unknown as typeof fetch,
  });
  assert.equal(r.ok, true);
  assert.match(r.detail, /u-1/);
  assert.match(calledUrl, /api\.twitter\.com\/2\/users\/me/);
});

void test('channel-test: channelHealthCheck() returns ok=false on 401', async () => {
  const r = await channelHealthCheck('x', {
    credential: 'sk-test',
    envKey: 'IMA_X_TOKEN',
    fetchImpl: (async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch,
  });
  assert.equal(r.ok, false);
  assert.equal(r.status, 401);
});

void test('channel-test: channelHealthCheck() returns ok=false on 5xx with retryable=true', async () => {
  const r = await channelHealthCheck('reddit', {
    credential: 'secret',
    envKey: 'IMA_REDDIT_CLIENT_SECRET',
    fetchImpl: (async () => new Response('boom', { status: 503 })) as unknown as typeof fetch,
  });
  assert.equal(r.ok, false);
  assert.equal(r.retryable, true);
});

void test('channel-test: summarizeChannelHealth() reports overall counts and per-platform rows', () => {
  const rows: ChannelHealth[] = [
    { platform: 'x', ok: true, detail: 'user u-1', latencyMs: 100, status: 200 },
    { platform: 'x', ok: false, detail: 'auth', latencyMs: 0, skippedReason: 'auth' },
    { platform: 'reddit', ok: false, detail: 'boom', latencyMs: 50, status: 503, retryable: true },
  ];
  const s = summarizeChannelHealth(rows);
  assert.equal(s.total, 3);
  assert.equal(s.okCount, 1);
  assert.equal(s.failCount, 2);
  assert.equal(s.retryableCount, 1);
});
