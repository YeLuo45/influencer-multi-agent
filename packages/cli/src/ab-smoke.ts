#!/usr/bin/env node
// AB smoke: seed mock engagement metrics for a content, then ab report should
// pick a winner.
import { createApp, loadContent, saveContent } from './app.js';
import { buildAbReport, type EngagementMetric } from '@ima/core';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

async function main(): Promise<void> {
  const root = process.env['IMA_TEST_ROOT'] ?? join(process.cwd(), '.ima');
  rmSync(root, { recursive: true, force: true });

  const app = createApp();
  const c = (await import('@ima/core')).Pipeline.createContent('AI Agent 趋势');
  const final = await app.pipeline.run(c);
  await saveContent(app.store, final);
  const id = final.id;
  console.log(`seeded ${id} posts=${final.posts.length}`);

  // Read back, add engagement metrics with different variant performance, write back
  const cur = await loadContent(app.store, id);
  if (!cur) throw new Error('not found');
  const posts = cur.posts;
  // distribute engagement: 2x variant A wins, 1x variant B loses
  const variantByPost = new Map(posts.map((p) => [p.postId ?? '', p.variantTag ?? 'A']));
  const metrics: EngagementMetric[] = [];
  for (const [postId, v] of variantByPost) {
    if (!postId) continue;
    if (v === 'A') {
      metrics.push({ platform: 'x', postId, likes: 100, comments: 30, shares: 10, views: 5000, fetchedAt: '2026-06-21T00:00:00.000Z', variantTag: 'A' });
    } else {
      metrics.push({ platform: 'x', postId, likes: 10, comments: 1, shares: 0, views: 200, fetchedAt: '2026-06-21T00:00:00.000Z', variantTag: 'B' });
    }
  }
  await saveContent(app.store, { ...cur, engagement: metrics });

  const r = buildAbReport(id, posts, metrics, { minSampleSize: 1 });
  console.log(JSON.stringify(r, null, 2));
}

main().catch((e: Error) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});
