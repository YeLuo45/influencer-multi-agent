import type { Content, Source } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
export declare class ResearchAgent implements Agent<{
    topic: string;
}, Source[]> {
    name: string;
    run(input: {
        topic: string;
    }, _content: Content, ctx: AgentContext): Promise<AgentResult<Source[]>>;
}
//# sourceMappingURL=research.d.ts.map