import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, createContent, type Content } from '../src/index.js';
import { runDryRun } from '../src/dry-run.js';

void test('runDryRun: supports --json output shape (preview + targets + dryRun flag)', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-dryjson-'));
  try {
    const store = new JsonStore({ rootDir: root });
    const c: Content = { ...createContent({ id: 'c-json', topic: 'X 趋势' }), stage: 'review' };
    c.draft = {
      title: 'X 趋势：3 个真相',
      body: '我观察到 X 趋势正在爆发。',
      tags: ['X', '趋势'],
      coverHint: 'x-trend',
      cta: '评论区见',
      translations: [],
      platformOverrides: {},
    };
    await store.write('content/c-json.json', c);
    const r = await runDryRun({ store, id: 'c-json' });
    // json shape: dryRun, contentId, targets, preview
    const j = JSON.parse(JSON.stringify(r));
    assert.equal(j.dryRun, true);
    assert.equal(j.contentId, 'c-json');
    assert.ok(Array.isArray(j.targets));
    assert.ok(j.preview['x']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
