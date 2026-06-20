import type { Content, Idea, PlatformId } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { err, ok } from '../protocol.js';
import { PLATFORMS } from '../types.js';
import { sourceToString } from '../protocol.js';

export class IdeaAgent implements Agent<{ count?: number }, Idea[]> {
  name = 'idea';

  async run(
    input: { count?: number },
    content: Content,
    ctx: AgentContext,
  ): Promise<AgentResult<Idea[]>> {
    if (content.sources.length === 0) return err('no sources to ideate from', true);
    try {
      const corpus = content.sources.map(sourceToString).join('\n\n---\n\n');
      const raw = await ctx.llm.complete(
        `topic: ${content.topic}\ncorpus:\n${corpus}\nReturn JSON array of ideas with angle/hook/score.`,
        { maxTokens: 600 },
      );
      const parsed = parseIdeas(raw);
      const count = input.count ?? 5;
      const ideas: Idea[] = parsed.slice(0, count).map((p, i) => ({
        id: `${content.id}-idea-${i + 1}`,
        angle: p.angle,
        hook: p.hook,
        targetPlatform: pickPlatforms(p.angle),
        score: clamp(p.score ?? 0.6, 0, 1),
      }));
      if (ideas.length === 0) return err('llm returned no ideas', true);
      return ok(ideas);
    } catch (e) {
      return err(`idea failed: ${(e as Error).message}`, true);
    }
  }
}

function pickPlatforms(angle: string): PlatformId[] {
  const lower = angle.toLowerCase();
  const out: PlatformId[] = [];
  if (lower.includes('tech') || lower.includes('agent') || lower.includes('ai')) out.push('x', 'reddit', 'bilibili');
  if (lower.includes('种草') || lower.includes('测评') || lower.includes('生活')) out.push('xiaohongshu');
  if (lower.includes('热点') || lower.includes('娱乐')) out.push('weibo');
  if (out.length === 0) out.push('x', 'xiaohongshu');
  return out;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function parseIdeas(raw: string): Array<{ angle: string; hook: string; score?: number }> {
  const fenced = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/);
  const candidate = fenced ? fenced[1] : raw;
  try {
    const data = JSON.parse(candidate);
    if (Array.isArray(data)) {
      return data.filter((x): x is { angle: string; hook: string; score?: number } =>
        typeof x === 'object' && x !== null && typeof (x as { angle?: unknown }).angle === 'string',
      );
    }
  } catch {
    // fall through
  }
  // 兜底：每行一条 angle
  return raw
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map((l) => ({ angle: l, hook: l, score: 0.6 }));
}

// re-export PLATFORMS for downstream use
export { PLATFORMS };