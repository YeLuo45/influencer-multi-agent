import type { Content, Schedule } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
export declare class ScheduleAgent implements Agent<void, Schedule> {
    name: string;
    run(_input: void, content: Content, ctx: AgentContext): Promise<AgentResult<Schedule>>;
}
//# sourceMappingURL=schedule.d.ts.map