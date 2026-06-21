import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TranslateAgent, PLATFORM_LOCALE } from '../src/agents/translate.js';
import { createContent } from '../src/types.js';
import type { AgentContext } from '../src/protocol.js';

function makeCtx(llmBody: string): AgentContext {
  return {
    llm: { async complete() { return llmBody; } },
    crawler: { async fetch() { return { url: '', title: '', markdown: '' }; } },
    publisher: { async post() { throw new Error('not used'); }, async healthCheck() { return { ok: true, detail: 'mock' }; } },
    now: () => '2026-06-21T00:00:00.000Z',
  };
}

void test('PLATFORM_LOCALE: maps each platform to its preferred locale', () => {
  assert.equal(PLATFORM_LOCALE.x, 'en');
  assert.equal(PLATFORM_LOCALE.xiaohongshu, 'zh');
  assert.equal(PLATFORM_LOCALE.weibo, 'zh');
  assert.equal(PLATFORM_LOCALE.bilibili, 'zh');
  assert.equal(PLATFORM_LOCALE.reddit, 'en');
});

void test('TranslateAgent: missing draft returns recoverable error', async () => {
  const agent = new TranslateAgent();
  const ctx = makeCtx('');
  const c = createContent({ id: 'c-1', topic: 't' });
  const r = await agent.run({ targets: ['en'] }, c, ctx);
  assert.equal(r.kind, 'error');
  if (r.kind === 'error') {
    assert.equal(r.message, 'draft missing');
    assert.equal(r.recoverable, true);
  }
});

void test('TranslateAgent: empty targets returns error', async () => {
  const agent = new TranslateAgent();
  const ctx = makeCtx('');
  const c = createContent({ id: 'c-1', topic: 't' });
  c.draft = { title: 'T', body: 'B', tags: [], coverHint: '', cta: '', platformOverrides: {} };
  const r = await agent.run({ targets: [] }, c, ctx);
  assert.equal(r.kind, 'error');
  if (r.kind === 'error') assert.equal(r.message, 'targets empty');
});

void test('TranslateAgent: returns TranslationResult for valid input', async () => {
  const agent = new TranslateAgent();
  const ctx = makeCtx('Title: EN-Title\n\nBody: EN-Body');
  const c = createContent({ id: 'c-1', topic: 't' });
  c.draft = { title: '原标题', body: '正文', tags: [], coverHint: '', cta: '', platformOverrides: {} };
  const r = await agent.run({ targets: ['en'] }, c, ctx);
  assert.equal(r.kind, 'ok');
  if (r.kind === 'ok') {
    assert.equal(r.data.entries.length, 2);
    const en = r.data.entries.find((e) => e.locale === 'en')!;
    assert.equal(en.title, 'EN-Title');
  }
});

void test('TranslateAgent.attachTo: writes translations onto draft', () => {
  const c = createContent({ id: 'c-1', topic: 't' });
  c.draft = { title: 'T', body: 'zh body', tags: [], coverHint: '', cta: '', platformOverrides: {} };
  c.ideas = [{ id: 'i1', angle: 'a', hook: 'h', targetPlatform: ['x', 'xiaohongshu'], score: 0.5 }];
  const result = {
    entries: [
      { locale: 'zh' as const, title: 'T', body: 'zh body' },
      { locale: 'en' as const, title: 'EN', body: 'en body' },
    ],
    coveredCount: 2,
    fellBackToSource: [],
  };
  const next = TranslateAgent.attachTo(c, result, false);
  assert.equal(next.draft!.translations!.length, 2);
  assert.equal(next.draft!.platformOverrides.x, undefined);
});

void test('TranslateAgent.attachTo: with applyToOverrides populates per-platform body', () => {
  const c = createContent({ id: 'c-1', topic: 't' });
  c.draft = { title: 'T', body: 'zh body', tags: [], coverHint: '', cta: '', platformOverrides: {} };
  c.ideas = [
    { id: 'i1', angle: 'a', hook: 'h', targetPlatform: ['x', 'xiaohongshu', 'weibo', 'bilibili', 'reddit'], score: 0.5 },
  ];
  const result = {
    entries: [
      { locale: 'zh' as const, title: 'T', body: '中文正文' },
      { locale: 'en' as const, title: 'EN-T', body: 'en body' },
      { locale: 'ja' as const, title: 'JA-T', body: 'ja body' },
    ],
    coveredCount: 3,
    fellBackToSource: [],
  };
  const next = TranslateAgent.attachTo(c, result, true);
  assert.equal(next.draft!.platformOverrides.x, 'en body');
  assert.equal(next.draft!.platformOverrides.xiaohongshu, '中文正文');
  assert.equal(next.draft!.platformOverrides.weibo, '中文正文');
  assert.equal(next.draft!.platformOverrides.bilibili, '中文正文');
  assert.equal(next.draft!.platformOverrides.reddit, 'en body');
});
