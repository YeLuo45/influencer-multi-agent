import type { Content, Source } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { err, ok } from '../protocol.js';

const SAMPLE_DOMAINS: ReadonlyArray<{ url: string; title: string }> = [
  { url: 'https://news.example.com/agent-trend', title: 'AI Agent 趋势观察' },
  { url: 'https://blog.example.com/creator-economy-2026', title: '创作者经济 2026 报告' },
  { url: 'https://forum.example.com/t/llm-multi-agent', title: '多 Agent 协作讨论' },
];

export class ResearchAgent implements Agent<{ topic: string }, Source[]> {
  name = 'research';

  async run(
    input: { topic: string },
    _content: Content,
    ctx: AgentContext,
  ): Promise<AgentResult<Source[]>> {
    try {
      const sources: Source[] = [];
      for (const seed of SAMPLE_DOMAINS) {
        const url = `${seed.url}?q=${encodeURIComponent(input.topic)}`;
        const fetched = await ctx.crawler.fetch(url, { render: 'static' });
        const signals = await extractSignals(input.topic, ctx);
        sources.push({
          url: fetched.url,
          title: fetched.title,
          snippet: fetched.markdown.slice(0, 280),
          fetchedAt: ctx.now(),
          signals,
        });
      }
      if (sources.length === 0) return err('no sources', true);
      return ok(sources);
    } catch (e) {
      return err(`research failed: ${(e as Error).message}`, true);
    }
  }
}

async function extractSignals(topic: string, ctx: AgentContext): Promise<string[]> {
  const txt = await ctx.llm.complete(`topic: ${topic}\nExtract 3 signals.`, { maxTokens: 200 });
  return txt
    .split('\n')
    .map((s) => s.replace(/^\d+[\.\)、]\s*/, '').trim())
    .filter((s) => s.length > 0)
    .slice(0, 5);
}