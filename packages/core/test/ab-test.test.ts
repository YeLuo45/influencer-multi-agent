import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assignVariantTags,
  aggregateByVariant,
  selectWinner,
  buildAbReport,
  scoreForMetric,
  ideasForContent,
  variantLabelForIndex,
  DEFAULT_VARIANT_LABELS,
  type AbVariantSummary,
} from '../src/ab-test.js';
import type { EngagementMetric, Idea, PostRecord } from '../src/types.js';

function mkMetric(overrides: Partial<EngagementMetric>): EngagementMetric {
  return {
    platform: 'x',
    postId: 'p-1',
    likes: 0,
    comments: 0,
    shares: 0,
    views: 0,
    fetchedAt: '2026-06-21T00:00:00.000Z',
    ...overrides,
  };
}

void test('assignVariantTags: empty input → empty output', () => {
  assert.deepEqual(assignVariantTags([], 3), []);
});

void test('assignVariantTags: round-robins across buckets', () => {
  const out = assignVariantTags(
    [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    2,
  );
  assert.deepEqual(out.map((x) => x.variantTag), ['A', 'B', 'A', 'B']);
});

void test('assignVariantTags: variantCount < 1 throws', () => {
  assert.throws(() => assignVariantTags([{ id: 'a' }], 0));
});

void test('assignVariantTags: respects custom labels', () => {
  const out = assignVariantTags([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 3, ['red', 'blue', 'green']);
  assert.deepEqual(out.map((x) => x.variantTag), ['red', 'blue', 'green']);
});

void test('scoreForMetric: weighted formula', () => {
  // comments * 3 + shares * 2 + likes + 0.05 * views
  assert.equal(scoreForMetric(mkMetric({ comments: 1, shares: 0, likes: 0, views: 0 })), 3);
  assert.equal(scoreForMetric(mkMetric({ comments: 0, shares: 1, likes: 0, views: 0 })), 2);
  assert.equal(scoreForMetric(mkMetric({ comments: 0, shares: 0, likes: 5, views: 0 })), 5);
  assert.equal(scoreForMetric(mkMetric({ comments: 0, shares: 0, likes: 0, views: 100 })), 5);
});

void test('aggregateByVariant: empty inputs → empty result', () => {
  assert.deepEqual(aggregateByVariant([], []), []);
});

void test('aggregateByVariant: groups by variantTag from posts', () => {
  const posts: PostRecord[] = [
    { platform: 'x', postId: 'p-1', status: 'posted', variantTag: 'A' },
    { platform: 'x', postId: 'p-2', status: 'posted', variantTag: 'A' },
    { platform: 'x', postId: 'p-3', status: 'posted', variantTag: 'B' },
  ];
  const metrics: EngagementMetric[] = [
    mkMetric({ postId: 'p-1', likes: 100, comments: 10, shares: 1, views: 1000 }),
    mkMetric({ postId: 'p-2', likes: 50, comments: 5, shares: 0, views: 500 }),
    mkMetric({ postId: 'p-3', likes: 30, comments: 2, shares: 0, views: 300 }),
  ];
  const out = aggregateByVariant(posts, metrics);
  assert.equal(out.length, 2);
  // sorted by score desc
  const a = out.find((v) => v.variant === 'A')!;
  const b = out.find((v) => v.variant === 'B')!;
  assert.equal(a.postCount, 2);
  assert.equal(a.engagementCount, 2);
  assert.equal(a.likes, 150);
  assert.equal(a.comments, 15);
  // score = c*3 + s*2 + l + 0.05*v
  //   A: (10+5)*3 + (1+0)*2 + (100+50) + 0.05*(1000+500) = 45+2+150+75 = 272
  //   B: 2*3 + 0*2 + 30 + 0.05*300 = 6+0+30+15 = 51
  assert.equal(a.score, 272);
  assert.equal(b.score, 51);
  assert.equal(a.shares, 1);
  assert.equal(a.views, 1500);
});

void test('aggregateByVariant: falls back to postId → variant lookup', () => {
  const posts: PostRecord[] = [
    { platform: 'x', postId: 'p-1', status: 'posted', variantTag: 'A' },
  ];
  const metrics: EngagementMetric[] = [
    mkMetric({ postId: 'p-1', likes: 10 }), // no variantTag, but post has it
  ];
  const out = aggregateByVariant(posts, metrics);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.variant, 'A');
  assert.equal(out[0]!.likes, 10);
});

void test('aggregateByVariant: skips metrics with no resolvable variant', () => {
  const posts: PostRecord[] = [];
  const metrics: EngagementMetric[] = [mkMetric({ postId: 'orphan' })];
  assert.deepEqual(aggregateByVariant(posts, metrics), []);
});

void test('selectWinner: empty input returns null', () => {
  assert.equal(selectWinner([], { minSampleSize: 1 }), null);
});

void test('selectWinner: minSampleSize filters out under-sampled variants', () => {
  const variants: AbVariantSummary[] = [
    { variant: 'A', postCount: 5, engagementCount: 1, likes: 100, comments: 0, shares: 0, views: 0, score: 100 },
    { variant: 'B', postCount: 5, engagementCount: 0, likes: 0, comments: 0, shares: 0, views: 0, score: 0 },
  ];
  assert.equal(selectWinner(variants, { minSampleSize: 1 }), 'A');
  assert.equal(selectWinner(variants, { minSampleSize: 2 }), null);
});

void test('selectWinner: tie within margin returns null', () => {
  const variants: AbVariantSummary[] = [
    { variant: 'A', postCount: 1, engagementCount: 1, likes: 100, comments: 0, shares: 0, views: 0, score: 100 },
    { variant: 'B', postCount: 1, engagementCount: 1, likes: 99, comments: 0, shares: 0, views: 0, score: 99 },
  ];
  assert.equal(selectWinner(variants, { minSampleSize: 1, tieMargin: 0.05 }), null);
  assert.equal(selectWinner(variants, { minSampleSize: 1, tieMargin: 0.001 }), 'A');
});

void test('selectWinner: minSampleSize=0 picks top regardless of count', () => {
  const variants: AbVariantSummary[] = [
    { variant: 'A', postCount: 1, engagementCount: 0, likes: 0, comments: 0, shares: 0, views: 0, score: 0 },
  ];
  assert.equal(selectWinner(variants, { minSampleSize: 0 }), 'A');
});

void test('buildAbReport: full report shape', () => {
  const posts: PostRecord[] = [
    { platform: 'x', postId: 'p-1', status: 'posted', variantTag: 'A' },
    { platform: 'x', postId: 'p-2', status: 'posted', variantTag: 'B' },
  ];
  const metrics: EngagementMetric[] = [
    mkMetric({ postId: 'p-1', variantTag: 'A', likes: 10 }),
    mkMetric({ postId: 'p-2', variantTag: 'B', likes: 5 }),
  ];
  const r = buildAbReport('c-1', posts, metrics, { minSampleSize: 1, now: '2026-06-21T00:00:00.000Z' });
  assert.equal(r.contentId, 'c-1');
  assert.equal(r.minSampleSize, 1);
  assert.equal(r.generatedAt, '2026-06-21T00:00:00.000Z');
  assert.equal(r.winner, 'A');
  assert.equal(r.variants.length, 2);
});

void test('ideasForContent: counts ideas per variant tag', () => {
  const ideas: Idea[] = [
    { id: '1', angle: 'a', hook: 'h', targetPlatform: ['x'], score: 0.5, variantTag: 'A' },
    { id: '2', angle: 'b', hook: 'h', targetPlatform: ['x'], score: 0.5, variantTag: 'A' },
    { id: '3', angle: 'c', hook: 'h', targetPlatform: ['x'], score: 0.5, variantTag: 'B' },
    { id: '4', angle: 'd', hook: 'h', targetPlatform: ['x'], score: 0.5 }, // no tag
  ];
  const out = ideasForContent(ideas);
  // 4th idea has no tag → 'A' (default). So 3 A's and 1 B
  assert.equal(out.length, 2);
  assert.equal(out.find((v) => v.variant === 'A')!.postCount, 3);
  assert.equal(out.find((v) => v.variant === 'B')!.postCount, 1);
});

void test('variantLabelForIndex: defaults to A-E then V{n}', () => {
  assert.equal(variantLabelForIndex(0), 'A');
  assert.equal(variantLabelForIndex(4), 'E');
  assert.equal(variantLabelForIndex(5), 'V6');
});

void test('DEFAULT_VARIANT_LABELS: 5 labels', () => {
  assert.equal(DEFAULT_VARIANT_LABELS.length, 5);
});
