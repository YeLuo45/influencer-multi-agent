import type { Content, Draft } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { err, ok } from '../protocol.js';

export class DraftAgent implements Agent<{ ideaIndex?: number }, Draft> {
  name = 'draft';

  async run(
    input: { ideaIndex?: number },
    content: Content,
    ctx: AgentContext,
  ): Promise<AgentResult<Draft>> {
    if (content.ideas.length === 0) return err('no ideas available', true);
    try {
      const idx = clamp(input.ideaIndex ?? 0, 0, content.ideas.length - 1);
      const idea = content.ideas[idx]!;
      const title = await ctx.llm.complete(
        `topic: ${content.topic}\nidea angle: ${idea.angle}\nhook: ${idea.hook}\nGenerate a Chinese title.`,
        { maxTokens: 80 },
      );
      const body = await ctx.llm.complete(
        `topic: ${content.topic}\ntitle: ${title}\nangle: ${idea.angle}\nWrite a 200-word Chinese post body.`,
        { maxTokens: 500 },
      );
      const draft: Draft = {
        title: title.trim(),
        body: body.trim(),
        tags: deriveTags(content.topic),
        coverHint: `${content.topic} ${idea.angle}（视觉建议：3:4 比例，重点突出）`,
        cta: '评论区聊聊你踩过哪些坑 👇',
        platformOverrides: {},
      };
      return ok(draft);
    } catch (e) {
      return err(`draft failed: ${(e as Error).message}`, true);
    }
  }
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function deriveTags(topic: string): string[] {
  const tags = new Set<string>();
  tags.add(`#${topic.replace(/\s+/g, '')}`);
  tags.add('#大V观察');
  tags.add('#热点');
  return Array.from(tags);
}