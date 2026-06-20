export type ContentStage = 'intake' | 'research' | 'ideas' | 'draft' | 'review' | 'publish' | 'done' | 'needs_revision';
export declare const CONTENT_STAGES: readonly ContentStage[];
export type PlatformId = 'x' | 'xiaohongshu' | 'weibo' | 'bilibili' | 'reddit';
export declare const PLATFORMS: readonly PlatformId[];
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
export declare function createContent(opts: {
    id: string;
    topic: string;
    persona?: string;
    now?: string;
}): Content;
//# sourceMappingURL=types.d.ts.map