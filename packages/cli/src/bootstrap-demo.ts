// Bootstrap demo: 创建 3 条 content 走完整 pipeline (含 persona)
import { createApp, saveContent } from './app.js';
import { Pipeline } from '@ima/core';

interface DemoSpec {
  topic: string;
  personaId: string;
}

const DEMOS: DemoSpec[] = [
  { topic: 'AI Agent 趋势：2026 年谁主沉浮', personaId: 'tech-insight' },
  { topic: '小红书种草心得：从 0 到 1 万粉', personaId: 'lifestyle' },
  { topic: 'B 站科技区爆款规律：标题、配乐、剪辑', personaId: 'tech-insight' },
];

async function main(): Promise<void> {
  const app = createApp();
  const summary: Array<{ id: string; topic: string; persona: string; stage: string; posts: number }> = [];
  for (const spec of DEMOS) {
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
}

main().catch((e: Error) => {
  console.error('[bootstrap-fail]', e);
  process.exit(1);
});