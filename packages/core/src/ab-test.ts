import type { Idea, EngagementMetric, PostRecord } from './types.js';

export interface AbVariantSummary {
  variant: string;
  postCount: number;
  engagementCount: number;
  likes: number;
  comments: number;
  shares: number;
  views: number;
  /** engagement weighted score: comments * 3 + shares * 2 + likes + 0.05 * views */
  score: number;
}

export interface AbReport {
  contentId: string;
  variants: AbVariantSummary[];
  /** Winner variant tag; null when fewer than `minSampleSize` posts per variant. */
  winner: string | null;
  /** How many samples per variant must exist before a winner can be picked. */
  minSampleSize: number;
  generatedAt: string;
}

export const DEFAULT_VARIANT_LABELS = ['A', 'B', 'C', 'D', 'E'];

export function variantLabelForIndex(i: number, labels: readonly string[] = DEFAULT_VARIANT_LABELS): string {
  return labels[i] ?? `V${i + 1}`;
}

export function assignVariantTags<T>(items: T[], variantCount: number, labels: readonly string[] = DEFAULT_VARIANT_LABELS): Array<T & { variantTag: string }> {
  if (variantCount < 1) throw new Error('variantCount must be >= 1');
  if (items.length === 0) return [];
  return items.map((item, i) => ({
    ...item,
    variantTag: variantLabelForIndex(i % variantCount, labels),
  }));
}

export function scoreForMetric(m: EngagementMetric): number {
  return m.comments * 3 + m.shares * 2 + m.likes + 0.05 * m.views;
}

export function aggregateByVariant(
  posts: PostRecord[],
  metrics: EngagementMetric[],
): AbVariantSummary[] {
  // Build variant -> postIds map from posts that carry a tag
  const variantToPostIds = new Map<string, Set<string>>();
  for (const p of posts) {
    if (!p.variantTag) continue;
    if (!variantToPostIds.has(p.variantTag)) variantToPostIds.set(p.variantTag, new Set());
    variantToPostIds.get(p.variantTag)!.add(p.postId ?? '');
  }
  // Build postId -> variant map (used when post lacks tag but engagement carries one)
  const postIdToVariant = new Map<string, string>();
  for (const p of posts) {
    if (p.variantTag && p.postId) postIdToVariant.set(p.postId, p.variantTag);
  }
  const summaries = new Map<string, AbVariantSummary>();
  for (const [variant, postIds] of variantToPostIds) {
    summaries.set(variant, {
      variant,
      postCount: postIds.size,
      engagementCount: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      score: 0,
    });
  }
  for (const m of metrics) {
    const variant = m.variantTag ?? postIdToVariant.get(m.postId);
    if (!variant) continue;
    const s = summaries.get(variant) ?? {
      variant,
      postCount: 0,
      engagementCount: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      score: 0,
    };
    s.engagementCount += 1;
    s.likes += m.likes;
    s.comments += m.comments;
    s.shares += m.shares;
    s.views += m.views;
    s.score += scoreForMetric(m);
    summaries.set(variant, s);
  }
  return [...summaries.values()].sort((a, b) => b.score - a.score);
}

export interface SelectWinnerOptions {
  minSampleSize: number;
  /** Tie-breaker: when two variants are within this margin, treat as tie. */
  tieMargin?: number;
}

export function selectWinner(
  variants: AbVariantSummary[],
  opts: SelectWinnerOptions,
): string | null {
  if (variants.length === 0) return null;
  if (opts.minSampleSize <= 0) {
    return variants[0]!.variant;
  }
  const eligible = variants.filter((v) => v.engagementCount >= opts.minSampleSize);
  if (eligible.length === 0) return null;
  const sorted = [...eligible].sort((a, b) => b.score - a.score);
  const top = sorted[0]!;
  const second = sorted[1];
  if (second) {
    const margin = opts.tieMargin ?? 0.05;
    const ratio = (top.score - second.score) / Math.max(top.score, 1);
    if (ratio < margin) return null; // tie within margin
  }
  return top.variant;
}

export function buildAbReport(
  contentId: string,
  posts: PostRecord[],
  metrics: EngagementMetric[],
  opts: { minSampleSize?: number; now?: string; tieMargin?: number } = {},
): AbReport {
  const minSampleSize = opts.minSampleSize ?? 1;
  const variants = aggregateByVariant(posts, metrics);
  const winner = selectWinner(variants, { minSampleSize, ...(opts.tieMargin !== undefined ? { tieMargin: opts.tieMargin } : {}) });
  return {
    contentId,
    variants,
    winner,
    minSampleSize,
    generatedAt: opts.now ?? new Date().toISOString(),
  };
}

export function ideasForContent(ideas: Idea[]): AbVariantSummary[] {
  const map = new Map<string, AbVariantSummary>();
  for (const idea of ideas) {
    const tag = idea.variantTag ?? 'A';
    const s = map.get(tag) ?? {
      variant: tag,
      postCount: 0,
      engagementCount: 0,
      likes: 0,
      comments: 0,
      shares: 0,
      views: 0,
      score: 0,
    };
    s.postCount += 1;
    map.set(tag, s);
  }
  return [...map.values()];
}
