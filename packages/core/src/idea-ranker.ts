import type { EngagementMetric, IdeaPerformance } from './engagement.js';
import { aggregate } from './engagement.js';

export interface RankableIdea {
  angle: string;
  score: number;
}

export interface RankerOptions {
  historyBoost?: number;
  minSampleSize?: number;
}

const DEFAULT_BOOST = 0.3;
const DEFAULT_MIN_SAMPLES = 1;

export class IdeaRanker {
  private readonly boost: number;
  private readonly minSamples: number;

  constructor(opts: RankerOptions = {}) {
    this.boost = opts.historyBoost ?? DEFAULT_BOOST;
    this.minSamples = opts.minSampleSize ?? DEFAULT_MIN_SAMPLES;
  }

  rank(ideas: RankableIdea[], history: EngagementMetric[], ideaAngleFor: (m: EngagementMetric) => string | null): RankableIdea[] {
    const perf = this.performanceByAngle(history, ideaAngleFor);
    return ideas
      .map((idea) => {
        const perfEntry = perf.get(idea.angle);
        let adjusted = idea.score;
        if (perfEntry && perfEntry.count >= this.minSamples) {
          // 历史表现好的 idea 分数加成（0..1 映射到 1+boost 倍率）
          const norm = Math.min(1, perfEntry.avgDerivedScore / 10);
          adjusted = Math.min(1, idea.score * (1 + this.boost * norm));
        }
        return { angle: idea.angle, score: adjusted };
      })
      .sort((a, b) => b.score - a.score);
  }

  performanceByAngle(history: EngagementMetric[], ideaAngleFor: (m: EngagementMetric) => string | null): Map<string, IdeaPerformance> {
    const buckets = new Map<string, EngagementMetric[]>();
    for (const m of history) {
      const angle = ideaAngleFor(m);
      if (!angle) continue;
      const arr = buckets.get(angle) ?? [];
      arr.push(m);
      buckets.set(angle, arr);
    }
    const out = new Map<string, IdeaPerformance>();
    for (const [angle, metrics] of buckets.entries()) {
      const agg = aggregate(metrics);
      const n = metrics.length;
      out.set(angle, {
        ideaAngle: angle,
        count: n,
        avgDerivedScore: n > 0 ? agg.derivedScore / n : 0,
        avgLikes: n > 0 ? agg.totalLikes / n : 0,
        avgComments: n > 0 ? agg.totalComments / n : 0,
        avgShares: n > 0 ? agg.totalShares / n : 0,
      });
    }
    return out;
  }
}