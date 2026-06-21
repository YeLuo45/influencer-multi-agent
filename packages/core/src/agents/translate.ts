import type { Content, PlatformId } from '../types.js';
import type { Agent, AgentContext, AgentResult } from '../protocol.js';
import { err, ok } from '../protocol.js';
import { translateContent, selectForLocale, type TranslationResult, type Locale } from '../translate.js';

const PLATFORM_LOCALE: Readonly<Record<PlatformId, Locale>> = Object.freeze({
  x: 'en',
  xiaohongshu: 'zh',
  weibo: 'zh',
  bilibili: 'zh',
  reddit: 'en',
});

export interface TranslateInput {
  /** Locales to translate into. `zh` is always included as the source. */
  targets: Locale[];
  /** When true, replace `draft.body` per platform via `platformOverrides`. */
  applyToOverrides?: boolean;
}

export class TranslateAgent implements Agent<TranslateInput, TranslationResult> {
  name = 'translate';

  async run(input: TranslateInput, content: Content, ctx: AgentContext): Promise<AgentResult<TranslationResult>> {
    if (!content.draft) return err('draft missing', true);
    if (input.targets.length === 0) return err('targets empty', true);
    try {
      const result = await translateContent(
        ctx.llm,
        {
          sourceBody: content.draft.body,
          ...(content.draft.title ? { sourceTitle: content.draft.title } : {}),
          sourceLocale: 'zh',
          targets: input.targets,
        },
        { sourceLocale: 'zh' },
      );
      // Persist the translations on the draft. The pipeline dispatcher reads
      // content.draft.translations after this agent returns.
      return ok(result);
    } catch (e) {
      return err(`translate failed: ${(e as Error).message}`, true);
    }
  }

  /**
   * Helper called by pipeline dispatch to merge the translation result back
   * into the content (so we keep Agent return-type pure).
   */
  static attachTo(content: Content, result: TranslationResult, applyToOverrides = false): Content {
    if (!content.draft) return content;
    const draft = { ...content.draft, translations: result.entries };
    if (!applyToOverrides) return { ...content, draft };
    return { ...content, draft: { ...draft, platformOverrides: buildOverrides(result, content) } };
  }
}

function buildOverrides(
  result: TranslationResult,
  content: Content,
): Partial<Record<PlatformId, string>> {
  const out: Partial<Record<PlatformId, string>> = { ...content.draft!.platformOverrides };
  const platforms = new Set<PlatformId>();
  for (const idea of content.ideas) for (const p of idea.targetPlatform) platforms.add(p);
  if (platforms.size === 0) {
    for (const p of ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit'] as PlatformId[]) platforms.add(p);
  }
  for (const p of platforms) {
    const locale = PLATFORM_LOCALE[p];
    const entry = selectForLocale(result, locale, 'zh');
    out[p] = entry.body;
  }
  return out;
}

export { PLATFORM_LOCALE };

