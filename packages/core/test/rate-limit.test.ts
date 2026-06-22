import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRateLimiter, TokenBucketLimiter } from '../src/rate-limit.js';

void test('rate-limit: createRateLimiter returns a TokenBucketLimiter by default', () => {
  const lim = createRateLimiter({ capacity: 5, refillPerSecond: 1 });
  assert.ok(lim instanceof TokenBucketLimiter);
});

void test('rate-limit: TokenBucketLimiter allows burst up to capacity', () => {
  const lim = new TokenBucketLimiter({ capacity: 3, refillPerSecond: 1 });
  assert.equal(lim.tryAcquire('p1'), true);
  assert.equal(lim.tryAcquire('p1'), true);
  assert.equal(lim.tryAcquire('p1'), true);
  assert.equal(lim.tryAcquire('p1'), false);
});

void test('rate-limit: per-key buckets do not share tokens', () => {
  const lim = new TokenBucketLimiter({ capacity: 2, refillPerSecond: 1 });
  assert.equal(lim.tryAcquire('a'), true);
  assert.equal(lim.tryAcquire('a'), true);
  assert.equal(lim.tryAcquire('a'), false);
  // a different key still has its full bucket
  assert.equal(lim.tryAcquire('b'), true);
  assert.equal(lim.tryAcquire('b'), true);
  assert.equal(lim.tryAcquire('b'), false);
});

void test('rate-limit: tokens refill over time', async () => {
  const lim = new TokenBucketLimiter({ capacity: 1, refillPerSecond: 50 });
  assert.equal(lim.tryAcquire('p1'), true);
  assert.equal(lim.tryAcquire('p1'), false);
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(lim.tryAcquire('p1'), true);
});

void test('rate-limit: getStats() reports per-key bucket levels', () => {
  const lim = new TokenBucketLimiter({ capacity: 5, refillPerSecond: 1 });
  lim.tryAcquire('x');
  lim.tryAcquire('x');
  const s = lim.getStats('x');
  assert.equal(s.capacity, 5);
  assert.ok(s.remaining <= 3);
  assert.ok(s.remaining >= 0);
});
