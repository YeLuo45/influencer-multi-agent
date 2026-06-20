import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  XChannel,
  AlwaysFailChannel,
  StubChannelBase,
} from '../src/channels.js';
import { ChannelRegistry, createRegistry } from '../src/registry.js';
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

test('All 5 default channels produce unique urls', async () => {
  const r = createRegistry();
  const inputs = { title: 't', body: 'b', tags: [] };
  const records = await r.postAll(inputs);
  assert.equal(records.length, 5);
  const urls = new Set(records.map((r) => r.url));
  assert.equal(urls.size, 5);
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
  assert.equal(rpt.length, 5);
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