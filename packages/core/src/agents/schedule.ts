import type { Content, PlatformId, Schedule } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { err, ok } from '../protocol.js';

export class ScheduleAgent implements Agent<void, Schedule> {
  name = 'schedule';

  async run(_input: void, content: Content, ctx: AgentContext): Promise<AgentResult<Schedule>> {
    if (!content.draft || !content.review || content.review.decision !== 'approve') {
      return err('not ready to schedule', true);
    }
    try {
      const targets = pickTargets(content);
      const schedule: Schedule = {
        publishAt: ctx.now(),
        perPlatformDelayMinutes: stagger(targets),
      };
      return ok(schedule);
    } catch (e) {
      return err(`schedule failed: ${(e as Error).message}`, true);
    }
  }
}

function pickTargets(content: Content): PlatformId[] {
  const set = new Set<PlatformId>();
  for (const idea of content.ideas) for (const p of idea.targetPlatform) set.add(p);
  if (set.size === 0) {
    if (content.draft) for (const k of Object.keys(content.draft.platformOverrides)) set.add(k as PlatformId);
  }
  if (set.size === 0) set.add('x');
  return Array.from(set);
}

function stagger(platforms: PlatformId[]): Record<PlatformId, number> {
  const out: Partial<Record<PlatformId, number>> = {};
  platforms.forEach((p, i) => {
    out[p] = i * 5;
  });
  return out as Record<PlatformId, number>;
}