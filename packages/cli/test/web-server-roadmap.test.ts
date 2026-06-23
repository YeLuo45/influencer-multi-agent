import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';
import { JsonStore } from '@ima/core';

async function boot(): Promise<{ handle: WebServerHandle; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'ima-roadmap-web-'));
  const store = new JsonStore({ rootDir: root });
  const handle = await startWebServer({ port: 0, store, now: () => '2026-06-23T00:00:00.000Z' });
  return { handle, root };
}

void test('web-server: /api/roadmap exposes unattended roadmap automation summary', async () => {
  const { handle, root } = await boot();
  try {
    const response = await fetch(`${handle.url}/api/roadmap`);
    const json = await response.json() as { replies: unknown[]; cost: { totalCalls: number }; ab: { reason: string }; channelPlan: { steps: unknown[] }; e2e: { gates: string[] }; realtime: { mode: string }; audit: { total: number }; production: { replySafety: { readyForRealReply: boolean }; budget: { provider: string }; channel: { steps: string[] }; release: { ok: boolean } } };
    assert.equal(response.status, 200);
    assert.equal(json.cost.totalCalls, 0);
    assert.equal(json.ab.reason, 'no_variants');
    assert.equal(json.channelPlan.steps.length, 5);
    assert.ok(json.e2e.gates.includes('verify-readme'));
    assert.equal(json.realtime.mode, 'continuous');
    assert.equal(json.audit.total, 0);
    assert.equal(json.production.replySafety.readyForRealReply, false);
    assert.equal(json.production.budget.provider, 'mock');
    assert.ok(json.production.channel.steps.includes('auth-probe:false'));
    assert.equal(json.production.release.ok, true);
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
