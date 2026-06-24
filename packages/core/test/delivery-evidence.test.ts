import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAcceptanceEvidence,
  buildDeliveryMarkdown,
  buildDiffOwnership,
  buildFailureChecklist,
  buildSafeForwardPlan,
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
