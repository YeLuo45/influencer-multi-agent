export const SUPPORTED_LOCALES = ['zh', 'en', 'ja'] as const;
export type Locale = typeof SUPPORTED_LOCALES[number];

export interface TranslationInput {
  /** Original content in source locale (typically `zh`). */
  sourceBody: string;
  /** Optional original title; translations return translated title alongside. */
  sourceTitle?: string;
  /** Source locale tag — affects how MockLlm shapes its stub response. */
  sourceLocale: Locale;
  /** Target locales to translate into. `sourceLocale` is always included. */
  targets: readonly Locale[];
}

export interface TranslatedEntry {
  locale: Locale;
  title: string;
  body: string;
}

export interface TranslationResult {
  entries: TranslatedEntry[];
  /** How many targets the LLM call covered (== entries.length for success). */
  coveredCount: number;
  /** Targets that fell back to the source because the LLM did not produce. */
  fellBackToSource: Locale[];
}

export function isSupportedLocale(value: string): value is Locale {
  return (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

export function uniqueLocales(locales: readonly Locale[]): Locale[] {
  const seen = new Set<Locale>();
  const out: Locale[] = [];
  for (const l of locales) {
    if (!seen.has(l)) {
      seen.add(l);
      out.push(l);
    }
  }
  return out;
}

export function resolveTargets(targets: readonly Locale[], source: Locale): Locale[] {
  const merged = uniqueLocales([...targets, source]);
  return merged;
}

export interface TranslatePromptInput {
  sourceBody: string;
  sourceTitle?: string;
  sourceLocale: Locale;
  target: Locale;
}

export function buildTranslatePrompt(input: TranslatePromptInput): string {
  const head = `Translate to ${input.target}`;
  const body = input.sourceBody;
  const titleLine = input.sourceTitle ? `Title: ${input.sourceTitle}\n` : '';
  return `${head}\n\n${titleLine}Body:\n${body}\n\nConstraints: keep marketing tone, preserve hashtags, do not add new facts.`;
}

/**
 * Parse a single translation out of a raw LLM response. The expected shape is
 * `Title: <t>\n\nBody: <b>`. Anything we can't parse is treated as a body-only
 * response with a synthesized title.
 */
export function parseTranslation(raw: string, target: Locale, fallbackTitle: string): TranslatedEntry {
  const titleMatch = raw.match(/^\s*Title:\s*([^\n]+)/i);
  const bodyMatch = raw.match(/\n\s*Body:\s*([\s\S]+)$/i);
  if (titleMatch && bodyMatch) {
    return { locale: target, title: titleMatch[1]!.trim(), body: bodyMatch[1]!.trim() };
  }
  if (bodyMatch) {
    return { locale: target, title: fallbackTitle, body: bodyMatch[1]!.trim() };
  }
  return { locale: target, title: fallbackTitle, body: raw.trim() };
}

export interface LlmTranslator {
  complete(prompt: string, opts?: { system?: string; maxTokens?: number; temperature?: number }): Promise<string>;
}

export interface TranslateOptions {
  /** Locale used as the "passthrough" — already in source, copied verbatim. */
  sourceLocale: Locale;
  /** Optional fallback title for the body-only / fallback case. */
  fallbackTitle?: string;
  now?: string;
}

/**
 * Translate one piece of content into the requested target locales. Pure
 * function over the LLM interface; persistence is the caller's job.
 */
export async function translateContent(
  llm: LlmTranslator,
  input: TranslationInput,
  opts: TranslateOptions,
): Promise<TranslationResult> {
  const targets = resolveTargets(input.targets, opts.sourceLocale);
  const entries: TranslatedEntry[] = [];
  const fellBack: Locale[] = [];

  for (const t of targets) {
    if (t === opts.sourceLocale) {
      entries.push({
        locale: opts.sourceLocale,
        title: input.sourceTitle ?? '',
        body: input.sourceBody,
      });
      continue;
    }
    const prompt = buildTranslatePrompt({
      sourceBody: input.sourceBody,
      ...(input.sourceTitle !== undefined ? { sourceTitle: input.sourceTitle } : {}),
      sourceLocale: input.sourceLocale,
      target: t,
    });
    try {
      const raw = await llm.complete(prompt, { maxTokens: 600, temperature: 0.4 });
      const parsed = parseTranslation(raw, t, opts.fallbackTitle ?? input.sourceTitle ?? '');
      if (!parsed.body) {
        entries.push({ locale: t, title: input.sourceTitle ?? '', body: input.sourceBody });
        fellBack.push(t);
        continue;
      }
      entries.push(parsed);
    } catch {
      // LLM failed — keep the source copy so callers still have something
      // to post. Marked in `fellBackToSource` for visibility.
      entries.push({ locale: t, title: input.sourceTitle ?? '', body: input.sourceBody });
      fellBack.push(t);
    }
  }
  return { entries, coveredCount: entries.length, fellBackToSource: fellBack };
}

/**
 * Pick the best entry for a given platform based on that platform's
 * preferred locale. Falls back to source locale when the requested locale is
 * missing.
 */
export function selectForLocale(
  result: TranslationResult,
  preferred: Locale,
  source: Locale,
): TranslatedEntry {
  const direct = result.entries.find((e) => e.locale === preferred);
  if (direct) return direct;
  const src = result.entries.find((e) => e.locale === source);
  if (src) return src;
  return result.entries[0]!;
}
