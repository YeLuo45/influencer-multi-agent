import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';
import { JsonStore } from '@ima/core';

async function boot(): Promise<{ handle: WebServerHandle; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'ima-events-web-'));
  mkdirSync(join(root, '.ima', 'content'), { recursive: true });
  mkdirSync(join(root, '.ima', 'queue'), { recursive: true });
  writeFileSync(join(root, '.ima', 'content', 'c-1.json'), JSON.stringify({
    id: 'c-1',
    topic: 'Realtime AI agents',
    stage: 'done',
    persona: 'default',
    posts: [{ platform: 'x' }],
    engagement: [],
    createdAt: '2026-06-23T00:00:00.000Z',
  }), 'utf-8');
  writeFileSync(join(root, '.ima', 'queue', 'q-1.json'), JSON.stringify({
    id: 'q-1',
    contentId: 'c-1',
    platform: 'x',
    status: 'pending',
    attempts: 0,
    maxAttempts: 3,
    nextAttemptAt: '2026-06-23T00:00:00.000Z',
  }), 'utf-8');
  const store = new JsonStore({ rootDir: root });
  const handle = await startWebServer({ port: 0, store, now: () => '2026-06-23T00:00:00.000Z' });
  return { handle, root };
}

void test('web-server: /api/events streams an initial realtime snapshot as SSE', async () => {
  const { handle, root } = await boot();
  try {
    const controller = new AbortController();
    const response = await fetch(`${handle.url}/api/events`, { signal: controller.signal });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/event-stream/);
    const reader = response.body!.getReader();
    const first = await reader.read();
    controller.abort();
    const text = new TextDecoder().decode(first.value);
    assert.match(text, /event: snapshot/);
    assert.match(text, /data: /);
    assert.match(text, /"contents"\s*:\s*1/);
    assert.match(text, /"queue"\s*:\s*\{"total":1/);
    assert.match(text, /"metrics"/);
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
