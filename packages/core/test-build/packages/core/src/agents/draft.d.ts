import type { Content, Draft } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
export declare class DraftAgent implements Agent<{
    ideaIndex?: number;
}, Draft> {
    name: string;
    run(input: {
        ideaIndex?: number;
    }, content: Content, ctx: AgentContext): Promise<AgentResult<Draft>>;
}
//# sourceMappingURL=draft.d.ts.map