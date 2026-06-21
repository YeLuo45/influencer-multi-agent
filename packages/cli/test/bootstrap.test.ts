import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore, createContent, type Content, type EngagementMetric, type Llm } from '@ima/core';
import { createApp, loadContent, saveContent } from '../src/app.js';
import { runBootstrapDemo, defaultBootstrapOptions } from '../src/bootstrap-demo.js';
import { mkdirSync } from 'node:fs';

function buildMockLlm(): Llm {
  return {
    provider: 'mock',
    model: 'mock-llm',
    async complete() {
      return 'ok';
    },
  };
}

void test('bootstrap: seeds 3 contents and returns the ids', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-bs-'));
  const oldCwd = process.cwd();
  try {
    process.chdir(root);
    const app = createApp();
    const r = await runBootstrapDemo({ app, now: () => '2026-06-21T00:00:00.000Z', llm: buildMockLlm() });
    assert.equal(r.contents.length, 3);
    for (const c of r.contents) {
      const stored = await loadContent(app.store, c.id);
      assert.ok(stored);
      assert.equal(stored!.stage, 'done');
    }
  } finally {
    process.chdir(oldCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

void test('bootstrap: writeBackToFeedback appends aggregated metrics for each content', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-bs-fb-'));
  const oldCwd = process.cwd();
  try {
    process.chdir(root);
    const app = createApp();
    const r = await runBootstrapDemo({ app, now: () => '2026-06-21T00:00:00.000Z', llm: buildMockLlm(), writeBackToFeedback: true });
    assert.ok(r.feedbackAppended >= 3, `expected >=3 metrics, got ${r.feedbackAppended}`);
    const fb = await app.store.read<{ records: EngagementMetric[]; totalRecords: number }>('feedback.json');
    assert.ok(fb);
    assert.equal(fb!.totalRecords, r.feedbackAppended);
  } finally {
    process.chdir(oldCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

void test('bootstrap: defaultBootstrapOptions requires no args and uses mock llm', () => {
  const opts = defaultBootstrapOptions();
  assert.equal(opts.llm.provider, 'mock');
  assert.equal(opts.writeBackToFeedback, false);
});
