import type { Content, Review } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
export declare class ReviewAgent implements Agent<void, Review> {
    name: string;
    run(_input: void, content: Content, _ctx: AgentContext): Promise<AgentResult<Review>>;
}
//# sourceMappingURL=review.d.ts.map