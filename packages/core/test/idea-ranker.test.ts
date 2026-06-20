import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IdeaRanker } from '../src/idea-ranker.js';
import type { EngagementMetric } from '../src/types.js';

function mk(likes: number, comments = 0, shares = 0, views = 100): EngagementMetric {
  return {
    platform: 'x',
    postId: `p-${Math.random()}`,
    likes,
    comments,
    shares,
    views,
    fetchedAt: '2026-06-20T00:00:00Z',
  };
}

test('ranker: empty history does not change order', () => {
  const r = new IdeaRanker();
  const ideas = [{ angle: 'A', score: 0.5 }, { angle: 'B', score: 0.7 }];
  const out = r.rank(ideas, [], () => null);
  assert.equal(out[0]!.angle, 'B');
  assert.equal(out[1]!.angle, 'A');
});

test('ranker: high-perf angle gets boosted', () => {
  const r = new IdeaRanker({ historyBoost: 1.0 });
  const ideas = [
    { angle: 'A', score: 0.5 },
    { angle: 'B', score: 0.7 },
  ];
  const history = [mk(5000, 500, 100), mk(4500, 450, 90)];
  // angle A has historical high engagement
  const out = r.rank(ideas, history, (m) => (m.likes > 500 ? 'A' : null));
  assert.equal(out[0]!.angle, 'A', `expected A first, got ${out[0]!.angle}`);
});

test('ranker: result is sorted by adjusted score desc', () => {
  const r = new IdeaRanker();
  const ideas = [{ angle: 'X', score: 0.1 }, { angle: 'Y', score: 0.5 }, { angle: 'Z', score: 0.3 }];
  const out = r.rank(ideas, [], () => null);
  assert.equal(out[0]!.angle, 'Y');
  assert.equal(out[1]!.angle, 'Z');
  assert.equal(out[2]!.angle, 'X');
});

test('ranker: performance buckets group by angle', () => {
  const r = new IdeaRanker();
  const history = [mk(50), mk(150), mk(250)];
  const perf = r.performanceByAngle(history, (m) => `angle-${Math.floor(m.likes / 100)}`);
  assert.equal(perf.size, 3);
  assert.ok(perf.has('angle-0'));
  assert.ok(perf.has('angle-1'));
  assert.ok(perf.has('angle-2'));
});

test('ranker: filtered out angles are not in performance map', () => {
  const r = new IdeaRanker();
  const perf = r.performanceByAngle([mk(100), mk(200)], () => null);
  assert.equal(perf.size, 0);
});

test('ranker: minSampleSize blocks boost when not enough samples', () => {
  const r = new IdeaRanker({ historyBoost: 0.5, minSampleSize: 3 });
  const ideas = [{ angle: 'A', score: 0.5 }, { angle: 'B', score: 0.7 }];
  const history = [mk(1000), mk(900)]; // only 2 samples for A
  const out = r.rank(ideas, history, () => 'A');
  assert.equal(out[0]!.angle, 'B'); // B still wins because A doesn't have enough samples
});

test('ranker: clamps output score to [0, 1]', () => {
  const r = new IdeaRanker({ historyBoost: 5 });
  const ideas = [{ angle: 'A', score: 1 }];
  const history = [mk(1e6, 1e6, 1e6)];
  const out = r.rank(ideas, history, () => 'A');
  assert.ok(out[0]!.score <= 1, `score ${out[0]!.score} > 1`);
});