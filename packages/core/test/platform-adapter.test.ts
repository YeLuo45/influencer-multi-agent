import { test } from 'node:test';
import assert from 'node:assert/strict';
import { adaptForPlatform, adaptForAllPlatforms, PLATFORM_CONSTRAINTS } from '../src/platform-adapter.js';

void test('PLATFORM_CONSTRAINTS: all 5 platforms defined', () => {
  assert.equal(Object.keys(PLATFORM_CONSTRAINTS).length, 5);
  for (const p of ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit'] as const) {
    assert.ok(PLATFORM_CONSTRAINTS[p]);
  }
});

void test('adaptForPlatform: x truncates to 280', () => {
  const out = adaptForPlatform({
    title: 'A'.repeat(200),
    body: 'B'.repeat(500),
    tags: ['t1', 't2', 't3', 't4'],
    platform: 'x',
  });
  assert.ok(out.body.length <= 280);
  assert.equal(out.tags.length, 3);
});

void test('adaptForPlatform: xiaohongshu adds emoji and prefix', () => {
  const out = adaptForPlatform({
    title: '好物分享',
    body: '内容',
    tags: ['种草'],
    platform: 'xiaohongshu',
  });
  assert.match(out.body, /姐妹们/);
  assert.match(out.body, /🌟/);
  assert.match(out.body, /❤️/);
  assert.match(out.body, /#种草/);
});

void test('adaptForPlatform: weibo leads with title', () => {
  const out = adaptForPlatform({
    title: '震惊！',
    body: 'X'.repeat(3000),
    tags: ['热点'],
    platform: 'weibo',
  });
  assert.ok(out.body.startsWith('震惊！'));
  assert.ok(out.body.length <= 2000);
});

void test('adaptForPlatform: bilibili adds 3-section format', () => {
  const out = adaptForPlatform({
    title: 'B站测试',
    body: '核心观点',
    tags: ['科技'],
    platform: 'bilibili',
  });
  assert.match(out.body, /【B站测试】/);
  assert.match(out.body, /▎核心观点/);
  assert.match(out.body, /▎互动/);
});

void test('adaptForPlatform: reddit preserves long body', () => {
  const longBody = 'X'.repeat(10000);
  const out = adaptForPlatform({
    title: 'Discussion',
    body: longBody,
    tags: ['a', 'b'],
    platform: 'reddit',
  });
  assert.equal(out.body.length, longBody.length);
  assert.match(out.cta, /think/i);
});

void test('adaptForAllPlatforms: returns all 5', () => {
  const out = adaptForAllPlatforms({
    title: 'X',
    body: 'Y',
    tags: ['t'],
    platforms: ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit'],
  });
  assert.equal(Object.keys(out).length, 5);
  for (const p of ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit'] as const) {
    assert.ok(out[p]);
  }
});

void test('adaptForPlatform: never exceeds maxLength', () => {
  for (const p of ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit'] as const) {
    const out = adaptForPlatform({
      title: 'T'.repeat(1000),
      body: 'B'.repeat(50000),
      tags: ['a', 'b', 'c', 'd', 'e', 'f'],
      platform: p,
    });
    const max = PLATFORM_CONSTRAINTS[p].maxLength;
    assert.ok(out.body.length <= max + 3, `${p}: body ${out.body.length} > max ${max}`);
  }
});

void test('adaptForPlatform: x truncates with ellipsis when over', () => {
  const out = adaptForPlatform({
    title: 't',
    body: 'X'.repeat(500),
    tags: [],
    platform: 'x',
  });
  assert.match(out.body, /\.\.\.$/);
});

void test('adaptForPlatform: xiaohongshu keeps 5 tags', () => {
  const out = adaptForPlatform({
    title: 't',
    body: 'b',
    tags: ['a', 'b', 'c', 'd', 'e'],
    platform: 'xiaohongshu',
  });
  assert.equal(out.tags.length, 5);
});

void test('adaptForPlatform: empty tags works', () => {
  const out = adaptForPlatform({
    title: 't',
    body: 'b',
    tags: [],
    platform: 'x',
  });
  assert.equal(out.tags.length, 0);
  assert.ok(out.body.length > 0);
});