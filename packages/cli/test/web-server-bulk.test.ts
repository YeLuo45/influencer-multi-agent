import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createContent, JsonStore } from '@ima/core';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';

async function boot(): Promise<{ handle: WebServerHandle; root: string; store: JsonStore }> {
  const root = mkdtempSync(join(tmpdir(), 'ima-bulk-api-'));
  const store = new JsonStore({ rootDir: root });
  const content = createContent({ id: 'bulk-1', topic: 'bulk topic' });
  content.stage = 'review';
  await store.write('content/bulk-1.json', content);
  const handle = await startWebServer({ port: 0, store, now: () => '2026-06-23T00:00:00.000Z' });
  return { handle, root, store };
}

void test('web-server: POST /api/bulk/pause pauses matching content and writes history', async () => {
  const { handle, root, store } = await boot();
  try {
    const response = await fetch(`${handle.url}/api/bulk/pause`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ stage: 'review' }),
    });
    const json = await response.json() as { changed: number; ids: string[] };
    const updated = await store.read<{ stage: string; history: Array<{ note: string }> }>('content/bulk-1.json');

    assert.equal(response.status, 200);
    assert.equal(json.changed, 1);
    assert.deepEqual(json.ids, ['bulk-1']);
    assert.equal(updated?.stage, 'needs_revision');
    assert.match(updated?.history[0]?.note ?? '', /pause/);
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: POST /api/bulk/resume resumes by ids', async () => {
  const { handle, root, store } = await boot();
  try {
    const content = await store.read<ReturnType<typeof createContent>>('content/bulk-1.json');
    if (content) {
      content.stage = 'needs_revision';
      await store.write('content/bulk-1.json', content);
    }
    const response = await fetch(`${handle.url}/api/bulk/resume`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids: ['bulk-1'] }),
    });
    const json = await response.json() as { changed: number };
    const updated = await store.read<{ stage: string }>('content/bulk-1.json');

    assert.equal(response.status, 200);
    assert.equal(json.changed, 1);
    assert.equal(updated?.stage, 'review');
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
