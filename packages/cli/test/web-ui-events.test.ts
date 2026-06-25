import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

void test('web ui: exposes realtime status and connects EventSource to refresh panels', () => {
  const html = readFileSync(resolve(repoRoot, 'apps/web/index.html'), 'utf-8');
  const js = readFileSync(resolve(repoRoot, 'apps/web/app.js'), 'utf-8');

  assert.match(html, /id="realtime-status"/);
  assert.match(html, /实时/);
  assert.match(js, /new EventSource\('\/api\/events'\)/);
  assert.match(js, /addEventListener\('snapshot'/);
  assert.match(js, /loadContents\(\)/);
  assert.match(js, /loadQueue\(\)/);
  assert.match(js, /loadStats\(\)/);
  assert.match(js, /loadMetrics\(\)/);
});

void test('web ui: exposes Web Ops completion controls in production panel', () => {
  const html = readFileSync(resolve(repoRoot, 'apps/web/index.html'), 'utf-8');
  const js = readFileSync(resolve(repoRoot, 'apps/web/app.js'), 'utf-8');

  assert.match(html, /id="production-actions"/);
  assert.match(js, /webOpsCompletion/);
  assert.match(js, /Safe Execute/);
  assert.match(js, /Credential Wizard/);
  assert.match(js, /Replay Persistence/);
  assert.match(js, /Delivery Closure/);
});

void test('web ui: exposes production execution SLA controls', () => {
  const js = readFileSync(resolve(repoRoot, 'apps/web/app.js'), 'utf-8');

  assert.match(js, /executionSla/);
  assert.match(js, /Execution Adapter/);
  assert.match(js, /Audit Ledger/);
  assert.match(js, /CI Artifact Read/);
  assert.match(js, /Credential Probe/);
  assert.match(js, /SLA Dashboard/);
});
