import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createQueueWorkerLoop, type QueueWorkerLoopHandle } from '../src/queue-worker-loop.js';

void test('queue-worker loop: starts, processes once, and stops cleanly', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-qloop-'));
  const oldCwd = process.cwd();
  try {
    process.chdir(root);
    const { createApp } = await import('../src/app.js');
    const { createQueueItem, JsonStore } = await import('@ima/core');
    const app = createApp();
    const store = new JsonStore({ rootDir: root });
    await store.write('queue/q-1.json', createQueueItem({ contentId: 'c-loop', platform: 'x', payload: { title: 't', body: 'b', tags: [] }, now: '2026-06-21T00:00:00.000Z' }));

    const loop: QueueWorkerLoopHandle = createQueueWorkerLoop({
      app,
      intervalMs: 50,
      idleSleepMs: 10,
    });
    loop.start();
    const stats = await loop.runOnceAndWait();
    assert.ok(stats.processed >= 1);
    loop.stop();
  } finally {
    process.chdir(oldCwd);
    rmSync(root, { recursive: true, force: true });
  }
});
