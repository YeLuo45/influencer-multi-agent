import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';
import { JsonStore } from '@ima/core';

async function boot(): Promise<{ handle: WebServerHandle; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'ima-metrics-web-'));
  mkdirSync(join(root, '.ima'), { recursive: true });
  writeFileSync(join(root, '.ima/metrics.jsonl'), JSON.stringify({
    at: '2026-06-23T00:00:00.000Z', type: 'counter', name: 'publish_success_total', value: 1, labels: { platform: 'x' },
  }) + '\n', 'utf-8');
  const store = new JsonStore({ rootDir: root });
  const handle = await startWebServer({ port: 0, store });
  return { handle, root };
}

void test('web-server: /metrics exposes persisted Prometheus metrics', async () => {
  const { handle, root } = await boot();
  try {
    const response = await fetch(`${handle.url}/metrics`);
    const text = await response.text();
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-type') ?? '', /text\/plain/);
    assert.match(text, /publish_success_total\{platform="x"\} 1/);
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
