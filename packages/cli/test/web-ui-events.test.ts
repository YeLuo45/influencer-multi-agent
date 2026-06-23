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
