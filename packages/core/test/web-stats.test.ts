import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeWebStats, type WebStatsInput } from '../src/web-stats.js';

function baseInput(over: Partial<WebStatsInput> = {}): WebStatsInput {
  return {
    contents: [
      { stage: 'done', persona: 'tech-insight', posts: 3, engagement: 5, createdAt: '2026-06-20T00:00:00.000Z' },
      { stage: 'review', persona: 'lifestyle', posts: 1, engagement: 0, createdAt: '2026-06-20T01:00:00.000Z' },
      { stage: 'done', persona: 'tech-insight', posts: 2, engagement: 1, createdAt: '2026-06-21T00:00:00.000Z' },
    ],
    queueItems: [
      { status: 'pending', platform: 'x', createdAt: '2026-06-20T00:00:00.000Z' },
      { status: 'pending', platform: 'x', createdAt: '2026-06-20T00:00:00.000Z' },
      { status: 'failed_dead', platform: 'reddit', createdAt: '2026-06-20T00:00:00.000Z' },
    ],
    feedback: { totalRecords: 32, recentCount: 18, lastUpdated: '2026-06-21T00:00:00.000Z' },
    ab: { winner: 'A', variants: 2, minSampleSize: 1 },
    llm: { provider: 'mock', model: 'mock-llm' },
    ...over,
  };
}

void test('web-stats: counts contents per stage', () => {
  const s = computeWebStats(baseInput());
  assert.equal(s.contentsByStage.done, 2);
  assert.equal(s.contentsByStage.review, 1);
  assert.equal(s.totalContents, 3);
});

void test('web-stats: counts queue by status and platform', () => {
  const s = computeWebStats(baseInput());
  assert.equal(s.queueByStatus.pending, 2);
  assert.equal(s.queueByStatus.failed_dead, 1);
  assert.equal(s.queueByPlatform.x, 2);
  assert.equal(s.queueByPlatform.reddit, 1);
  assert.equal(s.totalQueue, 3);
});

void test('web-stats: surfaces persona and platform distribution for posts', () => {
  const s = computeWebStats(baseInput());
  assert.equal(s.postsByPersona['tech-insight'], 5);
  assert.equal(s.postsByPersona['lifestyle'], 1);
  assert.equal(s.totalPosts, 6);
});

void test('web-stats: feedback summary includes LLM provider and AB winner', () => {
  const s = computeWebStats(baseInput());
  assert.equal(s.feedback.totalRecords, 32);
  assert.equal(s.feedback.recentCount, 18);
  assert.equal(s.llm.provider, 'mock');
  assert.equal(s.ab.winner, 'A');
});

void test('web-stats: handles empty inputs gracefully', () => {
  const s = computeWebStats({
    contents: [], queueItems: [], feedback: { totalRecords: 0, recentCount: 0, lastUpdated: null },
    ab: { winner: null, variants: 0, minSampleSize: 1 }, llm: { provider: 'mock', model: 'mock-llm' },
  });
  assert.equal(s.totalContents, 0);
  assert.equal(s.totalQueue, 0);
  assert.equal(s.totalPosts, 0);
});
