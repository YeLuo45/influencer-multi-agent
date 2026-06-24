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
  buildPushRecoveryPlan,
  buildDeliveryHistoryJsonl,
  parseDeliveryHistoryJsonl,
  buildWebActionManifest,
  parseCiRunSummary,
  buildReleaseOpsDashboard,
  buildSafeForwardExecutionPlan,
  compactDeliveryHistoryLedger,
  buildStructuredRunbook,
  buildReleaseLocalHardeningPlan,
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

void test('buildPushRecoveryPlan detects ahead local commit and emits retry command', () => {
  const plan = buildPushRecoveryPlan({ local: 'd885dda', remote: '26b6a1d', branch: 'master', remoteName: 'origin' });
  assert.equal(plan.needsPush, true);
  assert.equal(plan.status, 'ahead');
  assert.equal(plan.command, 'git push origin master');
});

void test('buildSafeForwardCommandPlan supports execute mode only with exact confirmation', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-016', gates: gates.map((gate) => ({ ...gate, ok: true })) });
  const safe = buildSafeForwardPlan(evidence);
  const wrong = buildSafeForwardCommandPlan('P-20260624-016', safe, 'EXECUTE P-wrong');
  const right = buildSafeForwardCommandPlan('P-20260624-016', safe, 'EXECUTE P-20260624-016');
  assert.equal(wrong.executable, false);
  assert.equal(right.executable, true);
  assert.equal(right.mode, 'execute');
});

void test('delivery history jsonl persists and parses evidence rows', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-016', commit: 'abc', gates: gates.map((gate) => ({ ...gate, ok: true })) });
  const jsonl = buildDeliveryHistoryJsonl('', [evidence]);
  const rows = parseDeliveryHistoryJsonl(jsonl);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.proposalId, 'P-20260624-016');
  assert.equal(rows[0]?.ok, true);
});

void test('buildWebActionManifest exposes copy and download actions for production operators', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-016', gates: gates.map((gate) => ({ ...gate, ok: true })) });
  const manifest = buildWebActionManifest(evidence, buildSafeForwardPlan(evidence));
  assert.deepEqual(manifest.actions.map((action) => action.id), ['copy-runbook', 'copy-mcp-commands', 'download-delivery-markdown']);
  assert.equal(manifest.primaryActionId, 'copy-mcp-commands');
});

void test('parseCiRunSummary converts CI job rows to delivery gates', () => {
  const gatesFromCi = parseCiRunSummary({ provider: 'github-actions', jobs: [{ name: 'node-20', conclusion: 'success' }, { name: 'node-22', conclusion: 'failure' }] });
  assert.deepEqual(gatesFromCi.map((gate) => [gate.name, gate.ok]), [['github-actions/node-20', true], ['github-actions/node-22', false]]);
  const merged = ingestCiEvidence(buildAcceptanceEvidence({ proposalId: 'P-20260624-016', gates: gates.map((gate) => ({ ...gate, ok: true })) }), gatesFromCi);
  assert.deepEqual(merged.failedGates, ['github-actions/node-22']);
});

void test('buildReleaseOpsDashboard summarizes failed queues, actions, history, CI and push recovery', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-020', commit: 'local', gates, web: { url: 'http://127.0.0.1:5173/', httpStatus: 200, apiKeys: 7 } });
  const safeForward = buildSafeForwardPlan(evidence);
  const dashboard = buildReleaseOpsDashboard({
    evidence,
    plan: safeForward,
    history: buildDeliveryHistorySnapshot([evidence]),
    webActions: buildWebActionManifest(evidence, safeForward),
    ciGates: parseCiRunSummary({ provider: 'github-actions', jobs: [{ name: 'node-20', conclusion: 'success' }] }),
    pushRecovery: buildPushRecoveryPlan({ local: 'abc', remote: 'def' }),
  });
  assert.equal(dashboard.status, 'blocked');
  assert.deepEqual(dashboard.failedQueue.map((item) => item.gate), ['verify:readme']);
  assert.equal(dashboard.primaryActionId, 'copy-runbook');
  assert.equal(dashboard.ci.passed, 1);
  assert.equal(dashboard.push.needsPush, true);
});

void test('buildSafeForwardExecutionPlan emits auditable steps only after exact confirmation', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-021', gates: gates.map((gate) => ({ ...gate, ok: true })) });
  const plan = buildSafeForwardPlan(evidence);
  const dry = buildSafeForwardExecutionPlan('P-20260624-021', plan, 'EXECUTE wrong');
  const execute = buildSafeForwardExecutionPlan('P-20260624-021', plan, 'EXECUTE P-20260624-021');
  assert.equal(dry.mode, 'dry-run');
  assert.equal(dry.steps.every((step) => step.willExecute === false), true);
  assert.equal(execute.mode, 'execute');
  assert.deepEqual(execute.steps.map((step) => step.status), ['in_test_acceptance', 'accepted', 'deployed', 'delivered']);
  assert.match(execute.auditTrail[0] ?? '', /P-20260624-021:in_test_acceptance/);
});

void test('compactDeliveryHistoryLedger keeps latest rows and aggregates old trend', () => {
  const rows = ['P1', 'P2', 'P3', 'P4'].map((id, index) => buildAcceptanceEvidence({ proposalId: id, commit: `c${index}`, gates: index === 1 ? gates : gates.map((gate) => ({ ...gate, ok: true })) }));
  const compacted = compactDeliveryHistoryLedger(rows, 2);
  assert.equal(compacted.total, 4);
  assert.equal(compacted.kept.length, 2);
  assert.deepEqual(compacted.kept.map((row) => row.proposalId), ['P3', 'P4']);
  assert.equal(compacted.archived.total, 2);
  assert.deepEqual(compacted.archived.failedGateTop, [{ gate: 'verify:readme', count: 1 }]);
});

void test('buildStructuredRunbook exposes copy-ready ordered production steps', () => {
  const evidence = buildAcceptanceEvidence({ proposalId: 'P-20260624-022', gates: gates.map((gate) => ({ ...gate, ok: true })) });
  const structured = buildStructuredRunbook({ evidence, plan: buildSafeForwardPlan(evidence), commands: ['npm run check', 'npm test'] });
  assert.equal(structured.title, 'Production Runbook — P-20260624-022');
  assert.deepEqual(structured.steps.map((step) => step.kind), ['precondition', 'command', 'command', 'mcp-forward']);
  assert.match(structured.copyMarkdown, /npm run check/);
});

void test('buildReleaseLocalHardeningPlan isolates storage and avoids recursive README verification', () => {
  const hardening = buildReleaseLocalHardeningPlan('/tmp/ima-release');
  assert.equal(hardening.storageRoot, '/tmp/ima-release/.ima-release-local');
  assert.equal(hardening.recursiveVerifyReadme, false);
  assert.ok(hardening.commands.includes('npm run verify:readme'));
  assert.ok(hardening.commands.includes('npm run cli release-local-json'));
});
