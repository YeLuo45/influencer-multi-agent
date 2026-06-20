import type { Content, PostRecord } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
export declare class PublishAgent implements Agent<void, PostRecord[]> {
    name: string;
    run(_input: void, content: Content, ctx: AgentContext): Promise<AgentResult<PostRecord[]>>;
}
//# sourceMappingURL=publish.d.ts.map