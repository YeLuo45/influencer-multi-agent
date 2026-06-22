import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';
import { JsonStore } from '@ima/core';

async function boot(): Promise<{ handle: WebServerHandle; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'ima-stats-'));
  const store = new JsonStore({ rootDir: root });
  mkdirSync(join(root, '.ima/content'), { recursive: true });
  mkdirSync(join(root, '.ima/queue'), { recursive: true });
  writeFileSync(join(root, '.ima/content/c-stats-1.json'), JSON.stringify({
    id: 'c-stats-1', topic: 'topic', stage: 'review', persona: 'tech-insight',
    posts: [], engagement: [], createdAt: '2026-06-21T00:00:00.000Z',
  }), 'utf-8');
  writeFileSync(join(root, '.ima/queue/q-stats-1.json'), JSON.stringify({
    id: 'q-stats-1', contentId: 'c-stats-1', platform: 'x', status: 'pending',
    createdAt: '2026-06-21T00:00:00.000Z',
  }), 'utf-8');
  writeFileSync(join(root, '.ima/feedback.json'), JSON.stringify({
    records: [], windowDays: 7, lastUpdated: '2026-06-21T00:00:00.000Z', totalRecords: 5,
  }), 'utf-8');
  const handle = await startWebServer({ port: 0, store });
  return { handle, root };
}

void test('web-server: /api/stats aggregates contents, queue, feedback, and LLM info', async () => {
  const { handle, root } = await boot();
  try {
    const r = await fetch(`${handle.url}/api/stats`);
    const j = (await r.json()) as {
      totalContents: number;
      contentsByStage: Record<string, number>;
      totalQueue: number;
      queueByStatus: Record<string, number>;
      feedback: { totalRecords: number };
      llm: { provider: string; model: string };
    };
    assert.equal(r.status, 200);
    assert.equal(j.totalContents, 1);
    assert.equal(j.contentsByStage['review'], 1);
    assert.equal(j.totalQueue, 1);
    assert.equal(j.queueByStatus['pending'], 1);
    assert.equal(j.feedback.totalRecords, 5);
    assert.equal(typeof j.llm.provider, 'string');
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
