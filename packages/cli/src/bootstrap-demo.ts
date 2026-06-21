// Bootstrap demo: 创建 3 条 content 走完整 pipeline (含 persona)
import { createApp, saveContent } from './app.js';
import {
  Pipeline,
  type Content,
  type EngagementMetric,
  type Llm,
  type PlatformId,
  type PostRecord,
} from '@ima/core';
import { createContent as makeContent } from '@ima/core';

interface DemoSpec {
  topic: string;
  personaId: string;
}

export const BOOTSTRAP_DEMOS: DemoSpec[] = [
  { topic: 'AI Agent 趋势：2026 年谁主沉浮', personaId: 'tech-insight' },
  { topic: '小红书种草心得：从 0 到 1 万粉', personaId: 'lifestyle' },
  { topic: 'B 站科技区爆款规律：标题、配乐、剪辑', personaId: 'tech-insight' },
];

export interface RunBootstrapOptions {
  app: ReturnType<typeof createApp>;
  now?: () => string;
  llm?: Llm;
  writeBackToFeedback?: boolean;
  demos?: DemoSpec[];
}

export interface RunBootstrapResult {
  contents: Content[];
  feedbackAppended: number;
}

export function defaultBootstrapOptions(): { llm: Llm; writeBackToFeedback: boolean; now: () => string; demos: DemoSpec[] } {
  // mock LLM is the safe default; real LLM callers should pass an Llm impl
  // and optionally a fetch override.
  return {
    llm: { provider: 'mock', model: 'mock-llm', async complete() { return 'mock'; } },
    writeBackToFeedback: false,
    now: () => new Date().toISOString(),
    demos: BOOTSTRAP_DEMOS,
  };
}

/**
 * Run the canonical bootstrap demo: create N contents, drive each through the
 * pipeline, and optionally write a synthesised engagement row per posted
 * post into feedback.json (closing the feedback loop in v0.8+).
 */
export async function runBootstrapDemo(opts: RunBootstrapOptions): Promise<RunBootstrapResult> {
  const now = opts.now ?? (() => new Date().toISOString());
  const demos = opts.demos ?? BOOTSTRAP_DEMOS;
  const result: RunBootstrapResult = { contents: [], feedbackAppended: 0 };
  for (const spec of demos) {
    const c = Pipeline.createContent(spec.topic, spec.personaId);
    const final = await opts.app.pipeline.run(c);
    await saveContent(opts.app.store, final);
    result.contents.push(final);
    console.log(`[bootstrap] ${final.id} (${spec.personaId}) -> ${final.stage} (${final.posts.length} posts) topic="${final.topic}"`);
  }
  if (opts.writeBackToFeedback) {
    const metrics: EngagementMetric[] = [];
    for (const c of result.contents) {
      for (const post of c.posts) {
        if (!post.postId) continue;
        metrics.push(synthesiseMetric(post, c, now()));
      }
    }
    const { appendFeedback, emptyFeedback } = await import('@ima/core');
    const cur = (await opts.app.store.read<{ records: never; windowDays: number; lastUpdated: string; totalRecords: number }>('feedback.json')) ?? emptyFeedback(now());
    const next = appendFeedback(cur as never, metrics, now());
    await opts.app.store.write('feedback.json', next);
    result.feedbackAppended = metrics.length;
  }
  return result;
}

function synthesiseMetric(post: PostRecord, content: Content, fetchedAt: string): EngagementMetric {
  // Deterministic synthetic metrics so the smoke can run offline.
  const seed = `${content.id}:${post.postId}`;
  const likes = Math.abs(hash(seed)) % 50 + 5;
  const comments = Math.abs(hash(seed + ':c')) % 10;
  const shares = Math.abs(hash(seed + ':s')) % 5;
  const views = likes * 30 + comments * 5;
  return {
    platform: post.platform,
    postId: post.postId ?? '',
    likes,
    comments,
    shares,
    views,
    fetchedAt,
    ...(post.variantTag ? { variantTag: post.variantTag } : {}),
  };
}

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}

async function main(): Promise<void> {
  const app = createApp();
  const summary: Array<{ id: string; topic: string; persona: string; stage: string; posts: number }> = [];
  for (const spec of BOOTSTRAP_DEMOS) {
    const c = Pipeline.createContent(spec.topic, spec.personaId);
    const final = await app.pipeline.run(c);
    await saveContent(app.store, final);
    summary.push({
      id: final.id,
      topic: final.topic,
      persona: final.persona,
      stage: final.stage,
      posts: final.posts.length,
    });
    console.log(`[bootstrap] ${final.id} (${spec.personaId}) -> ${final.stage} (${final.posts.length} posts) topic="${final.topic}"`);
  }
  console.log('\n=== Bootstrap summary ===');
  for (const s of summary) {
    console.log(`  ${s.id}  [${s.stage}]  persona=${s.persona}  posts=${s.posts}  topic="${s.topic}"`);
  }
  console.log(`\nNext steps:`);
  console.log(`  npm run cli -- list                       # 查看所有 content`);
  console.log(`  npm run cli -- persona list               # 查看所有 persona`);
  console.log(`  npm run cli -- feedback                   # 拉取 engagement`);
  console.log(`  npm run cli -- run-with-persona tech-insight "WebAssembly 性能"`);
  void makeContent as unknown as { id: string; topic: string };
  void ({} as PlatformId);
}

if (process.argv[1] && import.meta.url === new URL(process.argv[1], 'file:').href) {
  main().catch((e: Error) => {
    console.error('[bootstrap-fail]', e);
    process.exit(1);
  });
}
