import { createRateLimiter, type RateLimiter } from './rate-limit.js';
import type { PlatformId } from './types.js';

export interface PlatformRatePolicy {
  platform: PlatformId;
  key: string;
  capacity: number;
  refillPerSecond: number;
}

export interface RatePolicySummary {
  totalPolicies: number;
  rows: Array<{ platform: PlatformId; key: string; capacity: number; refillPerMinute: number }>;
}

export function defaultPlatformRatePolicies(): PlatformRatePolicy[] {
  return [
    { platform: 'x', key: 'publish:x', capacity: 30, refillPerSecond: 0.5 },
    { platform: 'reddit', key: 'publish:reddit', capacity: 60, refillPerSecond: 1 },
    { platform: 'youtube', key: 'publish:youtube', capacity: 12, refillPerSecond: 0.2 },
    { platform: 'xiaohongshu', key: 'publish:xiaohongshu', capacity: 20, refillPerSecond: 1 / 3 },
    { platform: 'weibo', key: 'publish:weibo', capacity: 20, refillPerSecond: 1 / 3 },
    { platform: 'bilibili', key: 'publish:bilibili', capacity: 10, refillPerSecond: 1 / 6 },
  ];
}

export function createLimiterFromPolicy(policy: PlatformRatePolicy, opts: { now?: () => number } = {}): RateLimiter {
  return createRateLimiter({ capacity: policy.capacity, refillPerSecond: policy.refillPerSecond, now: opts.now });
}

export function summarizeRateLimitPolicy(policies: readonly PlatformRatePolicy[] = defaultPlatformRatePolicies()): RatePolicySummary {
  return {
    totalPolicies: policies.length,
    rows: policies.map((policy) => ({
      platform: policy.platform,
      key: policy.key,
      capacity: policy.capacity,
      refillPerMinute: Math.round(policy.refillPerSecond * 60),
    })),
  };
}
