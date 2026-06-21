import type { Content, EngagementMetric } from './types.js';
import type { AgentContext } from './protocol.js';
import type { Persona } from './persona.js';
export interface PipelineOptions {
    maxRevisionRounds?: number;
    ideaCount?: number;
    feedback?: EngagementMetric[];
    personaLookup?: (id: string) => Persona | null;
}
export declare class Pipeline {
    private readonly ctx;
    private readonly research;
    private readonly idea;
    private readonly draft;
    private readonly review;
    private readonly schedule;
    private readonly publish;
    private readonly audit;
    private readonly maxRevisions;
    private readonly ideaCount;
    private readonly feedback;
    private readonly personaLookup;
    constructor(ctx: AgentContext, opts?: PipelineOptions);
    static createContent(topic: string, persona?: string): Content;
    step(content: Content): Promise<{
        content: Content;
        advanced: boolean;
    }>;
    run(content: Content): Promise<Content>;
    private dispatch;
    private simpleTransition;
    private applyOk;
    private entry;
}
//# sourceMappingURL=pipeline.d.ts.map