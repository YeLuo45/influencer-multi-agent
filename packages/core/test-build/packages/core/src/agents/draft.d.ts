import type { Content, Draft } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { type Persona } from '../persona.js';
export declare class DraftAgent implements Agent<{
    ideaIndex?: number;
    persona?: Persona | null;
}, Draft> {
    name: string;
    run(input: {
        ideaIndex?: number;
        persona?: Persona | null;
    }, content: Content, ctx: AgentContext): Promise<AgentResult<Draft>>;
}
//# sourceMappingURL=draft.d.ts.map