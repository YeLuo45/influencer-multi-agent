export const CONTENT_STAGES = [
    'intake',
    'research',
    'ideas',
    'draft',
    'review',
    'publish',
    'done',
    'needs_revision',
];
export const PLATFORMS = [
    'x',
    'xiaohongshu',
    'weibo',
    'bilibili',
    'reddit',
];
export function createContent(opts) {
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
        engagement: [],
        createdAt: now,
        updatedAt: now,
    };
}
//# sourceMappingURL=types.js.map