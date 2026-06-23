import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '@ima/core';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';

async function boot(): Promise<{ handle: WebServerHandle; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'ima-metrics-dashboard-'));
  mkdirSync(join(root, '.ima'), { recursive: true });
  writeFileSync(join(root, '.ima/metrics.jsonl'), [
    JSON.stringify({ at: '2026-06-23T00:00:00.000Z', type: 'counter', name: 'publish_success_total', value: 2, labels: { platform: 'x' } }),
    JSON.stringify({ at: '2026-06-23T00:00:01.000Z', type: 'histogram', name: 'queue_latency_ms', value: 50, labels: { platform: 'x' } }),
  ].join('\n') + '\n', 'utf-8');
  const store = new JsonStore({ rootDir: root });
  const handle = await startWebServer({ port: 0, store });
  return { handle, root };
}

void test('web-server: /api/metrics returns structured metrics dashboard data', async () => {
  const { handle, root } = await boot();
  try {
    const response = await fetch(`${handle.url}/api/metrics`);
    const json = await response.json() as { counters: Record<string, number>; histograms: Record<string, { count: number; sum: number }> };

    assert.equal(response.status, 200);
    assert.equal(json.counters['publish_success_total{platform="x"}'], 2);
    assert.equal(json.histograms['queue_latency_ms{platform="x"}']?.count, 1);
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
