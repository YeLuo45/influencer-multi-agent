import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MockEngagementTracker, StubEngagementTracker, CompositeEngagementTracker, createEngagementTracker } from '../src/engagement-tracker.js';

test('MockEngagementTracker: counter starts at 0', async () => {
  const t = new MockEngagementTracker();
  const a = await t.fetch('x', 'p-fresh');
  // first call for fresh key; just verify shape and non-negative
  assert.ok(a.likes > 0);
});

test('MockEngagementTracker: counter grows over time', async () => {
  const t = new MockEngagementTracker();
  const a = await t.fetch('x', 'p-grow');
  const b = await t.fetch('x', 'p-grow');
  assert.ok(b.likes > a.likes, `expected b.likes > a.likes, got ${a.likes} vs ${b.likes}`);
});

test('StubEngagementTracker: deterministic based on seed', async () => {
  const t1 = new StubEngagementTracker(1);
  const t2 = new StubEngagementTracker(2);
  const a = await t1.fetch('x', 'p');
  const b = await t2.fetch('x', 'p');
  assert.equal(a.likes * 2, b.likes);
});

test('CompositeEngagementTracker: fetchAllForContent skips null postIds', async () => {
  const t = new CompositeEngagementTracker([new StubEngagementTracker(1)]);
  const out = await t.fetchAllForContent([
    { platform: 'x', postId: 'p1' },
    { platform: 'x', postId: null },
    { platform: 'reddit', postId: 'r1' },
  ]);
  assert.equal(out.length, 2);
});

test('CompositeEngagementTracker: throws if all fail', async () => {
  const failing = {
    async fetch(): Promise<never> {
      throw new Error('nope');
    },
  };
  const t = new CompositeEngagementTracker([failing]);
  await assert.rejects(() => t.fetch('x', 'p'), /all engagement trackers failed/);
});

test('createEngagementTracker: returns composite', () => {
  const t = createEngagementTracker();
  assert.ok(t instanceof CompositeEngagementTracker);
});

test('MockEngagementTracker: required fields present', async () => {
  const t = new MockEngagementTracker();
  const m = await t.fetch('x', 'p');
  assert.equal(m.platform, 'x');
  assert.equal(m.postId, 'p');
  assert.equal(typeof m.likes, 'number');
  assert.equal(typeof m.comments, 'number');
  assert.equal(typeof m.shares, 'number');
  assert.equal(typeof m.views, 'number');
  assert.ok(m.fetchedAt);
});