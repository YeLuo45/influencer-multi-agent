import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, createContent, type Content } from '@ima/core';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';

function seedStore(root: string): JsonStore {
  const store = new JsonStore({ rootDir: root });
  const c: Content = { ...createContent({ id: 'c-web-1', topic: 'AI Agent 趋势' }), stage: 'done', persona: 'tech-insight' };
  c.posts = [
    { platform: 'x', postId: 'p-1', status: 'posted', url: 'https://x.example/1' } as Content['posts'][number],
  ];
  void store.write('content/c-web-1.json', c);
  return store;
}

void test('web-server: /api/llm reports provider and model', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-llm-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await fetch(`${handle.url}/api/llm`);
    const body = await r.json() as { provider: string; model: string; warning?: string };
    assert.equal(r.status, 200);
    assert.ok(body.provider);
    assert.ok(body.model);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: POST /api/run creates content and returns id', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-run-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await fetch(`${handle.url}/api/run`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ topic: '小红书种草心得', persona: 'lifestyle' }),
    });
    const body = await r.json() as { id?: string; error?: string };
    assert.equal(r.status, 200, `got ${r.status} ${JSON.stringify(body)}`);
    assert.ok(body.id, `expected id, got ${JSON.stringify(body)}`);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: POST /api/queue/work scans the queue', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-qwork-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    mkdirSync(join(root, '.ima', 'queue'), { recursive: true });
    writeFileSync(join(root, '.ima', 'queue', 'q-1.json'), JSON.stringify({
      id: 'q-1', contentId: 'c-web-1', platform: 'x', payload: { title: 't', body: 'b', tags: [] },
      status: 'posted', attempts: 1, maxAttempts: 3, lastError: null, postId: 'p-1', url: null,
      enqueuedAt: '2026-06-21T00:00:00.000Z', nextAttemptAt: '2026-06-21T00:00:00.000Z', postedAt: '2026-06-21T00:00:00.000Z',
    }));
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await fetch(`${handle.url}/api/queue/work`, { method: 'POST' });
    const body = await r.json() as { scanned: number };
    assert.equal(r.status, 200);
    assert.ok(typeof body.scanned === 'number');
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/llm warning when LLM is mock', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-llm-warn-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await fetch(`${handle.url}/api/llm`);
    const body = await r.json() as { provider: string; warning?: string };
    assert.equal(r.status, 200);
    if (body.provider === 'mock') {
      assert.match(body.warning ?? '', /mock/i);
    }
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
