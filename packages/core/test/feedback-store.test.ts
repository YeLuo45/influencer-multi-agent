import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyFeedback, appendFeedback, filterByWindow } from '../src/feedback-store.js';
import type { EngagementMetric } from '../src/types.js';

function mk(likes: number, fetchedAt: string, platform: 'x' | 'reddit' = 'x'): EngagementMetric {
  return {
    platform,
    postId: `p-${Math.random()}`,
    likes,
    comments: 0,
    shares: 0,
    views: 0,
    fetchedAt,
  };
}

void test('emptyFeedback: initializes empty state', () => {
  const s = emptyFeedback('2026-06-20T00:00:00Z');
  assert.equal(s.records.length, 0);
  assert.equal(s.windowDays, 7);
  assert.equal(s.totalRecords, 0);
});

void test('filterByWindow: keeps only recent records', () => {
  const now = '2026-06-20T00:00:00Z';
  const recent = mk(10, '2026-06-19T00:00:00Z');
  const old = mk(5, '2026-06-01T00:00:00Z');
  const out = filterByWindow([recent, old], 7, now);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.likes, 10);
});

void test('filterByWindow: empty input returns empty', () => {
  assert.equal(filterByWindow([], 7, '2026-06-20T00:00:00Z').length, 0);
});

void test('filterByWindow: zero window keeps everything', () => {
  const records = [mk(1, '2020-01-01T00:00:00Z'), mk(2, '2026-06-19T00:00:00Z')];
  const out = filterByWindow(records, 0, '2026-06-20T00:00:00Z');
  assert.equal(out.length, 2);
});

void test('filterByWindow: invalid date is filtered out', () => {
  const invalid = mk(1, 'not-a-date');
  const out = filterByWindow([invalid], 7, '2026-06-20T00:00:00Z');
  assert.equal(out.length, 0);
});

void test('appendFeedback: merges new with existing', () => {
  const s = emptyFeedback('2026-06-20T00:00:00Z');
  const newRecs = [mk(100, '2026-06-19T00:00:00Z')];
  const next = appendFeedback(s, newRecs, '2026-06-20T00:00:00Z');
  assert.equal(next.records.length, 1);
  assert.equal(next.totalRecords, 1);
  assert.equal(next.lastUpdated, '2026-06-20T00:00:00Z');
});

void test('appendFeedback: filters old records on append', () => {
  const old = mk(5, '2026-06-01T00:00:00Z');
  const s = { ...emptyFeedback('2026-06-20T00:00:00Z'), records: [old] };
  const newRecs = [mk(100, '2026-06-19T00:00:00Z')];
  const next = appendFeedback(s, newRecs, '2026-06-20T00:00:00Z');
  assert.equal(next.records.length, 1);
  assert.equal(next.records[0]!.likes, 100);
});

void test('appendFeedback: idempotent on empty new', () => {
  const s = { ...emptyFeedback('2026-06-20T00:00:00Z'), records: [mk(50, '2026-06-19T00:00:00Z')] };
  const next = appendFeedback(s, [], '2026-06-20T00:00:00Z');
  assert.equal(next.records.length, 1);
});

void test('appendFeedback: respects custom windowDays', () => {
  const s = { ...emptyFeedback('2026-06-20T00:00:00Z'), windowDays: 30 };
  const old = mk(5, '2026-05-25T00:00:00Z');
  const next = appendFeedback(s, [old], '2026-06-20T00:00:00Z');
  assert.equal(next.records.length, 1); // within 30 days
});