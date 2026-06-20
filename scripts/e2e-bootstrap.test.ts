#!/usr/bin/env tsx
/**
 * E2E: bootstrap demo must produce 3 done contents.
 * Run with: node --import tsx scripts/e2e-bootstrap.test.ts
 */
import assert from 'node:assert/strict';
import { createApp, saveContent } from '../packages/cli/src/app.js';
import { Pipeline } from '../packages/core/src/index.js';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function main(): Promise<void> {
  // 隔离 .ima 到 tmp 目录
  const tmp = mkdtempSync(join(tmpdir(), 'ima-e2e-'));
  process.chdir(tmp);
  const app = createApp();
  const topics = ['AI Agent 趋势', '小红书种草心得', 'B 站爆款规律'];
  for (const topic of topics) {
    const c = Pipeline.createContent(topic);
    const final = await app.pipeline.run(c);
    await saveContent(app.store, final);
    assert.equal(final.stage, 'done', `expected done, got ${final.stage} for ${topic}`);
    assert.ok(final.posts.length >= 1, `expected posts for ${topic}`);
    console.log(`[e2e] ${final.id} ${topic} -> done (${final.posts.length} posts)`);
  }
  console.log('[e2e] OK — all 3 contents reached done stage');
  rmSync(tmp, { recursive: true, force: true });
}

main().catch((e: Error) => {
  console.error('[e2e-fail]', e.message);
  process.exit(1);
});