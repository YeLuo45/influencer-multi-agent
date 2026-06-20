import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deriveScore, aggregate } from '../src/engagement.js';

test('deriveScore: zeros yields 0', () => {
  assert.equal(deriveScore({ platform: 'x', postId: 'p', likes: 0, comments: 0, shares: 0, views: 0, fetchedAt: '' }), 0);
});

test('deriveScore: weighted formula', () => {
  const s = deriveScore({ platform: 'x', postId: 'p', likes: 100, comments: 0, shares: 0, views: 0, fetchedAt: '' });
  // log1p(100) ≈ 4.615
  assert.ok(s > 4.5 && s < 4.7, `got ${s}`);
});

test('deriveScore: comments weight more than likes', () => {
  const likes = deriveScore({ platform: 'x', postId: 'p', likes: 10, comments: 0, shares: 0, views: 0, fetchedAt: '' });
  const comments = deriveScore({ platform: 'x', postId: 'p', likes: 0, comments: 10, shares: 0, views: 0, fetchedAt: '' });
  assert.ok(comments > likes, `${comments} should > ${likes}`);
});

test('aggregate: sums multiple metrics', () => {
  const out = aggregate([
    { platform: 'x', postId: 'a', likes: 10, comments: 1, shares: 0, views: 100, fetchedAt: '' },
    { platform: 'x', postId: 'b', likes: 5, comments: 2, shares: 1, views: 50, fetchedAt: '' },
  ]);
  assert.equal(out.totalLikes, 15);
  assert.equal(out.totalComments, 3);
  assert.equal(out.totalShares, 1);
  assert.equal(out.totalViews, 150);
  assert.ok(out.derivedScore > 0);
});

test('aggregate: empty input yields zeros', () => {
  const out = aggregate([]);
  assert.equal(out.totalLikes, 0);
  assert.equal(out.totalComments, 0);
  assert.equal(out.totalShares, 0);
  assert.equal(out.totalViews, 0);
  assert.equal(out.derivedScore, 0);
});