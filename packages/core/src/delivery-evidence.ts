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

export interface PushRecoveryPlan {
  status: 'synced' | 'ahead' | 'behind' | 'diverged';
  needsPush: boolean;
  command: string;
  note: string;
}

export function buildPushRecoveryPlan(input: { local: string; remote: string; branch?: string; remoteName?: string }): PushRecoveryPlan {
  const branch = input.branch ?? 'master';
  const remoteName = input.remoteName ?? 'origin';
  if (input.local === input.remote) return { status: 'synced', needsPush: false, command: `git push ${remoteName} ${branch}`, note: 'local and remote are equal' };
  if (input.local && input.remote) return { status: 'ahead', needsPush: true, command: `git push ${remoteName} ${branch}`, note: `local ${input.local} differs from remote ${input.remote}` };
  return { status: input.local ? 'ahead' : 'behind', needsPush: Boolean(input.local), command: `git push ${remoteName} ${branch}`, note: 'one side is missing a commit hash' };
}

export function buildDeliveryHistoryJsonl(existing: string, items: AcceptanceEvidence[]): string {
  const prefix = existing.trim().length > 0 ? `${existing.trim()}\n` : '';
  const rows = items.map((item) => JSON.stringify(item)).join('\n');
  return `${prefix}${rows}${rows ? '\n' : ''}`;
}

export function parseDeliveryHistoryJsonl(jsonl: string): AcceptanceEvidence[] {
  return jsonl.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line) as AcceptanceEvidence);
}

export interface WebActionManifest {
  primaryActionId: string;
  actions: Array<{ id: string; label: string; kind: 'copy' | 'download'; payload: string }>;
}

export function buildWebActionManifest(evidence: AcceptanceEvidence, plan: SafeForwardPlan): WebActionManifest {
  const commandPlan = buildSafeForwardCommandPlan(evidence.proposalId, plan);
  const markdown = buildDeliveryMarkdown(evidence, plan);
  return {
    primaryActionId: plan.canAdvance ? 'copy-mcp-commands' : 'copy-runbook',
    actions: [
      { id: 'copy-runbook', label: 'Copy runbook', kind: 'copy', payload: `Runbook for ${evidence.proposalId}: ${evidence.summary}` },
      { id: 'copy-mcp-commands', label: 'Copy MCP commands', kind: 'copy', payload: commandPlan.commands.join('\n') },
      { id: 'download-delivery-markdown', label: 'Download delivery markdown', kind: 'download', payload: markdown },
    ],
  };
}

export interface CiRunSummaryInput {
  provider: string;
  jobs: Array<{ name: string; conclusion: 'success' | 'failure' | 'cancelled' | 'skipped' | string }>;
}

export function parseCiRunSummary(input: CiRunSummaryInput): DeliveryGateInput[] {
  return input.jobs.map((job) => ({
    name: `${input.provider}/${job.name}`,
    ok: job.conclusion === 'success' || job.conclusion === 'skipped',
    summary: `conclusion=${job.conclusion}`,
    command: input.provider === 'github-actions' ? 'gh run view' : `inspect ${input.provider}`,
  }));
}

export interface ReleaseOpsDashboard {
  status: 'ready' | 'blocked';
  summary: string;
  failedQueue: FailureChecklistItem[];
  primaryActionId: string;
  history: DeliveryHistorySnapshot;
  ci: { total: number; passed: number; failed: number; failedGates: string[] };
  push: PushRecoveryPlan;
}

export function buildReleaseOpsDashboard(input: {
  evidence: AcceptanceEvidence;
  plan: SafeForwardPlan;
  history: DeliveryHistorySnapshot;
  webActions: WebActionManifest;
  ciGates?: DeliveryGateInput[];
  pushRecovery: PushRecoveryPlan;
}): ReleaseOpsDashboard {
  const ciGates = input.ciGates ?? [];
  const failedCi = ciGates.filter((gate) => !gate.ok).map((gate) => gate.name);
  const failedQueue = buildFailureChecklist(input.evidence.gates);
  return {
    status: input.evidence.ok && failedCi.length === 0 ? 'ready' : 'blocked',
    summary: `${input.evidence.summary}; ci ${ciGates.length - failedCi.length}/${ciGates.length} passed; push=${input.pushRecovery.status}`,
    failedQueue,
    primaryActionId: input.webActions.primaryActionId,
    history: input.history,
    ci: { total: ciGates.length, passed: ciGates.length - failedCi.length, failed: failedCi.length, failedGates: failedCi },
    push: input.pushRecovery,
  };
}

export interface SafeForwardExecutionStep {
  index: number;
  status: SafeForwardPlan['nextStatuses'][number];
  command: string;
  willExecute: boolean;
}

export interface SafeForwardExecutionPlan {
  mode: 'dry-run' | 'execute';
  executable: boolean;
  confirmationRequired: string;
  steps: SafeForwardExecutionStep[];
  auditTrail: string[];
}

export function buildSafeForwardExecutionPlan(proposalId: string, plan: SafeForwardPlan, confirmation?: string): SafeForwardExecutionPlan {
  const commandPlan = buildSafeForwardCommandPlan(proposalId, plan, confirmation);
  const steps = plan.nextStatuses.map((status, index) => ({
    index: index + 1,
    status,
    command: commandPlan.commands[index] ?? `python3 mcp_aisp.py update-proposal-status --proposal-id ${proposalId} --status ${status}`,
    willExecute: commandPlan.executable,
  }));
  return {
    mode: commandPlan.mode,
    executable: commandPlan.executable,
    confirmationRequired: commandPlan.confirmationRequired,
    steps,
    auditTrail: steps.map((step) => `${proposalId}:${step.status}:${step.willExecute ? 'execute' : 'dry-run'}`),
  };
}

export interface CompactedDeliveryHistoryLedger {
  total: number;
  kept: AcceptanceEvidence[];
  archived: DeliveryHistorySnapshot;
}

export function compactDeliveryHistoryLedger(items: AcceptanceEvidence[], keepLatest = 20): CompactedDeliveryHistoryLedger {
  const keep = Math.max(0, keepLatest);
  const splitAt = Math.max(0, items.length - keep);
  const archivedItems = items.slice(0, splitAt);
  const kept = items.slice(splitAt).map((item) => ({ ...item, gates: item.gates.map((gate) => ({ ...gate })) }));
  return { total: items.length, kept, archived: buildDeliveryHistorySnapshot(archivedItems, archivedItems.length) };
}

export interface StructuredRunbookStep {
  kind: 'precondition' | 'command' | 'mcp-forward';
  label: string;
  command?: string;
  expected: string;
}

export interface StructuredRunbook {
  title: string;
  steps: StructuredRunbookStep[];
  copyMarkdown: string;
}

export function buildStructuredRunbook(input: { evidence: AcceptanceEvidence; plan: SafeForwardPlan; commands: string[] }): StructuredRunbook {
  const steps: StructuredRunbookStep[] = [
    { kind: 'precondition', label: 'Verify delivery evidence', expected: input.evidence.summary },
    ...input.commands.map((command) => ({ kind: 'command' as const, label: command, command, expected: 'exit code 0' })),
    { kind: 'mcp-forward', label: 'Forward proposal status', command: input.plan.nextStatuses.join(' → '), expected: input.plan.canAdvance ? 'delivered' : 'test_failed' },
  ];
  const title = `Production Runbook — ${input.evidence.proposalId}`;
  const copyMarkdown = [`# ${title}`, '', ...steps.map((step, index) => `${index + 1}. ${step.label}${step.command ? ` — \`${step.command}\`` : ''} (${step.expected})`), ''].join('\n');
  return { title, steps, copyMarkdown };
}

export interface ReleaseLocalHardeningPlan {
  storageRoot: string;
  recursiveVerifyReadme: false;
  commands: string[];
  sideEffectPolicy: 'isolated-storage-root';
}

export function buildReleaseLocalHardeningPlan(baseDir: string): ReleaseLocalHardeningPlan {
  const root = baseDir.replace(/\/$/, '');
  return {
    storageRoot: `${root}/.ima-release-local`,
    recursiveVerifyReadme: false,
    sideEffectPolicy: 'isolated-storage-root',
    commands: ['npm run check', 'npm test', 'npm run coverage', 'npm run verify:readme', 'npm run build', 'npm run cli release-local-json'],
  };
}
