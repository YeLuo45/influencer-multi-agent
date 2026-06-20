import { err, ok } from '../protocol.js';
export class ScheduleAgent {
    name = 'schedule';
    async run(_input, content, ctx) {
        if (!content.draft || !content.review || content.review.decision !== 'approve') {
            return err('not ready to schedule', true);
        }
        try {
            const targets = pickTargets(content);
            const schedule = {
                publishAt: ctx.now(),
                perPlatformDelayMinutes: stagger(targets),
            };
            return ok(schedule);
        }
        catch (e) {
            return err(`schedule failed: ${e.message}`, true);
        }
    }
}
function pickTargets(content) {
    const set = new Set();
    for (const idea of content.ideas)
        for (const p of idea.targetPlatform)
            set.add(p);
    if (set.size === 0) {
        if (content.draft)
            for (const k of Object.keys(content.draft.platformOverrides))
                set.add(k);
    }
    if (set.size === 0)
        set.add('x');
    return Array.from(set);
}
function stagger(platforms) {
    const out = {};
    platforms.forEach((p, i) => {
        out[p] = i * 5;
    });
    return out;
}
//# sourceMappingURL=schedule.js.map