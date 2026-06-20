import type { Content, Idea } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { PLATFORMS } from '../types.js';
export declare class IdeaAgent implements Agent<{
    count?: number;
}, Idea[]> {
    name: string;
    run(input: {
        count?: number;
    }, content: Content, ctx: AgentContext): Promise<AgentResult<Idea[]>>;
}
export { PLATFORMS };
//# sourceMappingURL=idea.d.ts.map