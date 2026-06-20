import type { Content, HistoryEntry } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
export declare class AuditAgent implements Agent<void, HistoryEntry> {
    name: string;
    run(_input: void, content: Content, ctx: AgentContext): Promise<AgentResult<HistoryEntry>>;
}
//# sourceMappingURL=audit.d.ts.map