import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLimiterFromPolicy, defaultPlatformRatePolicies, summarizeRateLimitPolicy } from '../src/rate-limit-policy.js';

void test('defaultPlatformRatePolicies includes all production platforms with publish keys', () => {
  const policies = defaultPlatformRatePolicies();

  for (const platform of ['x', 'reddit', 'youtube', 'xiaohongshu', 'weibo', 'bilibili']) {
    assert.equal(policies.some((policy) => policy.platform === platform && policy.key === `publish:${platform}`), true);
  }
});

void test('createLimiterFromPolicy builds per-platform limiter and enforces capacity', () => {
  let now = 0;
  const limiter = createLimiterFromPolicy({ platform: 'x', key: 'publish:x', capacity: 1, refillPerSecond: 0.5 }, { now: () => now });

  assert.equal(limiter.tryAcquire('publish:x'), true);
  assert.equal(limiter.tryAcquire('publish:x'), false);
  now = 2_000;
  assert.equal(limiter.tryAcquire('publish:x'), true);
});

void test('summarizeRateLimitPolicy returns operator-readable defaults', () => {
  const summary = summarizeRateLimitPolicy([{ platform: 'reddit', key: 'publish:reddit', capacity: 60, refillPerSecond: 1 }]);

  assert.equal(summary.totalPolicies, 1);
  assert.deepEqual(summary.rows[0], { platform: 'reddit', key: 'publish:reddit', capacity: 60, refillPerMinute: 60 });
});
