import type { Content, Idea, EngagementMetric } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
export declare class IdeaAgent implements Agent<{
    count?: number;
    feedback?: EngagementMetric[];
    persona?: import('../persona.js').Persona | null;
}, Idea[]> {
    name: string;
    run(input: {
        count?: number;
        feedback?: EngagementMetric[];
        persona?: import('../persona.js').Persona | null;
    }, content: Content, ctx: AgentContext): Promise<AgentResult<Idea[]>>;
}
//# sourceMappingURL=idea.d.ts.map