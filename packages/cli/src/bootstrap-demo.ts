// Bootstrap demo: 创建 3 条 content 走完整 pipeline
import { createApp, saveContent } from './app.js';
import { Pipeline } from '@ima/core';

const TOPICS = [
  'AI Agent 趋势：2026 年谁主沉浮',
  '小红书种草心得：从 0 到 1 万粉',
  'B 站科技区爆款规律：标题、配乐、剪辑',
];

async function main(): Promise<void> {
  const app = createApp();
  const summary: Array<{ id: string; topic: string; stage: string; posts: number }> = [];
  for (const topic of TOPICS) {
    const c = Pipeline.createContent(topic);
    const final = await app.pipeline.run(c);
    await saveContent(app.store, final);
    summary.push({
      id: final.id,
      topic: final.topic,
      stage: final.stage,
      posts: final.posts.length,
    });
    console.log(`[bootstrap] ${final.id} -> ${final.stage} (${final.posts.length} posts) topic="${final.topic}"`);
  }
  console.log('\n=== Bootstrap summary ===');
  for (const s of summary) {
    console.log(`  ${s.id}  [${s.stage}]  posts=${s.posts}  topic="${s.topic}"`);
  }
  console.log(`\nRun: npm run cli -- list`);
}

main().catch((e: Error) => {
  console.error('[bootstrap-fail]', e);
  process.exit(1);
});