import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, createContent, type Content } from '../src/index.js';
import { runDryRun } from '../src/dry-run.js';

void test('publish dry-run: returns per-platform adapted payload without calling channels', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-dryrun-'));
  try {
    const store = new JsonStore({ rootDir: root });
    const c: Content = { ...createContent({ id: 'c-dry', topic: 'AI Agent 趋势' }), stage: 'review' };
    c.draft = {
      title: 'AI Agent 趋势：3 个被低估的真相',
      body: '我观察到 AI Agent 趋势正在全面爆发。\n\n为什么？三个核心信号...',
      tags: ['AI', '大V观察', '趋势'],
      coverHint: 'agent-trend-cover',
      cta: '评论区聊聊',
      translations: [],
      platformOverrides: {},
    };
    await store.write('content/c-dry.json', c);

    const r = await runDryRun({ store, id: 'c-dry', registry: { get: () => ({ post: () => Promise.reject(new Error('unused')), healthCheck: () => Promise.resolve({ ok: true, detail: 'unused' }) }) } });
    assert.equal(r.dryRun, true);
    assert.ok(r.preview['x']);
    assert.match(r.preview['x']!.body, /AI Agent/);
    assert.ok(r.preview['x']!.tags.length >= 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('publish dry-run: returns failure shape when content is missing', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-dryrun-missing-'));
  try {
    const store = new JsonStore({ rootDir: root });
    const r = await runDryRun({ store, id: 'missing' });
    assert.equal(r.dryRun, true);
    assert.equal(r.error, 'content not found: missing');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
