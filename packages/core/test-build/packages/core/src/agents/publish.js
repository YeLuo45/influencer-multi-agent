import { err, ok } from '../protocol.js';
export class PublishAgent {
    name = 'publish';
    async run(_input, content, ctx) {
        if (!content.draft)
            return err('draft missing', true);
        const draft = content.draft;
        const targets = deriveTargets(content);
        if (targets.length === 0)
            return err('no target platforms', true);
        try {
            const records = [];
            for (const p of targets) {
                const body = draft.platformOverrides[p] ?? draft.body;
                try {
                    const rec = await ctx.publisher.post(p, { title: draft.title, body, tags: draft.tags });
                    records.push(rec);
                }
                catch (e) {
                    records.push({
                        platform: p,
                        postId: null,
                        status: 'failed',
                        error: e.message,
                        postedAt: ctx.now(),
                    });
                }
            }
            if (records.every((r) => r.status === 'failed')) {
                return err('all platforms failed', false);
            }
            return ok(records);
        }
        catch (e) {
            return err(`publish failed: ${e.message}`, false);
        }
    }
}
function deriveTargets(content) {
    const set = new Set();
    for (const p of content.posts)
        set.add(p.platform);
    for (const idea of content.ideas)
        for (const p of idea.targetPlatform)
            set.add(p);
    if (set.size === 0)
        set.add('x');
    return Array.from(set);
}
//# sourceMappingURL=publish.js.map