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
  assert.match(html, /生产控制台/);
  assert.match(js, /fetchJson\('\/api\/roadmap'\)/);
  assert.match(js, /production/);
  assert.match(js, /loadRoadmap\(\)/);
});

void test('web ui: exposes dedicated production operations panel in main navigation', () => {
  const html = readFileSync(resolve(repoRoot, 'apps/web/index.html'), 'utf-8');
  const js = readFileSync(resolve(repoRoot, 'apps/web/app.js'), 'utf-8');

  assert.match(html, /data-tab="production"/);
  assert.match(html, /id="production-actions"/);
  assert.match(html, /id="production-output"/);
  assert.match(html, /生产运营中心/);
  assert.match(js, /fetchJson\('\/api\/production'\)/);
  assert.match(js, /releaseOpsDashboard/);
  assert.match(js, /safeForwardExecution/);
  assert.match(js, /executionReadiness/);
  assert.match(js, /connectorMatrix/);
  assert.match(js, /approvalQueue/);
  assert.match(js, /credentialHealthCenter/);
  assert.match(js, /eventTimeline/);
  assert.match(js, /webModeEnhancements/);
  assert.match(js, /connectorExecution/);
  assert.match(js, /replaySandbox/);
  assert.match(js, /production-action/);
  assert.match(js, /loadProduction\(\)/);
});
