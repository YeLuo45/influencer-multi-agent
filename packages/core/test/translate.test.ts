import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  SUPPORTED_LOCALES,
  isSupportedLocale,
  uniqueLocales,
  resolveTargets,
  buildTranslatePrompt,
  parseTranslation,
  translateContent,
  selectForLocale,
  type Locale,
  type LlmTranslator,
} from '../src/translate.js';

void test('SUPPORTED_LOCALES: lists zh / en / ja', () => {
  assert.deepEqual([...SUPPORTED_LOCALES], ['zh', 'en', 'ja']);
});

void test('isSupportedLocale: recognises all three', () => {
  assert.equal(isSupportedLocale('zh'), true);
  assert.equal(isSupportedLocale('en'), true);
  assert.equal(isSupportedLocale('ja'), true);
  assert.equal(isSupportedLocale('fr'), false);
  assert.equal(isSupportedLocale(''), false);
});

void test('uniqueLocales: dedupes and preserves first-seen order', () => {
  assert.deepEqual(uniqueLocales(['en', 'en', 'ja', 'zh']), ['en', 'ja', 'zh']);
  assert.deepEqual(uniqueLocales([]), []);
});

void test('resolveTargets: always includes source', () => {
  assert.deepEqual(resolveTargets(['en', 'ja'], 'zh'), ['en', 'ja', 'zh']);
  assert.deepEqual(resolveTargets([], 'zh'), ['zh']);
  assert.deepEqual(resolveTargets(['en'], 'en'), ['en']);
});

void test('buildTranslatePrompt: includes title and constraints', () => {
  const p = buildTranslatePrompt({ sourceBody: '正文', sourceTitle: 'T', sourceLocale: 'zh', target: 'en' });
  assert.match(p, /Translate to en/);
  assert.match(p, /Title: T/);
  assert.match(p, /Body:\n正文/);
  assert.match(p, /Constraints:/);
});

void test('parseTranslation: extracts Title + Body', () => {
  const raw = 'Title: Hello\n\nBody: This is the body';
  const out = parseTranslation(raw, 'en', 'fallback');
  assert.equal(out.locale, 'en');
  assert.equal(out.title, 'Hello');
  assert.equal(out.body, 'This is the body');
});

void test('parseTranslation: body-only response uses fallback title', () => {
  const out = parseTranslation('just some body text', 'ja', 'デフォルト');
  assert.equal(out.title, 'デフォルト');
  assert.equal(out.body, 'just some body text');
});

void test('parseTranslation: no recognizable shape still returns raw body', () => {
  const out = parseTranslation('  raw  ', 'zh', 'fallback');
  assert.equal(out.locale, 'zh');
  assert.equal(out.body, 'raw');
  assert.equal(out.title, 'fallback');
});

void test('translateContent: source locale passthrough', async () => {
  const calls: string[] = [];
  const llm: LlmTranslator = {
    async complete(prompt: string) { calls.push(prompt); return 'irrelevant'; },
  };
  const r = await translateContent(
    llm,
    { sourceBody: 'zh body', sourceLocale: 'zh', targets: ['zh'] },
    { sourceLocale: 'zh' },
  );
  assert.equal(r.entries.length, 1);
  assert.equal(r.entries[0]!.locale, 'zh');
  assert.equal(r.entries[0]!.body, 'zh body');
  // never call the LLM for passthrough
  assert.equal(calls.length, 0);
});

void test('translateContent: en + ja + zh targets the LLM twice', async () => {
  const calls: string[] = [];
  const llm: LlmTranslator = {
    async complete(prompt: string) {
      calls.push(prompt);
      if (/Translate to en/.test(prompt)) return 'Title: EN-Title\n\nBody: EN-Body';
      if (/Translate to ja/.test(prompt)) return 'Title: JA-Title\n\nBody: JA-Body';
      throw new Error('unexpected prompt');
    },
  };
  const r = await translateContent(
    llm,
    { sourceBody: '正文', sourceTitle: '原标题', sourceLocale: 'zh', targets: ['en', 'ja'] },
    { sourceLocale: 'zh' },
  );
  assert.equal(calls.length, 2);
  assert.equal(r.entries.length, 3);
  const en = r.entries.find((e) => e.locale === 'en')!;
  const ja = r.entries.find((e) => e.locale === 'ja')!;
  const zh = r.entries.find((e) => e.locale === 'zh')!;
  assert.equal(en.title, 'EN-Title');
  assert.equal(en.body, 'EN-Body');
  assert.equal(ja.title, 'JA-Title');
  assert.equal(ja.body, 'JA-Body');
  assert.equal(zh.body, '正文');
  assert.equal(r.fellBackToSource.length, 0);
});

void test('translateContent: LLM failure falls back to source and records fallback', async () => {
  const llm: LlmTranslator = {
    async complete() { throw new Error('429 rate limited'); },
  };
  const r = await translateContent(
    llm,
    { sourceBody: 'zh body', sourceLocale: 'zh', targets: ['en'] },
    { sourceLocale: 'zh' },
  );
  const en = r.entries.find((e) => e.locale === 'en')!;
  assert.equal(en.body, 'zh body'); // fell back
  assert.deepEqual(r.fellBackToSource, ['en']);
});

void test('translateContent: empty body from LLM also falls back', async () => {
  const llm: LlmTranslator = {
    async complete() { return 'Title: \n\nBody: '; },
  };
  const r = await translateContent(
    llm,
    { sourceBody: 'zh body', sourceLocale: 'zh', targets: ['en'] },
    { sourceLocale: 'zh' },
  );
  assert.equal(r.entries.find((e) => e.locale === 'en')!.body, 'zh body');
  assert.deepEqual(r.fellBackToSource, ['en']);
});

void test('selectForLocale: prefers the requested locale', () => {
  const r = {
    entries: [
      { locale: 'zh' as Locale, title: 'Z', body: 'z-body' },
      { locale: 'en' as Locale, title: 'E', body: 'e-body' },
      { locale: 'ja' as Locale, title: 'J', body: 'j-body' },
    ],
    coveredCount: 3,
    fellBackToSource: [],
  };
  const got = selectForLocale(r, 'ja', 'zh');
  assert.equal(got.body, 'j-body');
});

void test('selectForLocale: falls back to source when missing', () => {
  const r: import('../src/translate.js').TranslationResult = {
    entries: [
      { locale: 'zh' as Locale, title: 'Z', body: 'z-body' },
    ],
    coveredCount: 1,
    fellBackToSource: ['en' as Locale],
  };
  const got = selectForLocale(r, 'en', 'zh');
  assert.equal(got.body, 'z-body');
});
