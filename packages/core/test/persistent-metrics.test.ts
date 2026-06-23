import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPersistentMetrics, renderPrometheusMetrics } from '../src/persistent-metrics.js';

void test('persistent metrics appends jsonl samples and reloads counters', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-metrics-'));
  try {
    const metrics = createPersistentMetrics({ rootDir: root, now: () => '2026-06-23T00:00:00.000Z' });
    metrics.increment('publish_success_total', 2, { platform: 'x' });
    metrics.observe('queue_latency_ms', 42, { platform: 'x' });

    const raw = readFileSync(join(root, '.ima/metrics.jsonl'), 'utf-8');
    assert.match(raw, /publish_success_total/);
    assert.match(raw, /queue_latency_ms/);

    const snapshot = metrics.snapshot();
    assert.equal(snapshot.counters['publish_success_total{platform="x"}'], 2);
    assert.equal(snapshot.histograms['queue_latency_ms{platform="x"}']?.count, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('renderPrometheusMetrics serializes counters and histograms', () => {
  const text = renderPrometheusMetrics({
    counters: { 'publish_success_total{platform="x"}': 3 },
    histograms: { 'queue_latency_ms{platform="x"}': { count: 2, sum: 100, min: 40, max: 60 } },
  });

  assert.match(text, /publish_success_total\{platform="x"\} 3/);
  assert.match(text, /queue_latency_ms_count\{platform="x"\} 2/);
  assert.match(text, /queue_latency_ms_sum\{platform="x"\} 100/);
});
