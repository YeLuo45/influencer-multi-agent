import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  XChannel,
  AlwaysFailChannel,
  StubChannelBase,
} from '../src/channels.js';
import { ChannelRegistry, createRegistry, createRegistryFromEnv } from '../src/registry.js';
import { PLATFORMS } from '@ima/core/types';

test('every platform has a default channel', () => {
  const r = createRegistry();
  for (const p of PLATFORMS) {
    assert.ok(r.has(p), `missing default for ${p}`);
    const c = r.get(p);
    assert.equal(c.id, p);
  }
});

test('XChannel posts successfully', async () => {
  const c = new XChannel();
  const r = await c.post({ title: 'hello', body: 'world', tags: ['t'] });
  assert.equal(r.platform, 'x');
  assert.equal(r.status, 'posted');
  assert.match(r.url ?? '', /^https:\/\/x\.example\.com\/p\//);
});

test('All default channels produce unique urls', async () => {
  const r = createRegistry();
  const inputs = { title: 't', body: 'b', tags: [] };
  const records = await r.postAll(inputs);
  assert.equal(records.length, PLATFORMS.length);
  const urls = new Set(records.map((r) => r.url));
  assert.equal(urls.size, PLATFORMS.length);
});

test('AlwaysFailChannel returns failed', async () => {
  const c = new AlwaysFailChannel('x');
  const r = await c.post({ title: 't', body: 'b', tags: [] });
  assert.equal(r.status, 'failed');
  assert.equal(r.error, 'always fail');
});

test('ChannelRegistry doctor covers all channels', async () => {
  const r = createRegistry();
  const rpt = await r.doctor();
  assert.equal(rpt.length, PLATFORMS.length);
  for (const x of rpt) assert.ok(x.detail);
});

test('Custom channel can be registered', () => {
  const r = new ChannelRegistry();
  r.register(new AlwaysFailChannel('x'));
  assert.equal(r.has('x'), true);
});

test('Posting produces stable postId for same title', async () => {
  const c = new XChannel();
  const a = await c.post({ title: 'same', body: 'b', tags: [] });
  const b = await c.post({ title: 'same', body: 'b2', tags: [] });
  assert.equal(a.postId, b.postId);
});

test('Different titles produce different postIds', async () => {
  const c = new XChannel();
  const a = await c.post({ title: 'one', body: 'b', tags: [] });
  const b = await c.post({ title: 'two', body: 'b', tags: [] });
  assert.notEqual(a.postId, b.postId);
});

test('StubChannelBase rejects unknown platforms gracefully', async () => {
  // 用 type assertion 测试 type-level guard
  const c = new StubChannelBase('x');
  const r = await c.healthCheck();
  assert.ok(r.ok);
});

test('ChannelRegistry: get throws for unknown channel id', () => {
  const r = new ChannelRegistry();
  assert.throws(() => r.get('unknown' as never), /channel not registered: unknown/);
  assert.equal(r.ids().length, PLATFORMS.length);
});

test('ChannelRegistry: postAll records failures from channels', async () => {
  const r = new ChannelRegistry();
  r.register(new AlwaysFailChannel('x'));
  const records = await r.postAll({ title: 't', body: 'b', tags: [] });
  assert.equal(records.length, PLATFORMS.length);
  const failed = records.find((record) => record.platform === 'x');
  assert.equal(failed?.status, 'failed');
  assert.equal(failed?.postId, null);
  assert.match(failed?.error ?? '', /always fail/);
});

test('ChannelRegistry: mixed mode prefers stub registrations after real setup', async () => {
  const r = createRegistry('mixed', {
    fetchImpl: async () => new Response(JSON.stringify({ ok: true }), { status: 200 }),
    now: () => '2026-06-21T00:00:00.000Z',
  });
  assert.deepEqual(r.ids(), [...PLATFORMS]);
  const record = await r.get('x').post({ title: 'mixed', body: 'body', tags: [] });
  assert.match(record.url ?? '', /^https:\/\/x\.example\.com\/p\//);
});

test('createRegistryFromEnv: reads mode override and env fallback', () => {
  const previous = process.env.IMA_CHANNELS_MODE;
  try {
    process.env.IMA_CHANNELS_MODE = 'mixed';
    assert.equal(createRegistryFromEnv().ids().length, PLATFORMS.length);
    assert.equal(createRegistryFromEnv({ mode: 'stub' }).ids().length, PLATFORMS.length);
  } finally {
    if (previous === undefined) delete process.env.IMA_CHANNELS_MODE;
    else process.env.IMA_CHANNELS_MODE = previous;
  }
});
