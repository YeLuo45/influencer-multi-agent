import type { Content, PlatformId, PostRecord } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { err, ok } from '../protocol.js';
import { adaptForPlatform } from '../platform-adapter.js';
import { createQueueItem, recordAttemptFailure, type QueueItem } from '../publish-queue.js';

export class PublishAgent implements Agent<void, PostRecord[]> {
  name = 'publish';

  async run(_input: void, content: Content, ctx: AgentContext): Promise<AgentResult<PostRecord[]>> {
    if (!content.draft) return err('draft missing', true);
    const draft = content.draft;
    const targets = deriveTargets(content);
    if (targets.length === 0) return err('no target platforms', true);
    try {
      const records: PostRecord[] = [];
      // apply platform adapter before posting
      const overrides: Partial<Record<PlatformId, string>> = {};
      for (const { platform: p } of targets) {
        const adapted = adaptForPlatform({ title: draft.title, body: draft.body, tags: draft.tags, platform: p });
        overrides[p] = adapted.body;
      }
      for (const { platform: p, variantTag } of targets) {
        const body = overrides[p] ?? draft.body;
        const now = ctx.now();
        const item: QueueItem = createQueueItem({
          contentId: content.id,
          platform: p,
          payload: { title: draft.title, body, tags: draft.tags },
          now,
        });
        const safeSink = async (qi: QueueItem): Promise<void> => {
          if (!ctx.queueSink) return;
          try {
            await ctx.queueSink(qi);
          } catch {
            // queue sink errors must never mask post success/failure
          }
        };
        try {
          const rec = await ctx.publisher.post(p, { title: draft.title, body, tags: draft.tags });
          records.push({ ...rec, postedAt: rec.postedAt ?? now, ...(variantTag ? { variantTag } : {}) });
          await safeSink({ ...item, status: 'posted', postId: rec.postId, url: rec.url ?? null, postedAt: rec.postedAt ?? now });
        } catch (e) {
          const errMsg = (e as Error).message;
          const failed: QueueItem = recordAttemptFailure(item, errMsg, now);
          await safeSink(failed);
          records.push({
            platform: p,
            postId: null,
            status: 'failed',
            error: errMsg,
            postedAt: now,
            ...(variantTag ? { variantTag } : {}),
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

function deriveTargets(content: Content): Array<{ platform: PlatformId; variantTag?: string }> {
  // pair each platform with the variant tag of the first idea that targets it.
  // This lets the queue item carry a per-platform variant tag derived from
  // the source idea without changing PostRecord semantics.
  const out: Array<{ platform: PlatformId; variantTag?: string }> = [];
  const seen = new Set<PlatformId>();
  for (const idea of content.ideas) {
    for (const p of idea.targetPlatform) {
      if (seen.has(p)) continue;
      seen.add(p);
      out.push({ platform: p, ...(idea.variantTag ? { variantTag: idea.variantTag } : {}) });
    }
  }
  if (out.length === 0) out.push({ platform: 'x' });
  // also include any platform already in posts but not in ideas (e.g. retry)
  for (const p of content.posts) {
    if (!seen.has(p.platform)) {
      seen.add(p.platform);
      out.push({ platform: p.platform, ...(p.variantTag ? { variantTag: p.variantTag } : {}) });
    }
  }
  return out;
}