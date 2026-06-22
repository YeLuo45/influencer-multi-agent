// Token-bucket rate limiter with per-key isolation. Used by PublishAgent
// to throttle channel posts (X/Reddit etc.) and avoid platform rate-limit
// rejections. Zero deps; deterministic for offline tests via fake timers
// or short sleep.

export interface RateLimiterHandle {
  tryAcquire(key: string, n?: number): boolean;
  /** Force-fill the bucket for tests. */
  reset(key: string): void;
  getStats(key: string): { capacity: number; remaining: number };
}

export interface RateLimiter {
  tryAcquire(key: string, n?: number): boolean;
  reset(key: string): void;
  getStats(key: string): { capacity: number; remaining: number };
}

export interface RateLimiterOptions {
  capacity: number;
  refillPerSecond: number;
  now?: () => number;
}

interface Bucket {
  tokens: number;
  lastRefillMs: number;
}

export class TokenBucketLimiter implements RateLimiter {
  private readonly buckets = new Map<string, Bucket>();
  constructor(private readonly opts: RateLimiterOptions) {}

  private getBucket(key: string, nowMs: number): Bucket {
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.opts.capacity, lastRefillMs: nowMs };
      this.buckets.set(key, b);
    } else {
      const elapsed = Math.max(0, nowMs - b.lastRefillMs) / 1000;
      const refill = elapsed * this.opts.refillPerSecond;
      if (refill > 0) {
        b.tokens = Math.min(this.opts.capacity, b.tokens + refill);
        b.lastRefillMs = nowMs;
      }
    }
    return b;
  }

  tryAcquire(key: string, n = 1): boolean {
    const now = this.opts.now ? this.opts.now() : Date.now();
    const b = this.getBucket(key, now);
    if (b.tokens >= n) {
      b.tokens -= n;
      return true;
    }
    return false;
  }

  reset(key: string): void {
    if (key === '') {
      this.buckets.clear();
    } else {
      this.buckets.delete(key);
    }
  }

  getStats(key: string): { capacity: number; remaining: number } {
    const now = this.opts.now ? this.opts.now() : Date.now();
    const b = this.getBucket(key, now);
    return { capacity: this.opts.capacity, remaining: Math.floor(b.tokens) };
  }
}

export function createRateLimiter(opts: RateLimiterOptions): RateLimiter {
  return new TokenBucketLimiter(opts);
}
