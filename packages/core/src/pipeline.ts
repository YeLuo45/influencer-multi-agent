import { randomUUID } from 'node:crypto';
import { assertTransition, InvalidTransition, isTerminal } from './state-machine.js';
import type { Content, ContentStage, HistoryEntry } from './types.js';
import { createContent } from './types.js';
import type { AgentContext } from './protocol.js';
import {
  ResearchAgent,
  IdeaAgent,
  DraftAgent,
  ReviewAgent,
  ScheduleAgent,
  PublishAgent,
  AuditAgent,
} from './agents/index.js';

export interface PipelineOptions {
  maxRevisionRounds?: number;
  ideaCount?: number;
}

const DEFAULT_MAX_REVISIONS = 3;

export class Pipeline {
  private readonly research = new ResearchAgent();
  private readonly idea = new IdeaAgent();
  private readonly draft = new DraftAgent();
  private readonly review = new ReviewAgent();
  private readonly schedule = new ScheduleAgent();
  private readonly publish = new PublishAgent();
  private readonly audit = new AuditAgent();
  private readonly maxRevisions: number;
  private readonly ideaCount: number;

  constructor(private readonly ctx: AgentContext, opts: PipelineOptions = {}) {
    this.maxRevisions = opts.maxRevisionRounds ?? DEFAULT_MAX_REVISIONS;
    this.ideaCount = opts.ideaCount ?? 5;
  }

  static createContent(topic: string, persona?: string): Content {
    return createContent({ id: `c-${randomUUID().slice(0, 8)}`, topic, ...(persona ? { persona } : {}) });
  }

  async step(content: Content): Promise<{ content: Content; advanced: boolean }> {
    if (isTerminal(content.stage)) return { content, advanced: false };
    const result = await this.dispatch(content);
    if (!result.ok) return { content, advanced: false };
    return { content: result.content, advanced: result.advanced };
  }

  async run(content: Content): Promise<Content> {
    let cur = content;
    let safety = 32;
    while (!isTerminal(cur.stage) && safety-- > 0) {
      const res = await this.step(cur);
      if (!res.advanced) break;
      cur = res.content;
    }
    return cur;
  }

  private async dispatch(content: Content): Promise<{ ok: true; content: Content; advanced: boolean } | { ok: false }> {
    const from = content.stage;
    switch (from) {
      case 'intake':
        return this.simpleTransition(content, 'research');
      case 'research': {
        const r = await this.research.run({ topic: content.topic }, content, this.ctx);
        if (r.kind !== 'ok') return { ok: false };
        return this.applyOk(content, 'ideas', 'research', `captured ${r.data.length} sources`, (c) => ({ ...c, sources: r.data }));
      }
      case 'ideas': {
        const r = await this.idea.run({ count: this.ideaCount }, content, this.ctx);
        if (r.kind !== 'ok') return { ok: false };
        return this.applyOk(content, 'draft', 'idea', `generated ${r.data.length} ideas`, (c) => ({ ...c, ideas: r.data }));
      }
      case 'draft': {
        const r = await this.draft.run({ ideaIndex: 0 }, content, this.ctx);
        if (r.kind !== 'ok') return { ok: false };
        return this.applyOk(content, 'review', 'draft', `drafted: ${r.data.title}`, (c) => ({ ...c, draft: r.data }));
      }
      case 'review': {
        const r = await this.review.run(undefined, content, this.ctx);
        if (r.kind !== 'ok') return { ok: false };
        const next: ContentStage = r.data.decision === 'approve' ? 'publish' : 'needs_revision';
        const reason = `${r.data.decision} (${r.data.reasons.join('; ') || 'ok'})`;
        return this.applyOk(content, next, 'review', reason, (c) => ({ ...c, review: r.data }));
      }
      case 'needs_revision': {
        if (content.revisionCount >= this.maxRevisions) {
          // 强制 done，避免无限循环
          return this.applyOk(content, 'done', 'pipeline', 'max revisions reached, capping to done', (c) => c);
        }
        return this.applyOk(
          content,
          'draft',
          'pipeline',
          `revision round ${content.revisionCount + 1}`,
          (c) => ({ ...c, revisionCount: c.revisionCount + 1, review: null }),
        );
      }
      case 'publish': {
        const sched = await this.schedule.run(undefined, content, this.ctx);
        const r = await this.publish.run(undefined, content, this.ctx);
        if (r.kind !== 'ok') return { ok: false };
        const audit = await this.audit.run(undefined, content, this.ctx);
        const note = audit.kind === 'ok' ? audit.data.note : 'published';
        const schedData = sched.kind === 'ok' ? sched.data : null;
        return this.applyOk(
          content,
          'done',
          'publish',
          note,
          (c) => ({
            ...c,
            posts: r.data,
            ...(schedData ? { schedule: schedData } : {}),
          }),
        );
      }
      case 'done':
        return { ok: false };
    }
  }

  private simpleTransition(content: Content, to: ContentStage): { ok: true; content: Content; advanced: boolean } {
    assertTransition(content.stage, to);
    const next: Content = {
      ...content,
      stage: to,
      updatedAt: this.ctx.now(),
      history: [...content.history, this.entry(content.stage, to, 'pipeline', `auto ${content.stage}->${to}`)],
    };
    return { ok: true, content: next, advanced: true };
  }

  private applyOk(
    content: Content,
    to: ContentStage,
    agent: string,
    note: string,
    mutate: (c: Content) => Content,
  ): { ok: true; content: Content; advanced: boolean } {
    try {
      assertTransition(content.stage, to);
    } catch (e) {
      if (e instanceof InvalidTransition) {
        // 兜底：若 review 决策后需要走 needs_revision 但状态不允许，记入 history
        const entry = this.entry(content.stage, content.stage, agent, `blocked: ${e.message}`);
        return { ok: true, content: { ...content, history: [...content.history, entry], updatedAt: this.ctx.now() }, advanced: false };
      }
      throw e;
    }
    const mutated = mutate(content);
    const next: Content = {
      ...mutated,
      stage: to,
      updatedAt: this.ctx.now(),
      history: [...mutated.history, this.entry(content.stage, to, agent, note)],
    };
    return { ok: true, content: next, advanced: true };
  }

  private entry(from: ContentStage, to: ContentStage, agent: string, note: string): HistoryEntry {
    return { from, to, agent, note, at: this.ctx.now() };
  }
}