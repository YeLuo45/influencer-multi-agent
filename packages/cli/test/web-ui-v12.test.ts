import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '../../..');
const indexHtml = readFileSync(join(repoRoot, 'apps/web/index.html'), 'utf-8');
const appJs = readFileSync(join(repoRoot, 'apps/web/app.js'), 'utf-8');

void test('web ui: exposes stats and metrics tabs in the main console', () => {
  assert.match(indexHtml, /data-tab="stats"/);
  assert.match(indexHtml, /data-tab="metrics"/);
  assert.match(indexHtml, /id="view-stats"/);
  assert.match(indexHtml, /id="view-metrics"/);
});

void test('web ui: exposes bulk action buttons and calls bulk API endpoints', () => {
  for (const id of ['bulk-pause', 'bulk-resume', 'bulk-retry', 'bulk-cancel']) {
    assert.match(indexHtml, new RegExp(`id="${id}"`));
  }
  assert.match(appJs, /\/api\/bulk\/pause/);
  assert.match(appJs, /\/api\/bulk\/resume/);
  assert.match(appJs, /\/api\/bulk\/retry/);
  assert.match(appJs, /\/api\/bulk\/cancel/);
});

void test('web ui: renders metrics dashboard from /api/metrics', () => {
  assert.match(appJs, /loadMetrics/);
  assert.match(appJs, /\/api\/metrics/);
  assert.match(indexHtml, /id="metrics-output"/);
});
