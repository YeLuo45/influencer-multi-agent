import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

void test('web ui: exposes unattended roadmap panel in main navigation', () => {
  const html = readFileSync(resolve(repoRoot, 'apps/web/index.html'), 'utf-8');
  const js = readFileSync(resolve(repoRoot, 'apps/web/app.js'), 'utf-8');

  assert.match(html, /data-tab="roadmap"/);
  assert.match(html, /id="roadmap-output"/);
  assert.match(html, /无人值守路线图/);
  assert.match(js, /fetchJson\('\/api\/roadmap'\)/);
  assert.match(js, /loadRoadmap\(\)/);
});
