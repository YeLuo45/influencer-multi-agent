export interface DeliveryGateInput {
  name: string;
  ok: boolean;
  summary: string;
  command?: string;
}

export interface DeliveryWebEvidence {
  url: string;
  httpStatus: number;
  apiKeys: number;
}

export interface AcceptanceEvidenceInput {
  proposalId: string;
  commit?: string;
  gates: DeliveryGateInput[];
  web?: DeliveryWebEvidence;
}

export interface AcceptanceEvidence {
  proposalId: string;
  commit: string;
  ok: boolean;
  passed: number;
  failed: number;
  total: number;
  failedGates: string[];
  gates: DeliveryGateInput[];
  web?: DeliveryWebEvidence & { verified: boolean };
  summary: string;
}

export interface FailureChecklistItem {
  gate: string;
  command: string;
  hint: string;
}

export interface SafeForwardPlan {
  canAdvance: boolean;
  nextStatuses: Array<'in_test_acceptance' | 'accepted' | 'deployed' | 'delivered' | 'test_failed'>;
  reason: string;
}

export interface DiffOwnership {
  proposalDocs: string[];
  productCode: string[];
  tests: string[];
  generatedArtifacts: string[];
  docs: string[];
  other: string[];
}

const GATE_HINTS: Record<string, string> = {
  check: 'fix TypeScript strict errors before runtime validation',
  test: 'reproduce the failing node:test file, then patch the smallest product surface',
  coverage: 'add edge-path tests for uncovered new branches before lowering thresholds',
  'verify:readme': 'sync README documented commands, targeted tests, and generated demo side effects',
  build: 'build producer workspace packages first, then rebuild consumers that import dist exports',
};

export function buildAcceptanceEvidence(input: AcceptanceEvidenceInput): AcceptanceEvidence {
  const failedGates = input.gates.filter((gate) => !gate.ok).map((gate) => gate.name);
  const passed = input.gates.length - failedGates.length;
  const web = input.web ? { ...input.web, verified: input.web.httpStatus === 200 && input.web.apiKeys > 0 } : undefined;
  const ok = failedGates.length === 0 && (web ? web.verified : true);
  const webSuffix = web ? `; web ${web.verified ? 'verified' : 'not verified'}` : '';
  return {
    proposalId: input.proposalId,
    commit: input.commit ?? 'uncommitted',
    ok,
    passed,
    failed: failedGates.length,
    total: input.gates.length,
    failedGates,
    gates: input.gates.map((gate) => ({ ...gate })),
    ...(web ? { web } : {}),
    summary: `${passed}/${input.gates.length} gates passed${webSuffix}`,
  };
}

export function buildFailureChecklist(gates: DeliveryGateInput[]): FailureChecklistItem[] {
  return gates.filter((gate) => !gate.ok).map((gate) => ({
    gate: gate.name,
    command: gate.command ?? gate.name,
    hint: GATE_HINTS[gate.name] ?? `inspect ${gate.name} output and patch the root cause`,
  }));
}

export function buildSafeForwardPlan(evidence: AcceptanceEvidence): SafeForwardPlan {
  if (!evidence.ok) {
    const failed = evidence.failedGates.length > 0 ? evidence.failedGates.join(', ') : 'web verification';
    return { canAdvance: false, nextStatuses: ['test_failed'], reason: `blocked by ${failed}` };
  }
  return {
    canAdvance: true,
    nextStatuses: ['in_test_acceptance', 'accepted', 'deployed', 'delivered'],
    reason: 'all gates and local web verification passed',
  };
}

export function buildDiffOwnership(paths: string[]): DiffOwnership {
  const out: DiffOwnership = { proposalDocs: [], productCode: [], tests: [], generatedArtifacts: [], docs: [], other: [] };
  for (const path of paths) {
    if (path.startsWith('docs/') || path.includes('/docs/')) out.proposalDocs.push(path);
    else if (path.includes('/test/') || path.endsWith('.test.ts') || path.endsWith('.test.js')) out.tests.push(path);
    else if (path.startsWith('.ima/') || path.includes('/dist/') || path.startsWith('coverage/')) out.generatedArtifacts.push(path);
    else if (path === 'README.md' || path.endsWith('.md')) out.docs.push(path);
    else if (path.startsWith('packages/') || path.startsWith('apps/') || path.startsWith('scripts/')) out.productCode.push(path);
    else out.other.push(path);
  }
  return out;
}

export function buildDeliveryMarkdown(evidence: AcceptanceEvidence, plan: SafeForwardPlan): string {
  const lines = [
    `# Delivery Evidence — ${evidence.proposalId}`,
    '',
    `- ok: ${evidence.ok}`,
    `- commit: ${evidence.commit}`,
    `- summary: ${evidence.summary}`,
  ];
  if (evidence.web) {
    lines.push(`- Local web: ${evidence.web.url} HTTP ${evidence.web.httpStatus} (${evidence.web.apiKeys} api keys)`);
  }
  lines.push('', '| gate | status | command | summary |', '|---|---|---|---|');
  for (const gate of evidence.gates) {
    lines.push(`| ${gate.name} | ${gate.ok ? 'pass' : 'fail'} | ${gate.command ?? gate.name} | ${gate.summary} |`);
  }
  lines.push('', `MCP next: ${plan.nextStatuses.join(' → ')}`, `Reason: ${plan.reason}`, '');
  return `${lines.join('\n')}\n`;
}

export interface DeliveryHistorySnapshot {
  total: number;
  recent: AcceptanceEvidence[];
  lastDeliverableCommit: string | null;
  failedGateTop: Array<{ gate: string; count: number }>;
}

export function buildDeliveryHistorySnapshot(items: AcceptanceEvidence[], limit = 5): DeliveryHistorySnapshot {
  const failedCounts: Record<string, number> = {};
  let lastDeliverableCommit: string | null = null;
  for (const item of items) {
    if (item.ok) lastDeliverableCommit = item.commit;
    for (const gate of item.failedGates) failedCounts[gate] = (failedCounts[gate] ?? 0) + 1;
  }
  const failedGateTop = Object.entries(failedCounts).map(([gate, count]) => ({ gate, count })).sort((a, b) => b.count - a.count || a.gate.localeCompare(b.gate));
  return { total: items.length, recent: items.slice(Math.max(0, items.length - limit)).map((item) => ({ ...item, gates: item.gates.map((gate) => ({ ...gate })) })), lastDeliverableCommit, failedGateTop };
}

export interface SafeForwardCommandPlan {
  mode: 'dry-run' | 'execute';
  executable: boolean;
  commands: string[];
  confirmationRequired: string;
}

export function buildSafeForwardCommandPlan(proposalId: string, plan: SafeForwardPlan, confirmation?: string): SafeForwardCommandPlan {
  const confirmationRequired = `EXECUTE ${proposalId}`;
  const executable = plan.canAdvance && confirmation === confirmationRequired;
  const commands = plan.nextStatuses.map((status) => `python3 mcp_aisp.py update-proposal-status --proposal-id ${proposalId} --status ${status}`);
  return { mode: executable ? 'execute' : 'dry-run', executable, commands, confirmationRequired };
}

export function buildProductionRunbook(input: { evidence: AcceptanceEvidence; checklist: FailureChecklistItem[]; ownership: DiffOwnership; plan: SafeForwardPlan }): string {
  const own = input.ownership;
  const lines = [
    `# Production Runbook — ${input.evidence.proposalId}`,
    '',
    `Summary: ${input.evidence.summary}`,
    `MCP next: ${input.plan.nextStatuses.join(' → ')}`,
    '',
    '## Failure Checklist',
    ...(input.checklist.length === 0 ? ['- none'] : input.checklist.map((item) => `- ${item.gate}: ${item.command} — ${item.hint}`)),
    '',
    '## Diff Ownership',
    `- proposalDocs: ${own.proposalDocs.length}`,
    `- productCode: ${own.productCode.length}`,
    `- tests: ${own.tests.length}`,
    `- generatedArtifacts: ${own.generatedArtifacts.length}`,
    `- docs: ${own.docs.length}`,
    `- other: ${own.other.length}`,
    '',
  ];
  return `${lines.join('\n')}\n`;
}

export function ingestCiEvidence(local: AcceptanceEvidence, ciGates: DeliveryGateInput[]): AcceptanceEvidence {
  return buildAcceptanceEvidence({ proposalId: local.proposalId, commit: local.commit, gates: [...local.gates, ...ciGates], ...(local.web ? { web: local.web } : {}) });
}

export interface IterationRecommendation {
  id: string;
  title: string;
  score: number;
  reason: string;
}

export function recommendNextIterations(input: { evidence: AcceptanceEvidence; ownership: DiffOwnership; weakCoverageFiles?: string[] }): IterationRecommendation[] {
  const recs: IterationRecommendation[] = [];
  if (input.evidence.failedGates.includes('verify:readme')) {
    recs.push({ id: 'stabilize-readme-gate', title: 'Stabilize README verification side effects', score: 100, reason: 'verify:readme is currently a failed hard gate' });
  }
  if (input.ownership.productCode.some((path) => path.startsWith('apps/web/') || path.includes('/web-server'))) {
    recs.push({ id: 'web-action-center', title: 'Expose delivery actions in the Web action center', score: 80, reason: 'recent changes touch operator-facing web surfaces' });
  }
  if ((input.weakCoverageFiles ?? []).length > 0) {
    recs.push({ id: 'route-coverage-hardening', title: 'Harden weak route coverage', score: 70, reason: `weak coverage: ${(input.weakCoverageFiles ?? []).join(', ')}` });
  }
  recs.push({ id: 'history-ledger-compaction', title: 'Compact delivery history ledger', score: 40, reason: 'keep long-running unattended evidence cheap to read' });
  return recs.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
}
