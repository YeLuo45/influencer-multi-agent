import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAcceptanceEvidence,
  buildDeliveryMarkdown,
  buildDiffOwnership,
  buildFailureChecklist,
  buildSafeForwardPlan,
  buildDeliveryHistorySnapshot,
  buildSafeForwardCommandPlan,
  buildProductionRunbook,
  ingestCiEvidence,
  recommendNextIterations,
  type DeliveryGateInput,
} from '../src/delivery-evidence.js';

const gates: DeliveryGateInput[] = [
  { name: 'check', ok: true, summary: 'tsc ok', command: 'npm run check' },
  { name: 'test', ok: true, summary: '389/389 pass', command: 'npm test' },
  { name: 'coverage', ok: true, summary: '96.77 stmt / 79.94 branch', command: 'npm run coverage' },
  { name: 'verify:readme', ok: false, summary: 'web production endpoint stale', command: 'npm run verify:readme' },
  { name: 'build', ok: true, summary: 'dist non-empty', command: 'npm run build' },
];

void test('buildAcceptanceEvidence summarizes five hard gates and blocks deploy when any gate fails', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-006', commit: 'local', gates, web: { url: 'http://127.0.0.1:5189/', httpStatus: 200, apiKeys: 7 } });
  assert.equal(evidence.ok, false);
  assert.equal(evidence.passed, 4);
  assert.equal(evidence.failed, 1);
  assert.equal(evidence.web?.verified, true);
  assert.deepEqual(evidence.failedGates, ['verify:readme']);
  assert.match(evidence.summary, /4\/5 gates passed/);
});

void test('buildFailureChecklist gives deterministic remediation hints per failed gate', () => {
  const checklist = buildFailureChecklist(gates);
  assert.deepEqual(checklist, [
    { gate: 'verify:readme', command: 'npm run verify:readme', hint: 'sync README documented commands, targeted tests, and generated demo side effects' },
  ]);
});

void test('buildSafeForwardPlan only walks MCP forward after gates are green', () => {
  const blocked = buildSafeForwardPlan(buildAcceptanceEvidence({ proposalId: 'P-20260624-006', gates }));
  assert.equal(blocked.canAdvance, false);
  assert.deepEqual(blocked.nextStatuses, ['test_failed']);
  assert.match(blocked.reason, /verify:readme/);

  const green = buildSafeForwardPlan(buildAcceptanceEvidence({ proposalId: 'P-20260624-006', gates: gates.map((gate) => ({ ...gate, ok: true })) }));
  assert.equal(green.canAdvance, true);
  assert.deepEqual(green.nextStatuses, ['in_test_acceptance', 'accepted', 'deployed', 'delivered']);
});

void test('buildDiffOwnership separates proposal docs, product code, tests, and generated artifacts', () => {
  const ownership = buildDiffOwnership([
    'docs/prd.v3.md',
    'packages/core/src/delivery-evidence.ts',
    'packages/core/test/delivery-evidence.test.ts',
    '.ima/content/demo.json',
    'README.md',
  ]);
  assert.deepEqual(ownership.proposalDocs, ['docs/prd.v3.md']);
  assert.deepEqual(ownership.productCode, ['packages/core/src/delivery-evidence.ts']);
  assert.deepEqual(ownership.tests, ['packages/core/test/delivery-evidence.test.ts']);
  assert.deepEqual(ownership.generatedArtifacts, ['.ima/content/demo.json']);
  assert.deepEqual(ownership.docs, ['README.md']);
});

void test('buildDeliveryMarkdown renders copy-ready delivery report with gates and next action', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-006', commit: 'local', gates: gates.map((gate) => ({ ...gate, ok: true })), web: { url: 'http://127.0.0.1:5189/', httpStatus: 200, apiKeys: 7 } });
  const plan = buildSafeForwardPlan(evidence);
  const markdown = buildDeliveryMarkdown(evidence, plan);
  assert.match(markdown, /# Delivery Evidence — P-20260624-006/);
  assert.match(markdown, /\| verify:readme \| pass \|/);
  assert.match(markdown, /MCP next: in_test_acceptance → accepted → deployed → delivered/);
  assert.match(markdown, /Local web: http:\/\/127\.0\.0\.1:5189\/ HTTP 200/);
});

void test('buildDeliveryHistorySnapshot summarizes recent evidence trend and failed gate frequency', () => {
  const green = buildAcceptanceEvidence({ proposalId: 'P-green', commit: 'a1', gates: gates.map((gate) => ({ ...gate, ok: true })) });
  const red = buildAcceptanceEvidence({ proposalId: 'P-red', commit: 'a2', gates });
  const snapshot = buildDeliveryHistorySnapshot([green, red, green], 2);
  assert.equal(snapshot.total, 3);
  assert.equal(snapshot.recent.length, 2);
  assert.equal(snapshot.lastDeliverableCommit, 'a1');
  assert.deepEqual(snapshot.failedGateTop, [{ gate: 'verify:readme', count: 1 }]);
});

void test('buildSafeForwardCommandPlan stays dry-run unless explicit confirmation matches proposal id', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-013', gates: gates.map((gate) => ({ ...gate, ok: true })) });
  const plan = buildSafeForwardPlan(evidence);
  const dry = buildSafeForwardCommandPlan('P-20260624-013', plan);
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.executable, false);
  assert.match(dry.commands[0] ?? '', /update-proposal-status/);

  const execute = buildSafeForwardCommandPlan('P-20260624-013', plan, 'EXECUTE P-20260624-013');
  assert.equal(execute.mode, 'execute');
  assert.equal(execute.executable, true);
});

void test('buildProductionRunbook combines evidence, failures, diff ownership, and safe-forward plan', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-013', gates });
  const runbook = buildProductionRunbook({
    evidence,
    checklist: buildFailureChecklist(gates),
    ownership: buildDiffOwnership(['packages/core/src/x.ts', 'docs/prd.v4.md']),
    plan: buildSafeForwardPlan(evidence),
  });
  assert.match(runbook, /# Production Runbook — P-20260624-013/);
  assert.match(runbook, /verify:readme/);
  assert.match(runbook, /productCode: 1/);
  assert.match(runbook, /MCP next: test_failed/);
});

void test('ingestCiEvidence merges local and CI gates without losing failed remote checks', () => {
  const local = buildAcceptanceEvidence({ proposalId: 'P-20260624-013', gates: gates.map((gate) => ({ ...gate, ok: true })) });
  const merged = ingestCiEvidence(local, [
    { name: 'github-actions', ok: false, summary: 'node-22 failed', command: 'gh run view' },
  ]);
  assert.equal(merged.ok, false);
  assert.deepEqual(merged.failedGates, ['github-actions']);
  assert.equal(merged.total, 6);
});

void test('recommendNextIterations ranks next directions from failures, diff ownership, and coverage weakness', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-013', gates });
  const ownership = buildDiffOwnership(['apps/web/app.js', 'packages/cli/src/web-server.ts', 'packages/core/src/delivery-evidence.ts']);
  const recs = recommendNextIterations({ evidence, ownership, weakCoverageFiles: ['packages/cli/src/web-server.ts'] });
  assert.equal(recs[0]?.id, 'stabilize-readme-gate');
  assert.ok(recs.some((rec) => rec.id === 'web-action-center'));
  assert.ok(recs.some((rec) => rec.id === 'route-coverage-hardening'));
});
