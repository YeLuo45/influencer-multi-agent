import type { Content, HistoryEntry } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { ok } from '../protocol.js';

export class AuditAgent implements Agent<void, HistoryEntry> {
  name = 'audit';

  async run(_input: void, content: Content, ctx: AgentContext): Promise<AgentResult<HistoryEntry>> {
    const succeeded = content.posts.filter((p) => p.status === 'posted').length;
    const failed = content.posts.filter((p) => p.status === 'failed').length;
    const note = `published ${succeeded}/${content.posts.length} (failed ${failed})`;
    const entry: HistoryEntry = {
      from: content.stage,
      to: content.stage,
      agent: 'audit',
      note,
      at: ctx.now(),
    };
    return ok(entry);
  }
}