import type { PlatformId } from './types.js';
import type { EngagementMetric } from './engagement.js';
import { PLATFORMS } from './types.js';

export interface EngagementTrackerLike {
  fetch(platform: PlatformId, postId: string): Promise<EngagementMetric>;
}

export class MockEngagementTracker implements EngagementTrackerLike {
  private readonly counter = new Map<string, number>();

  async fetch(platform: PlatformId, postId: string): Promise<EngagementMetric> {
    const seed = hash(`${platform}:${postId}`);
    const base = (seed % 1000) + 1;
    const age = this.counter.get(`${platform}:${postId}`) ?? 0;
    this.counter.set(`${platform}:${postId}`, age + 1);
    const factor = 1 + age * 0.3;
    const likes = Math.round(base * factor * (1 + (seed % 7) / 10));
    const comments = Math.round(likes * 0.08 + (seed % 30));
    const shares = Math.round(likes * 0.03 + (seed % 12));
    const views = Math.round(likes * 12 + 200);
    return {
      platform,
      postId,
      likes,
      comments,
      shares,
      views,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export class StubEngagementTracker implements EngagementTrackerLike {
  constructor(private readonly seed: number = 1) {}
  async fetch(platform: PlatformId, postId: string): Promise<EngagementMetric> {
    return {
      platform,
      postId,
      likes: 100 * this.seed,
      comments: 10 * this.seed,
      shares: 5 * this.seed,
      views: 1000 * this.seed,
      fetchedAt: new Date().toISOString(),
    };
  }
}

export class CompositeEngagementTracker implements EngagementTrackerLike {
  constructor(private readonly trackers: EngagementTrackerLike[]) {}
  async fetch(platform: PlatformId, postId: string): Promise<EngagementMetric> {
    const errors: string[] = [];
    for (const t of this.trackers) {
      try {
        return await t.fetch(platform, postId);
      } catch (e) {
        errors.push(`${t.constructor.name}: ${(e as Error).message}`);
      }
    }
    throw new Error(`all engagement trackers failed: ${errors.join(' | ')}`);
  }
  async fetchAllForContent(posts: Array<{ platform: PlatformId; postId: string | null }>): Promise<EngagementMetric[]> {
    const out: EngagementMetric[] = [];
    for (const p of posts) {
      if (!p.postId) continue;
      try {
        out.push(await this.fetch(p.platform, p.postId));
      } catch (e) {
        // skip
      }
    }
    return out;
  }
}

export function createEngagementTracker(): EngagementTrackerLike {
  return new CompositeEngagementTracker([new MockEngagementTracker()]);
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export { PLATFORMS };