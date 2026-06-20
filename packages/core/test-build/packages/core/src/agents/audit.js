import { ok } from '../protocol.js';
export class AuditAgent {
    name = 'audit';
    async run(_input, content, ctx) {
        const succeeded = content.posts.filter((p) => p.status === 'posted').length;
        const failed = content.posts.filter((p) => p.status === 'failed').length;
        const note = `published ${succeeded}/${content.posts.length} (failed ${failed})`;
        const entry = {
            from: content.stage,
            to: content.stage,
            agent: 'audit',
            note,
            at: ctx.now(),
        };
        return ok(entry);
    }
}
//# sourceMappingURL=audit.js.map