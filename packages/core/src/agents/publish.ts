import type { Content, PlatformId, PostRecord } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { err, ok } from '../protocol.js';

export class PublishAgent implements Agent<void, PostRecord[]> {
  name = 'publish';

  async run(_input: void, content: Content, ctx: AgentContext): Promise<AgentResult<PostRecord[]>> {
    if (!content.draft) return err('draft missing', true);
    const draft = content.draft;
    const targets = deriveTargets(content);
    if (targets.length === 0) return err('no target platforms', true);
    try {
      const records: PostRecord[] = [];
      for (const p of targets) {
        const body = draft.platformOverrides[p] ?? draft.body;
        try {
          const rec = await ctx.publisher.post(p, { title: draft.title, body, tags: draft.tags });
          records.push(rec);
        } catch (e) {
          records.push({
            platform: p,
            postId: null,
            status: 'failed',
            error: (e as Error).message,
            postedAt: ctx.now(),
          });
        }
      }
      if (records.every((r) => r.status === 'failed')) {
        return err('all platforms failed', false);
      }
      return ok(records);
    } catch (e) {
      return err(`publish failed: ${(e as Error).message}`, false);
    }
  }
}

function deriveTargets(content: Content): PlatformId[] {
  const set = new Set<PlatformId>();
  for (const p of content.posts) set.add(p.platform);
  for (const idea of content.ideas) for (const p of idea.targetPlatform) set.add(p);
  if (set.size === 0) set.add('x');
  return Array.from(set);
}