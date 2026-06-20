import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Pipeline, createContent, type Content } from '../src/index.js';
import { InvalidTransition, assertTransition } from '../src/state-machine.js';
import type { AgentContext } from '../src/protocol.js';
import type { PostRecord, PlatformId } from '../src/types.js';

function makeCtx(): AgentContext {
  return {
    llm: {
      async complete(prompt: string) {
        if (prompt.includes('Extract 3 signals')) {
          return '1) AI agent adoption growing\n2) Cost dropping\n3) More use cases';
        }
        if (prompt.includes('Return JSON array')) {
          return JSON.stringify([
            { angle: `${prompt.includes('Agent') ? 'AI Agent' : 'Topic'} 反共识`, hook: '99% 的人忽略', score: 0.85 },
            { angle: `${prompt.includes('Agent') ? 'AI Agent' : 'Topic'} 实操 3 步`, hook: '亲测有效', score: 0.7 },
          ]);
        }
        if (prompt.includes('Generate a Chinese title')) return 'AI Agent 趋势：3 个被低估的真相';
        if (prompt.includes('Write a 200-word Chinese post body')) return '我观察到 AI Agent 趋势已经全面爆发。\n\n为什么？三个信号：1) 流量结构变化，从搜索转向推荐；2) 用户行为分层，专业用户更愿意付费；3) 平台规则迭代，新算法对优质内容更友好。\n\n机会在哪？把老问题用新工具重做一次。普通玩家用 AI 工具降本，资深玩家用 AI 工具提质。\n\n#AI #大V观察 #趋势';
        return 'mock-llm ok';
      },
    },
    crawler: {
      async fetch(url: string) {
        return {
          url,
          title: `title-for-${url}`,
          markdown: `body for ${url}`,
        };
      },
    },
    publisher: {
      async post(platform: PlatformId): Promise<PostRecord> {
        return {
          platform,
          postId: `${platform}-mock`,
          status: 'posted',
          url: `https://${platform}.example.com/p/mock`,
          postedAt: new Date().toISOString(),
        };
      },
      async healthCheck(platform: PlatformId) {
        return { ok: true, detail: `${platform} ok` };
      },
    },
    now: () => new Date().toISOString(),
  };
}

test('pipeline: full happy path runs to done', async () => {
  const ctx = makeCtx();
  const pipeline = new Pipeline(ctx, { ideaCount: 2 });
  const c = createContent({ id: 'c-happy-1', topic: 'AI Agent 趋势' });
  const final = await pipeline.run(c);
  assert.equal(final.stage, 'done');
  assert.ok(final.sources.length >= 1);
  assert.ok(final.ideas.length >= 1);
  assert.ok(final.draft);
  assert.ok(final.review);
  assert.equal(final.review!.decision, 'approve');
  assert.ok(final.posts.length >= 1);
  assert.ok(final.posts.every((p) => p.status === 'posted'));
  // history should cover intake -> ... -> done
  assert.ok(final.history.length >= 6);
});

test('pipeline: step advances exactly one stage', async () => {
  const ctx = makeCtx();
  const pipeline = new Pipeline(ctx, { ideaCount: 2 });
  const c = createContent({ id: 'c-step-1', topic: 'X 趋势' });
  const r1 = await pipeline.step(c);
  assert.equal(r1.advanced, true);
  assert.equal(r1.content.stage, 'research');
});

test('pipeline: rejects invalid transitions via state machine', () => {
  assert.throws(() => assertTransition('intake', 'draft'), InvalidTransition);
});

test('pipeline: terminal done is stable', async () => {
  const ctx = makeCtx();
  const pipeline = new Pipeline(ctx, { ideaCount: 2 });
  const c: Content = {
    ...createContent({ id: 'c-terminal', topic: 't' }),
    stage: 'done',
  };
  const r = await pipeline.step(c);
  assert.equal(r.advanced, false);
});

test('pipeline: history records agent names', async () => {
  const ctx = makeCtx();
  const pipeline = new Pipeline(ctx, { ideaCount: 2 });
  const c = createContent({ id: 'c-hist-1', topic: 't' });
  const final = await pipeline.run(c);
  const agents = new Set(final.history.map((h) => h.agent));
  assert.ok(agents.has('research'));
  assert.ok(agents.has('idea'));
  assert.ok(agents.has('draft'));
  assert.ok(agents.has('review'));
  assert.ok(agents.has('publish'));
});