#!/usr/bin/env node
// Manual scenario smoke for the publish queue worker.
// 1. Simulates a transient channel failure (503)
// 2. Writes a fresh QueueItem with nextAttemptAt = now
// 3. Runs the worker and prints the resulting state
// 4. Advances simulated time and runs again to verify the retry path
import { createApp } from './app.js';
import { createQueueItem, type QueueItem } from '@ima/core';
import { PublishWorker } from './queue-worker.js';
import { rmSync } from 'node:fs';
import { join } from 'node:path';

async function main(): Promise<void> {
  const root = process.env['IMA_TEST_ROOT'] ?? join(process.cwd(), '.ima');
  rmSync(root, { recursive: true, force: true });

  const app = createApp();
  const item: QueueItem = createQueueItem({
    contentId: 'c-smoke',
    platform: 'x',
    payload: { title: 'Smoke', body: 'Body', tags: [] },
    now: '2026-06-21T00:00:00.000Z',
    maxAttempts: 2,
  });
  await app.queue.write(item);
  console.log('seeded queue:');
  console.log(JSON.stringify(item, null, 2));

  // monkey-patch the channel registry so x post always throws 503 the first time
  const realPost = app.registry.get('x').post.bind(app.registry.get('x'));
  let calls = 0;
  app.registry.register({
    id: 'x',
    async post(input, opts) {
      calls += 1;
      if (calls === 1) throw new Error('503 simulated');
      return realPost(input, opts);
    },
    async healthCheck() { return { ok: true, detail: 'simulated' }; },
  });

  const worker = new PublishWorker(app.queue, app.registry);
  const t0 = '2026-06-21T00:00:00.000Z';
  const t1 = '2026-06-21T00:00:30.000Z';
  const t2 = '2026-06-21T00:02:00.000Z';

  console.log('--- run 1 (should retry) ---');
  console.log(await worker.runOnce({ now: t0, baseDelayMs: 60_000 }));
  console.log('after run 1:');
  for (const it of await app.queue.list()) {
    console.log(`  ${it.id} status=${it.status} attempts=${it.attempts} next=${it.nextAttemptAt} err=${it.lastError ?? '-'}`);
  }

  console.log('--- run 2 (before due) ---');
  console.log(await worker.runOnce({ now: t1, baseDelayMs: 60_000 }));

  console.log('--- run 3 (after due) ---');
  console.log(await worker.runOnce({ now: t2, baseDelayMs: 60_000 }));
  console.log('after run 3:');
  for (const it of await app.queue.list()) {
    console.log(`  ${it.id} status=${it.status} attempts=${it.attempts} postId=${it.postId ?? '-'} err=${it.lastError ?? '-'}`);
  }
}

main().catch((e: Error) => {
  console.error(`[error] ${e.message}`);
  process.exit(1);
});
