import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline } from '../src/pipeline.js';
import { createContent, type Content, type EngagementMetric, type PostRecord } from '../src/types.js';
import type { Locale } from '../src/translate.js';
import type { AgentContext } from '../src/protocol.js';

function happyLlm(prompt: string): string {
  if (prompt.includes('Generate a Chinese title')) return 'AI Agent 趋势：3 个被低估的真相';
  if (prompt.includes('Write a 200-word Chinese post body')) return '我观察到 AI Agent 趋势已经全面爆发，行业进入新一轮洗牌期。\n\n为什么？三个核心信号同时亮起：第一，流量结构正在从搜索转向推荐，专业用户的触达效率倍增；第二，用户行为分层加剧，深度的垂类创作者更受平台青睐；第三，平台规则迭代，新算法对优质原创更加友好，普通玩家拼执行力，资深玩家拼判断力。\n\n机会在哪？把老问题用新工具重做一次。\n\n关键动作：先选一个细分场景跑通闭环，再横向扩展到 3-5 个相似场景，最后沉淀成可复用的 SOP。\n\n#AI #大V观察 #趋势 #内容创作';
  if (prompt.includes('Return JSON array')) return JSON.stringify([
    { angle: 'AI Agent 趋势 趋势 A', hook: '99% 忽略', score: 0.85 },
    { angle: 'AI Agent 趋势 趋势 B', hook: '亲测', score: 0.7 },
  ]);
  if (prompt.includes('Extract 3 signals')) return '1) Adoption\n2) Cost\n3) Use cases';
  if (prompt.includes('platform-specific rewrite')) return '我观察到 AI Agent 趋势正在全面爆发。';
  if (prompt.includes('translate to english')) return 'Title: AI Agent Trends: 3 Underrated Truths\n\nBody: I have observed that the AI Agent trend is exploding. Three core signals drive the shift, and the opportunity is to redo the old problems with new tools. Detailed analysis follows for serious readers, with actionable next steps you can apply this week. Use these insights to sharpen your content playbook and pick the right platform for your voice.';
  if (prompt.includes('translate to japanese')) return 'Title: AI Agent トレンド：見落とされている3つの真実\n\nBody: AI Agent トレンドの全面的な爆発を観察しています。三つのコアシグナルが変化を駆動し、機会は新しいツールで古い問題を再構築することです。詳細な分析と今週適用できる実行可能な手順が続きます。';
  if (prompt.includes('Check this draft')) return JSON.stringify({ decision: 'approve', reasons: [] });
  return 'ok';
}

function makeCtx(overrides: Partial<AgentContext> = {}): AgentContext {
  return {
    llm: { complete: async (p) => happyLlm(p) },
    crawler: { async fetch() { return { url: 'u', title: 't', markdown: 'm' }; } },
    publisher: {
      async post(platform): Promise<PostRecord> {
        return { platform, postId: `${platform}-p`, status: 'posted', url: null, postedAt: '2026-06-21T00:00:00.000Z' };
      },
      async healthCheck() { return { ok: true, detail: '' }; },
    },
    now: () => '2026-06-21T00:00:00.000Z',
    ...overrides,
  };
}

void test('pipeline: full happy path through every stage', async () => {
  const pipeline = new Pipeline(makeCtx(), { ideaCount: 2 });
  const c = createContent({ id: 'c-pipe-happy', topic: 'AI Agent 趋势' });
  const final = await pipeline.run(c);
  if (final.stage !== 'done') {
    console.error('DEBUG final stage', final.stage, 'reasons', final.review?.reasons, 'history', final.history.slice(-3));
  }
  assert.equal(final.stage, 'done');
  assert.ok(final.draft);
  assert.ok(final.posts.length >= 1);
});

void test('pipeline: needs_revision branch returns to draft with revisionCount++', async () => {
  const ctx = makeCtx();
  const pipeline = new Pipeline(ctx, { ideaCount: 1, maxRevisionRounds: 2 });
  // Stage is 'review' with a too-short draft so runChecks() flags length.
  // That sends the pipeline into the needs_revision branch and proves
  // the revision counter increments on the way back to draft.
  const c: Content = {
    ...createContent({ id: 'c-pipe-revise', topic: 'AI Agent 趋势' }),
    stage: 'review',
    sources: [{ url: 'u', title: 'T', snippet: 'S', fetchedAt: '2026-06-21T00:00:00.000Z', signals: [] }],
    ideas: [{ id: 'idea-1', angle: 'AI Agent 趋势 趋势 A', hook: 'h', targetPlatform: ['x'], score: 0.7 }],
    draft: { title: 'AI Agent 趋势', body: '短', tags: ['a', 'b'], coverHint: 'h', cta: 'c', translations: [], platformOverrides: {} },
  };
  const final = await pipeline.run(c);
  assert.ok(final.revisionCount >= 1, `expected revisionCount>=1, got ${final.revisionCount}`);
});

void test('pipeline: maxRevisionRounds caps to done instead of infinite loop', async () => {
  const ctx = makeCtx();
  const pipeline = new Pipeline(ctx, { ideaCount: 1, maxRevisionRounds: 1 });
  // Pre-load a content already at needs_revision with revisionCount = maxRevisions
  // so the very next dispatch takes the cap branch.
  const c: Content = {
    ...createContent({ id: 'c-pipe-cap', topic: 'AI Agent 趋势' }),
    stage: 'needs_revision',
    sources: [{ url: 'u', title: 'T', snippet: 'S', fetchedAt: '2026-06-21T00:00:00.000Z', signals: [] }],
    ideas: [{ id: 'idea-1', angle: 'AI Agent 趋势 趋势 A', hook: 'h', targetPlatform: ['x'], score: 0.7 }],
    draft: { title: 'AI Agent 趋势', body: '短', tags: ['a', 'b'], coverHint: 'h', cta: 'c', translations: [], platformOverrides: {} },
    revisionCount: 1,
  };
  const final = await pipeline.run(c);
  assert.equal(final.stage, 'done');
});

void test('pipeline: translateTargets is honoured when set', async () => {
  const pipeline = new Pipeline(makeCtx(), { ideaCount: 2, translateTargets: ['en' as Locale, 'ja' as Locale] });
  const c = createContent({ id: 'c-pipe-trans', topic: 'AI Agent 趋势' });
  const final = await pipeline.run(c);
  assert.ok(final.draft);
  assert.ok(final.draft!.translations);
  // source (zh) + en + ja = 3 entries
  assert.equal(final.draft!.translations!.length, 3);
});

void test('pipeline: persona lookup is plumbed into the idea prompt', async () => {
  let seen = '';
  const ctx = makeCtx({
    llm: {
      async complete(prompt: string) {
        if (prompt.includes('Return JSON array')) {
          seen = prompt;
          return JSON.stringify([{ angle: 'AI Agent 趋势 趋势 A', hook: 'h', score: 0.7 }]);
        }
        return happyLlm(prompt);
      },
    },
  });
  const pipeline = new Pipeline(ctx, {
    ideaCount: 1,
    personaLookup: (id) => id === 'tech-insight' ? {
      id: 'tech-insight', name: '技术洞察家', tone: 'analytical', targetAudience: 'devs',
      signaturePhrases: ['实测数据'], bannedWords: [], defaultPlatforms: ['x'], examples: [],
      createdAt: '2026-06-21T00:00:00.000Z', updatedAt: '2026-06-21T00:00:00.000Z',
    } : null,
  });
  const c = createContent({ id: 'c-pipe-persona', topic: 'AI Agent 趋势', persona: 'tech-insight' });
  await pipeline.run(c);
  assert.match(seen, /实测数据/);
});

void test('pipeline: stage skip (done->publish) returns ok=false via dispatch', async () => {
  const pipeline = new Pipeline(makeCtx(), { ideaCount: 1 });
  const c: Content = { ...createContent({ id: 'c-pipe-done', topic: 'AI Agent 趋势' }), stage: 'done' };
  const res = await pipeline.step(c);
  assert.equal(res.advanced, false);
});

void test('pipeline: feedback re-ranks ideas when provided', async () => {
  const fb: EngagementMetric[] = [
    { platform: 'x', postId: 'p1', likes: 1000, comments: 0, shares: 0, views: 0, fetchedAt: '2026-06-21T00:00:00.000Z' },
  ];
  const pipeline = new Pipeline(makeCtx(), { ideaCount: 2, feedback: fb });
  const c = createContent({ id: 'c-pipe-fb', topic: 'AI Agent 趋势' });
  const final = await pipeline.run(c);
  assert.ok(final.ideas.length >= 1);
  assert.equal(final.ideas[0]!.angle, 'AI Agent 趋势 趋势 A');
});
