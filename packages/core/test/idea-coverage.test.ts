import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IdeaAgent } from '../src/agents/idea.js';
import type { AgentContext, AgentResult } from '../src/protocol.js';
import { createContent, type Content, type EngagementMetric, type Idea, type Persona } from '../src/types.js';

function makeCtx(llm: AgentContext['llm']): AgentContext {
  return {
    llm,
    crawler: { async fetch() { return { url: 'u', title: 't', markdown: 'm' }; } },
    publisher: {
      async post() { return { platform: 'x', postId: 'p', status: 'posted', url: null, postedAt: '2026-06-21T00:00:00.000Z' }; },
      async healthCheck() { return { ok: true, detail: '' }; },
    },
    now: () => '2026-06-21T00:00:00.000Z',
  };
}

void test('IdeaAgent: returns recoverable error when no sources', async () => {
  const c: Content = { ...createContent({ id: 'c-idea-no-src', topic: 'x' }), stage: 'ideas', sources: [] };
  const agent = new IdeaAgent();
  const r: AgentResult<Idea[]> = await agent.run({ count: 5 }, c, makeCtx({
    async complete() { throw new Error('unreachable'); },
  }));
  assert.equal(r.kind, 'error');
  if (r.kind === 'error') {
    assert.equal(r.recoverable, true);
    assert.match(r.message, /no sources/);
  }
});

void test('IdeaAgent: tags ideas with A/B variantTag when variantCount > 1', async () => {
  const c: Content = {
    ...createContent({ id: 'c-idea-ab', topic: 'AI Agent 趋势' }),
    stage: 'ideas',
    sources: [{ url: 'u1', title: 'T1', snippet: 'S1' }],
  };
  const agent = new IdeaAgent();
  const r: AgentResult<Idea[]> = await agent.run(
    { count: 4, variantCount: 3 },
    c,
    makeCtx({
      async complete() {
        return JSON.stringify([
          { angle: 'AI Agent x', hook: 'a', score: 0.9 },
          { angle: 'AI Agent y', hook: 'b', score: 0.8 },
          { angle: 'AI Agent z', hook: 'c', score: 0.7 },
        ]);
      },
    }),
  );
  assert.equal(r.kind, 'ok');
  if (r.kind === 'ok') {
    const tags = r.data.map((i) => i.variantTag);
    assert.deepEqual(tags, ['A', 'B', 'C']);
  }
});

void test('IdeaAgent: applies feedback ranker when feedback is non-empty', async () => {
  const c: Content = {
    ...createContent({ id: 'c-idea-fb', topic: 'AI Agent 趋势' }),
    stage: 'ideas',
    sources: [{ url: 'u1', title: 'T1', snippet: 'S1' }],
  };
  const fb: EngagementMetric[] = [
    { platform: 'x', postId: 'p1', likes: 1000, comments: 0, shares: 0, views: 0, fetchedAt: '2026-06-21T00:00:00.000Z' },
  ];
  const agent = new IdeaAgent();
  const r: AgentResult<Idea[]> = await agent.run(
    { count: 3, feedback: fb },
    c,
    makeCtx({
      async complete() {
        return JSON.stringify([
          { angle: 'AI Agent 趋势 趋势 A', hook: 'a', score: 0.7 },
          { angle: 'something else', hook: 'b', score: 0.7 },
        ]);
      },
    }),
  );
  assert.equal(r.kind, 'ok');
  if (r.kind === 'ok') {
    // feedback ranker should prefer the angle that matches the
    // historical best performer ('AI Agent 趋势 趋势 A').
    assert.ok(r.data.length >= 1);
    assert.equal(r.data[0]!.angle, 'AI Agent 趋势 趋势 A');
  }
});

void test('IdeaAgent: parses ideas via line-split fallback when JSON fails', async () => {
  const c: Content = {
    ...createContent({ id: 'c-idea-fb2', topic: 't' }),
    stage: 'ideas',
    sources: [{ url: 'u1', title: 'T1', snippet: 'S1' }],
  };
  const agent = new IdeaAgent();
  const r: AgentResult<Idea[]> = await agent.run(
    { count: 2 },
    c,
    makeCtx({
      async complete() {
        return 'not even close to JSON\nangle one\nangle two';
      },
    }),
  );
  assert.equal(r.kind, 'ok');
  if (r.kind === 'ok') {
    assert.equal(r.data.length, 2);
  }
});

void test('IdeaAgent: applies persona to the prompt before calling LLM', async () => {
  const c: Content = {
    ...createContent({ id: 'c-idea-persona', topic: 'AI' }),
    stage: 'ideas',
    sources: [{ url: 'u', title: 'T', snippet: 'S' }],
  };
  const persona: Persona = {
    id: 'tech-insight',
    name: '技术洞察家',
    tone: 'analytical',
    targetAudience: 'devs',
    signaturePhrases: ['实测数据', '技术要点'],
    bannedWords: ['震惊'],
    defaultPlatforms: ['x'],
    examples: [],
    createdAt: '2026-06-21T00:00:00.000Z',
    updatedAt: '2026-06-21T00:00:00.000Z',
  };
  let seen = '';
  const agent = new IdeaAgent();
  const r: AgentResult<Idea[]> = await agent.run(
    { count: 2, persona },
    c,
    makeCtx({
      async complete(prompt) {
        seen = prompt;
        return JSON.stringify([{ angle: 'x', hook: 'y', score: 0.5 }]);
      },
    }),
  );
  assert.equal(r.kind, 'ok');
  assert.match(seen, /signature phrases/i);
  assert.match(seen, /banned words/i);
});
