import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startWebServer, type WebServerHandle } from '../src/web-server.js';
import { JsonStore } from '@ima/core';

async function boot(): Promise<{ handle: WebServerHandle; root: string }> {
  const root = mkdtempSync(join(tmpdir(), 'ima-production-web-'));
  const store = new JsonStore({ rootDir: root });
  writeFileSync(join(store.root, 'token-ledger.jsonl'), JSON.stringify({ provider: 'mock', model: 'mock-llm', promptTokens: 3, completionTokens: 4, totalTokens: 7, costUsd: 0.01, at: '2026-06-24T00:00:00.000Z' }) + '\n');
  writeFileSync(join(store.root, 'audit.jsonl'), JSON.stringify({ actor: 'cli', kind: 'reply', action: 'sandbox-reply', at: '2026-06-24T00:00:00.000Z', ok: true }) + '\n');
  const handle = await startWebServer({ port: 0, store, now: () => '2026-06-24T00:00:00.000Z' });
  return { handle, root };
}

void test('web-server: /api/production exposes durable production operations snapshot', async () => {
  const { handle, root } = await boot();
  try {
    const response = await fetch(`${handle.url}/api/production`);
    const json = await response.json() as {
      replyQueue: { total: number; next: unknown };
      tokenLedger: { totalCalls: number; totalCostUsd: number };
      audit: { total: number; byKind: Record<string, number> };
      release: { action: { canDeploy: boolean; command: string } };
      channel: { steps: string[] };
      evidence: { ok: boolean; passed: number; total: number; failedGates: string[] };
      safeForward: { canAdvance: boolean; nextStatuses: string[] };
      failureChecklist: Array<{ gate: string; hint: string }>;
      deliveryMarkdown: string;
      history: { total: number; failedGateTop: Array<{ gate: string; count: number }> };
      runbook: string;
      recommendations: Array<{ id: string }>;
      safeForwardCommand: { mode: string; confirmationRequired: string };
      safeForwardExecution: { mode: string; steps: Array<{ status: string }> };
      structuredRunbook: { title: string; steps: Array<{ kind: string }> };
      releaseOpsDashboard: { status: string; primaryActionId: string; push: { needsPush: boolean } };
      compactedHistory: { total: number; kept: unknown[] };
      releaseLocalHardening: { recursiveVerifyReadme: boolean; commands: string[] };
      executionReadiness: { status: string; connectorMatrix: { total: number; blocked: number }; approvalQueue: { items: unknown[] }; ciIngest: { mutatesRepo: boolean }; credentialRotation: { rotationRequired: boolean }; replaySandbox: { sideEffects: boolean }; analytics: { totalRuns: number } };
      webActions: { primaryActionId: string; actions: Array<{ id: string }> };
    };
    assert.equal(response.status, 200);
    assert.equal(json.tokenLedger.totalCalls, 1);
    assert.equal(json.tokenLedger.totalCostUsd, 0.01);
    assert.equal(json.audit.total, 1);
    assert.equal(json.audit.byKind.reply, 1);
    assert.equal(json.release.action.canDeploy, true);
    assert.equal(json.release.action.command, 'git push origin master');
    assert.ok(json.channel.steps.includes('auth-probe:false'));
    assert.equal(json.evidence.ok, true);
    assert.equal(json.evidence.passed, 5);
    assert.equal(json.evidence.total, 5);
    assert.deepEqual(json.evidence.failedGates, []);
    assert.equal(json.safeForward.canAdvance, true);
    assert.deepEqual(json.safeForward.nextStatuses, ['in_test_acceptance', 'accepted', 'deployed', 'delivered']);
    assert.deepEqual(json.failureChecklist, []);
    assert.match(json.deliveryMarkdown, /Delivery Evidence/);
    assert.equal(json.history.total, 1);
    assert.equal(json.safeForwardCommand.mode, 'dry-run');
    assert.match(json.safeForwardCommand.confirmationRequired, /EXECUTE P-20260624-013/);
    assert.equal(json.safeForwardExecution.mode, 'dry-run');
    assert.deepEqual(json.safeForwardExecution.steps.map((step) => step.status), ['in_test_acceptance', 'accepted', 'deployed', 'delivered']);
    assert.match(json.structuredRunbook.title, /Production Runbook/);
    assert.equal(json.releaseOpsDashboard.status, 'ready');
    assert.equal(json.releaseOpsDashboard.primaryActionId, 'copy-mcp-commands');
    assert.equal(json.releaseOpsDashboard.push.needsPush, false);
    assert.equal(json.compactedHistory.total, 1);
    assert.equal(json.releaseLocalHardening.recursiveVerifyReadme, false);
    assert.ok(json.releaseLocalHardening.commands.includes('npm run verify:readme'));
    assert.equal(json.executionReadiness.status, 'blocked');
    assert.equal(json.executionReadiness.connectorMatrix.total, 6);
    assert.equal(json.executionReadiness.connectorMatrix.blocked > 0, true);
    assert.equal(json.executionReadiness.approvalQueue.items.length, 3);
    assert.equal(json.executionReadiness.ciIngest.mutatesRepo, false);
    assert.equal(json.executionReadiness.credentialRotation.rotationRequired, true);
    assert.equal(json.executionReadiness.replaySandbox.sideEffects, false);
    assert.equal(json.executionReadiness.analytics.totalRuns, 1);
    assert.match(json.runbook, /Production Runbook/);
    assert.ok(json.recommendations.some((rec) => rec.id === 'history-ledger-compaction'));
    assert.equal(json.webActions.primaryActionId, 'copy-mcp-commands');
    assert.deepEqual(json.webActions.actions.map((action) => action.id), ['copy-runbook', 'copy-mcp-commands', 'download-delivery-markdown']);
  } finally {
    await handle.close();
    rmSync(root, { recursive: true, force: true });
  }
});
