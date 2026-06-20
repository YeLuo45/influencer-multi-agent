export type ContentStage =
  | 'intake'
  | 'research'
  | 'ideas'
  | 'draft'
  | 'review'
  | 'publish'
  | 'done'
  | 'needs_revision';

export const CONTENT_STAGES: readonly ContentStage[] = [
  'intake',
  'research',
  'ideas',
  'draft',
  'review',
  'publish',
  'done',
  'needs_revision',
] as const;

export type PlatformId = 'x' | 'xiaohongshu' | 'weibo' | 'bilibili' | 'reddit';

export const PLATFORMS: readonly PlatformId[] = [
  'x',
  'xiaohongshu',
  'weibo',
  'bilibili',
  'reddit',
] as const;

export type Source = {
  url: string;
  title: string;
  snippet: string;
  fetchedAt: string;
  signals: string[];
};

export type Idea = {
  id: string;
  angle: string;
  hook: string;
  targetPlatform: PlatformId[];
  score: number;
};

export type Draft = {
  title: string;
  body: string;
  tags: string[];
  coverHint: string;
  cta: string;
  platformOverrides: Partial<Record<PlatformId, string>>;
};

export type ReviewCheck = {
  name: string;
  pass: boolean;
  note: string;
};

export type Review = {
  decision: 'approve' | 'reject' | 'revise';
  reasons: string[];
  checks: ReviewCheck[];
};

export type Schedule = {
  publishAt: string;
  perPlatformDelayMinutes: Record<PlatformId, number>;
};

export type PostRecord = {
  platform: PlatformId;
  postId: string | null;
  status: 'queued' | 'posted' | 'failed';
  url?: string;
  error?: string;
  postedAt?: string;
};

export type HistoryEntry = {
  from: ContentStage;
  to: ContentStage;
  agent: string;
  at: string;
  note: string;
};

export type Content = {
  id: string;
  topic: string;
  persona: string;
  stage: ContentStage;
  sources: Source[];
  ideas: Idea[];
  draft: Draft | null;
  review: Review | null;
  schedule: Schedule | null;
  posts: PostRecord[];
  history: HistoryEntry[];
  revisionCount: number;
  createdAt: string;
  updatedAt: string;
};

export function createContent(opts: { id: string; topic: string; persona?: string; now?: string }): Content {
  const now = opts.now ?? new Date().toISOString();
  return {
    id: opts.id,
    topic: opts.topic,
    persona: opts.persona ?? 'default',
    stage: 'intake',
    sources: [],
    ideas: [],
    draft: null,
    review: null,
    schedule: null,
    posts: [],
    history: [],
    revisionCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}