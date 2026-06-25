import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, buildAbReport } from '@ima/core';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';

async function getJson(url: string): Promise<{ status: number; body: string; json: unknown }> {
  const r = await fetch(url);
  const body = await r.text();
  let json: unknown = null;
  try { json = JSON.parse(body); } catch { /* keep null */ }
  return { status: r.status, body, json };
}

function seedStore(root: string): JsonStore {
  const store = new JsonStore({ rootDir: root });
  // seed 2 contents
  void store.write('content/c-1.json', {
    id: 'c-1', topic: 'AI Agent 趋势', stage: 'done', persona: 'tech-insight',
    posts: [
      { platform: 'x', postId: 'p-1', status: 'posted', variantTag: 'A' },
      { platform: 'reddit', postId: 'p-2', status: 'posted', variantTag: 'B' },
    ],
    engagement: [
      { platform: 'x', postId: 'p-1', likes: 100, comments: 30, shares: 5, views: 1000, fetchedAt: '2026-06-21T00:00:00Z', variantTag: 'A' },
      { platform: 'reddit', postId: 'p-2', likes: 10, comments: 1, shares: 0, views: 200, fetchedAt: '2026-06-21T00:00:00Z', variantTag: 'B' },
    ],
  });
  void store.write('content/c-2.json', {
    id: 'c-2', topic: '小红书种草', stage: 'draft', persona: 'lifestyle',
    posts: [], engagement: [],
  });
  // seed queue + feedback
  mkdirSync(join(root, '.ima', 'queue'), { recursive: true });
  writeFileSync(join(root, '.ima', 'queue', 'q-1.json'), JSON.stringify({
    id: 'q-1', contentId: 'c-1', platform: 'x', payload: { title: 't', body: 'b', tags: [] },
    status: 'posted', attempts: 1, maxAttempts: 3, lastError: null, postId: 'p-1', url: null,
    enqueuedAt: '2026-06-21T00:00:00Z', nextAttemptAt: '2026-06-21T00:00:00Z', postedAt: '2026-06-21T00:00:00Z',
  }));
  void store.write('feedback.json', {
    records: [{ platform: 'x', postId: 'p-1', likes: 100, comments: 30, shares: 5, views: 1000, fetchedAt: '2026-06-20T00:00:00Z' }],
    windowDays: 7,
    lastUpdated: '2026-06-20T00:00:00Z',
    totalRecords: 1,
  });
  return store;
}

void test('web-server: serves index.html on /', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const url = handle.url.replace(/\/$/, '');
    // determine the chosen port (we passed 0, server picks one)
    const probe = await fetch(`${handle.url}/`);
    const html = await probe.text();
    assert.equal(probe.status, 200);
    assert.match(html, /IMA 控制台/);
    void url;
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: serves style.css and app.js with correct content-type', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const css = await fetch(`${handle.url}/style.css`);
    assert.match((await css.text()), /--bg:/);
    const js = await fetch(`${handle.url}/app.js`);
    assert.match((await js.text()), /loadContents/);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/contents returns id + topic + counts', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await getJson(`${handle.url}/api/contents`);
    assert.equal(r.status, 200);
    const items = r.json as Array<{ id: string; topic: string; posts: number; engagement: number }>;
    assert.equal(items.length, 2);
    const c1 = items.find((c) => c.id === 'c-1');
    assert.ok(c1);
    assert.equal(c1.topic, 'AI Agent 趋势');
    assert.equal(c1.posts, 2);
    assert.equal(c1.engagement, 2);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/queue returns summary + items', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await getJson(`${handle.url}/api/queue`);
    assert.equal(r.status, 200);
    const data = r.json as { summary: { total: number; byStatus: Record<string, number> }; items: Array<{ id: string; status: string }> };
    assert.equal(data.summary.total, 1);
    assert.equal(data.summary.byStatus.posted, 1);
    assert.equal(data.items[0]!.id, 'q-1');
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/feedback returns window summary', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await getJson(`${handle.url}/api/feedback`);
    assert.equal(r.status, 200);
    const data = r.json as { windowDays: number; totalRecords: number; recentCount: number };
    assert.equal(data.windowDays, 7);
    assert.equal(data.totalRecords, 1);
    assert.equal(data.recentCount, 1);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/feedback with no file returns defaults', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = new JsonStore({ rootDir: root });
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await getJson(`${handle.url}/api/feedback`);
    assert.equal(r.status, 200);
    const data = r.json as { windowDays: number; totalRecords: number; recentCount: number };
    assert.equal(data.windowDays, 7);
    assert.equal(data.totalRecords, 0);
    assert.equal(data.recentCount, 0);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/ab returns report + winner', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await getJson(`${handle.url}/api/ab?id=c-1`);
    assert.equal(r.status, 200);
    const data = r.json as { winner: string | null; variants: Array<{ variant: string; score: number }> };
    assert.equal(data.winner, 'A');
    assert.equal(data.variants.length, 2);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/ab without id returns 400', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = new JsonStore({ rootDir: root });
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await getJson(`${handle.url}/api/ab`);
    assert.equal(r.status, 400);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/ab with unknown id returns 404', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = new JsonStore({ rootDir: root });
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await getJson(`${handle.url}/api/ab?id=missing`);
    assert.equal(r.status, 404);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: unknown static path returns 404', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = new JsonStore({ rootDir: root });
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const r = await getJson(`${handle.url}/nope.txt`);
    assert.equal(r.status, 404);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: buildAbReport reachable through ab API matches direct call', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1' });
    const c = await store.read<never>('content/c-1.json');
    const direct = buildAbReport('c-1', (c as never).posts, (c as never).engagement, { minSampleSize: 1 });
    const r = await getJson(`${handle.url}/api/ab?id=c-1`);
    assert.deepEqual((r.json as { winner: string | null; variants: unknown[] }).variants, direct.variants);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/production exposes composed Web Ops completion pack', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1', now: () => '2026-06-25T00:00:00.000Z' });
    const r = await getJson(`${handle.url}/api/production`);
    assert.equal(r.status, 200);
    const data = r.json as { webOpsCompletion?: { proposalId: string; safeExecuteAction: { confirmationRequired: string }; scenarioPersistence: { path: string }; deliveryClosure: { statusPath: string[] } } };
    assert.equal(data.webOpsCompletion?.proposalId, 'P-20260625-009');
    assert.equal(data.webOpsCompletion?.safeExecuteAction.confirmationRequired, 'EXECUTE P-20260625-009');
    assert.equal(data.webOpsCompletion?.scenarioPersistence.path, '.ima/release-ops/scenarios.jsonl');
    assert.deepEqual(data.webOpsCompletion?.deliveryClosure.statusPath, ['in_test_acceptance', 'accepted', 'deployed', 'delivered']);
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/production exposes execution SLA pack', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1', now: () => '2026-06-25T04:00:00.000Z' });
    const r = await getJson(`${handle.url}/api/production`);
    assert.equal(r.status, 200);
    const data = r.json as { executionSla?: { proposalId: string; executionAdapter: { mode: string }; auditLedger: { path: string }; slaDashboard: { metrics: Array<{ id: string }> } } };
    assert.equal(data.executionSla?.proposalId, 'P-20260625-012');
    assert.equal(data.executionSla?.executionAdapter.mode, 'dry-run');
    assert.equal(data.executionSla?.auditLedger.path, '.ima/release-ops/web-audit.jsonl');
    assert.ok(data.executionSla?.slaDashboard.metrics.some((metric) => metric.id === 'credential-expiry'));
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});

void test('web-server: /api/production exposes complete Web Ops workbench pack', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-web-'));
  let handle: WebServerHandle | null = null;
  try {
    const store = seedStore(root);
    handle = await startWebServer({ store, port: 0, host: '127.0.0.1', now: () => '2026-06-25T05:30:00.000Z' });
    const r = await getJson(`${handle.url}/api/production`);
    assert.equal(r.status, 200);
    const data = r.json as { webOpsWorkbench?: { proposalId: string; sideEffects: boolean; directions: Array<{ id: string }>; ciArtifactBrowser: { artifacts: unknown[] }; safeExecuteLedger: { path: string }; slaAlertCenter: { alerts: Array<{ severity: string }> } } };
    assert.equal(data.webOpsWorkbench?.proposalId, 'P-20260625-014');
    assert.equal(data.webOpsWorkbench?.sideEffects, false);
    assert.equal(data.webOpsWorkbench?.directions.length, 7);
    assert.equal(data.webOpsWorkbench?.safeExecuteLedger.path, '.ima/release-ops/safe-execute-ledger.jsonl');
    assert.ok((data.webOpsWorkbench?.ciArtifactBrowser.artifacts.length ?? 0) > 0);
    assert.ok(data.webOpsWorkbench?.slaAlertCenter.alerts.some((alert) => alert.severity === 'critical' || alert.severity === 'warning'));
  } finally {
    if (handle) await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
