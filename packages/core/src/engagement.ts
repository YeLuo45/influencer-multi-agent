import type { EngagementMetric } from './types.js';

export type EngagementSnapshot = {
  contentId: string;
  topic: string;
  persona: string;
  ideaAngle: string;
  metrics: EngagementMetric[];
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  derivedScore: number;
  fetchedAt: string;
};

export type IdeaPerformance = {
  ideaAngle: string;
  count: number;
  avgDerivedScore: number;
  avgLikes: number;
  avgComments: number;
  avgShares: number;
};

export function deriveScore(m: EngagementMetric): number {
  // 加权公式：likes*1 + comments*3 + shares*5 + views*0.01
  // log 防止爆值
  const raw = m.likes * 1 + m.comments * 3 + m.shares * 5 + m.views * 0.01;
  return Math.log1p(raw);
}

export function aggregate(metrics: EngagementMetric[]): {
  totalLikes: number;
  totalComments: number;
  totalShares: number;
  totalViews: number;
  derivedScore: number;
} {
  let totalLikes = 0;
  let totalComments = 0;
  let totalShares = 0;
  let totalViews = 0;
  let score = 0;
  for (const m of metrics) {
    totalLikes += m.likes;
    totalComments += m.comments;
    totalShares += m.shares;
    totalViews += m.views;
    score += deriveScore(m);
  }
  return { totalLikes, totalComments, totalShares, totalViews, derivedScore: score };
}

export type { EngagementMetric } from './types.js';