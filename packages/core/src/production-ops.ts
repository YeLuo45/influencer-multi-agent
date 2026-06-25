import type { PlatformId } from './types.js';

export interface PlatformConnectorInput {
  platform: PlatformId;
  credentialPresent: boolean;
  healthOk: boolean;
  dryRunOk: boolean;
  realPostEnabled: boolean;
  retryableErrors: string[];
}

export interface PlatformConnectorReadiness extends PlatformConnectorInput {
  status: 'ready' | 'approval_required' | 'missing_credential' | 'health_failed' | 'dry_run_failed';
  envKey: string;
  nextStep: string;
}

export interface PlatformConnectorHardeningMatrix {
  total: number;
  ready: number;
  blocked: number;
  connectors: PlatformConnectorReadiness[];
}

export type ProductionApprovalKind = 'real-post' | 'mcp-forward' | 'push-retry' | 'runbook-command';
export type ProductionRisk = 'low' | 'medium' | 'high';

export interface ProductionApprovalAction {
  id: string;
  kind: ProductionApprovalKind;
  label: string;
  risk: ProductionRisk;
  command: string;
}

export interface ProductionApprovalQueueItem extends ProductionApprovalAction {
  status: 'pending_approval' | 'informational';
  confirmationRequired: string;
}

export interface ProductionApprovalQueue {
  requiresOperator: boolean;
  executableNow: false;
  items: ProductionApprovalQueueItem[];
}

export interface ProductionRunRecord {
  id: string;
  ok: boolean;
  durationMs: number;
  failedGates: string[];
  platformErrors: Record<string, number>;
  at: string;
}

export interface PersistentReleaseOpsLedger {
  rootDir: string;
  paths: string[];
  hot: ProductionRunRecord[];
  archive: { totalRuns: number; failures: number; latestAt: string | null };
}

export interface CiAutoIngestPlan {
  provider: string;
  mutatesRepo: false;
  commands: string[];
  expectedArtifactPath: string;
}

export interface CredentialRotationInput {
  platform: PlatformId;
  envKey: string;
  present: boolean;
  expiresInDays: number | null;
  scopes: string[];
}

export interface CredentialRotationItem extends CredentialRotationInput {
  status: 'ok' | 'rotate_soon' | 'missing' | 'scope_review';
  masked: string;
  note: string;
}

export interface CredentialRotationPlan {
  rotationRequired: boolean;
  items: CredentialRotationItem[];
}

export interface ProductionReplayStep {
  kind: 'trend' | 'draft' | 'platform-payload' | 'budget-check' | 'approval' | 'dry-run-publish';
  label: string;
}

export interface ProductionReplaySandbox {
  sideEffects: false;
  steps: ProductionReplayStep[];
  copyCommand: string;
}

export interface MultiRunAnalytics {
  totalRuns: number;
  successRate: number;
  meanDurationMs: number;
  topFailedGates: Array<{ name: string; count: number }>;
  platformErrors: Array<{ platform: string; count: number }>;
}

export interface ProductionExecutionReadiness {
  status: 'ready' | 'blocked';
  connectorMatrix: PlatformConnectorHardeningMatrix;
  approvalQueue: ProductionApprovalQueue;
  ledger: PersistentReleaseOpsLedger;
  ciIngest: CiAutoIngestPlan;
  credentialRotation: CredentialRotationPlan;
  replaySandbox: ProductionReplaySandbox;
  analytics: MultiRunAnalytics;
  nextActions: string[];
}

const PLATFORM_ENV_KEYS: Record<PlatformId, string> = {
  x: 'IMA_X_TOKEN',
  reddit: 'IMA_REDDIT_TOKEN',
  youtube: 'IMA_YOUTUBE_TOKEN',
  bilibili: 'IMA_BILIBILI_TOKEN',
  weibo: 'IMA_WEIBO_TOKEN',
  xiaohongshu: 'IMA_XHS_TOKEN',
};

const RISK_ORDER: Record<ProductionRisk, number> = { high: 0, medium: 1, low: 2 };

export function buildPlatformConnectorHardeningMatrix(connectors: PlatformConnectorInput[]): PlatformConnectorHardeningMatrix {
  const rows = connectors.map((connector) => {
    const envKey = PLATFORM_ENV_KEYS[connector.platform];
    const status = connectorStatus(connector);
    return {
      ...connector,
      status,
      envKey,
      nextStep: connectorNextStep(status, connector.platform, envKey),
    };
  });
  const ready = rows.filter((row) => row.status === 'ready').length;
  return { total: rows.length, ready, blocked: rows.length - ready, connectors: rows };
}

export function buildApprovalQueue(actions: ProductionApprovalAction[]): ProductionApprovalQueue {
  const items = [...actions]
    .sort((a, b) => RISK_ORDER[a.risk] - RISK_ORDER[b.risk] || a.id.localeCompare(b.id))
    .map((action) => ({
      ...action,
      status: action.risk === 'low' ? 'informational' as const : 'pending_approval' as const,
      confirmationRequired: `APPROVE ${action.id}`,
    }));
  return { requiresOperator: items.some((item) => item.status === 'pending_approval'), executableNow: false, items };
}

export function buildPersistentReleaseOpsLedger(records: ProductionRunRecord[], opts: { rootDir: string; keepLatest?: number }): PersistentReleaseOpsLedger {
  const rootDir = opts.rootDir.replace(/\/$/, '');
  const keepLatest = opts.keepLatest ?? records.length;
  const splitAt = Math.max(0, records.length - Math.max(0, keepLatest));
  const archiveRows = records.slice(0, splitAt);
  return {
    rootDir,
    paths: [`${rootDir}/runs.jsonl`, `${rootDir}/compacted-summary.json`, `${rootDir}/approvals.jsonl`],
    hot: records.slice(splitAt).map((record) => cloneRun(record)),
    archive: {
      totalRuns: archiveRows.length,
      failures: archiveRows.filter((record) => !record.ok).length,
      latestAt: archiveRows.reduce<string | null>((latest, record) => latest === null || record.at > latest ? record.at : latest, null),
    },
  };
}

export function buildCiAutoIngestPlan(input: { provider: string; branch?: string; artifactName?: string }): CiAutoIngestPlan {
  const branch = input.branch ?? 'master';
  const artifact = input.artifactName ?? 'release-evidence';
  return {
    provider: input.provider,
    mutatesRepo: false,
    commands: [
      `gh run list --branch ${branch} --limit 1 --json databaseId,conclusion,headSha`,
      `gh run download <run-id> -n ${artifact} -D .ima/release-ops/ci`,
    ],
    expectedArtifactPath: `.ima/release-ops/ci/${artifact}`,
  };
}

export function buildCredentialRotationPlan(inputs: CredentialRotationInput[]): CredentialRotationPlan {
  const items = inputs.map((input) => {
    const status = credentialStatus(input);
    return {
      ...input,
      status,
      masked: `${input.envKey}=***`,
      note: credentialNote(status, input.envKey),
    };
  });
  return { rotationRequired: items.some((item) => item.status !== 'ok'), items };
}

export function buildProductionReplaySandbox(input: { topic: string; platforms: PlatformId[]; budgetUsd: number }): ProductionReplaySandbox {
  const platforms = input.platforms.join(',');
  return {
    sideEffects: false,
    steps: [
      { kind: 'trend', label: `Load trend: ${input.topic}` },
      { kind: 'draft', label: 'Generate draft variants' },
      { kind: 'platform-payload', label: `Adapt payloads for ${platforms}` },
      { kind: 'budget-check', label: `Assert budget <= $${input.budgetUsd}` },
      { kind: 'approval', label: 'Queue operator approval' },
      { kind: 'dry-run-publish', label: 'Run sandbox publish only' },
    ],
    copyCommand: `npm run cli dry-run <content-id> --json --platforms ${platforms}`,
  };
}

export function buildMultiRunAnalytics(records: ProductionRunRecord[]): MultiRunAnalytics {
  const success = records.filter((record) => record.ok).length;
  const totalDuration = records.reduce((sum, record) => sum + record.durationMs, 0);
  return {
    totalRuns: records.length,
    successRate: records.length === 0 ? 0 : round2(success / records.length),
    meanDurationMs: records.length === 0 ? 0 : Math.round(totalDuration / records.length),
    topFailedGates: countNames(records.flatMap((record) => record.failedGates)),
    platformErrors: countEntries(records.flatMap((record) => Object.entries(record.platformErrors))),
  };
}

export function buildProductionExecutionReadiness(input: {
  connectors: PlatformConnectorInput[];
  actions: ProductionApprovalAction[];
  runs: ProductionRunRecord[];
  rootDir: string;
  topic: string;
}): ProductionExecutionReadiness {
  const connectorMatrix = buildPlatformConnectorHardeningMatrix(input.connectors);
  const approvalQueue = buildApprovalQueue(input.actions);
  const credentialRotation = buildCredentialRotationPlan(input.connectors.map((connector) => ({
    platform: connector.platform,
    envKey: PLATFORM_ENV_KEYS[connector.platform],
    present: connector.credentialPresent,
    expiresInDays: connector.credentialPresent ? 14 : null,
    scopes: connector.realPostEnabled ? ['post:write'] : [],
  })));
  const ledger = buildPersistentReleaseOpsLedger(input.runs, { rootDir: input.rootDir });
  const ciIngest = buildCiAutoIngestPlan({ provider: 'github-actions' });
  const replaySandbox = buildProductionReplaySandbox({ topic: input.topic, platforms: input.connectors.map((connector) => connector.platform), budgetUsd: 1 });
  const analytics = buildMultiRunAnalytics(input.runs);
  const nextActions: string[] = [];
  if (connectorMatrix.blocked > 0) nextActions.push('Resolve blocked platform connectors');
  if (approvalQueue.requiresOperator) nextActions.push('Review operator approval queue');
  if (credentialRotation.rotationRequired) nextActions.push('Rotate or scope-check credentials');
  return {
    status: connectorMatrix.blocked === 0 && !approvalQueue.requiresOperator && !credentialRotation.rotationRequired ? 'ready' : 'blocked',
    connectorMatrix,
    approvalQueue,
    ledger,
    ciIngest,
    credentialRotation,
    replaySandbox,
    analytics,
    nextActions,
  };
}

export interface ConnectorExecutionStep {
  kind: 'prepare' | 'dryRun' | 'approval' | 'execute' | 'verify' | 'rollback';
  command: string;
  willExecute: boolean;
}

export interface ConnectorExecutionPlan {
  mode: 'dry-run' | 'execute';
  executable: boolean;
  confirmationRequired: string;
  steps: ConnectorExecutionStep[];
}

export function buildRealConnectorExecutionPlan(input: { platform: PlatformId; contentId: string; approvalText?: string }): ConnectorExecutionPlan {
  const confirmationRequired = `EXECUTE ${input.platform} ${input.contentId}`;
  const executable = input.approvalText === confirmationRequired;
  const mode = executable ? 'execute' as const : 'dry-run' as const;
  const commands: Array<[ConnectorExecutionStep['kind'], string]> = [
    ['prepare', `npm run cli status ${input.contentId}`],
    ['dryRun', `npm run cli dry-run ${input.contentId} --json --platforms ${input.platform}`],
    ['approval', `require ${confirmationRequired}`],
    ['execute', `npm run cli publish-cli --real ${input.platform} ${input.contentId}`],
    ['verify', `npm run cli channel-test ${input.platform}`],
    ['rollback', `npm run cli cleanup ${input.platform} <post-id> --sandbox`],
  ];
  return { mode, executable, confirmationRequired, steps: commands.map(([kind, command]) => ({ kind, command, willExecute: executable && kind !== 'approval' })) };
}

export interface ApprovalStoreRow {
  id: string;
  kind: ProductionApprovalKind;
  status: 'pending' | 'approved' | 'rejected' | 'executed';
  command: string;
  approvalToken: string;
  risk: ProductionRisk;
  at: string;
}

export interface PersistentApprovalStore {
  path: string;
  rows: ApprovalStoreRow[];
  appendPreview: string;
}

export function buildPersistentApprovalStore(queue: ProductionApprovalQueue, opts: { rootDir: string; now: string }): PersistentApprovalStore {
  const rootDir = opts.rootDir.replace(/\/$/, '');
  const rows = queue.items.map((item) => ({
    id: item.id,
    kind: item.kind,
    status: item.status === 'informational' ? 'approved' as const : 'pending' as const,
    command: item.command,
    approvalToken: `APPROVED ${item.id}`,
    risk: item.risk,
    at: opts.now,
  }));
  return { path: `${rootDir}/approvals.jsonl`, rows, appendPreview: rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length > 0 ? '\n' : '') };
}

export interface CredentialHealthCard {
  platform: PlatformId;
  visible: string;
  severity: 'ok' | 'warning' | 'critical';
  note: string;
}

export interface CredentialHealthCenter {
  ok: boolean;
  cards: CredentialHealthCard[];
}

export function buildCredentialHealthCenter(plan: CredentialRotationPlan): CredentialHealthCenter {
  const cards = plan.items.map((item) => ({
    platform: item.platform,
    visible: item.masked,
    severity: credentialSeverity(item.status),
    note: item.note,
  }));
  return { ok: cards.every((card) => card.severity === 'ok'), cards };
}

export interface CiArtifactIngestExecution {
  ok: boolean;
  mutatesRepo: false;
  summary: string;
  gates: Array<{ name: string; ok: boolean; summary: string; command: string }>;
}

export function buildCiArtifactIngestExecution(input: { runId: string; conclusion: string; artifactPath: string; artifactFound: boolean }): CiArtifactIngestExecution {
  const ok = input.conclusion === 'success' && input.artifactFound;
  const summary = `run ${input.runId}: conclusion=${input.conclusion}; artifact=${input.artifactFound ? 'found' : 'missing'} at ${input.artifactPath}`;
  return { ok, mutatesRepo: false, summary, gates: [{ name: `github-actions/run-${input.runId}`, ok, summary: `conclusion=${input.conclusion}; artifact=${input.artifactFound ? 'found' : 'missing'}`, command: `gh run view ${input.runId}` }] };
}

export interface ReplayScenario {
  id: string;
  title: string;
  command: string;
  sideEffects: false;
}

export interface ReplayScenarioLibrary {
  scenarios: ReplayScenario[];
}

export function buildReplayScenarioLibrary(platforms: PlatformId[]): ReplayScenarioLibrary {
  const joined = platforms.join(',');
  return {
    scenarios: [
      { id: 'viral-trend', title: 'Viral trend dry-run', command: `npm run cli dry-run <content-id> --json --platforms ${joined}`, sideEffects: false },
      { id: 'long-form-distribution', title: 'Long-form cross-post replay', command: `npm run cli dry-run <long-content-id> --json --platforms ${joined}`, sideEffects: false },
      { id: 'reply-loop', title: 'Reply queue replay', command: 'npm run cli reply send --sandbox', sideEffects: false },
      { id: 'ab-budget-failure', title: 'A/B budget breaker replay', command: 'npm run cli production --simulate-budget-failure', sideEffects: false },
      { id: 'platform-retry', title: 'Platform retry replay', command: `npm run cli publish-test --sandbox ${joined}`, sideEffects: false },
    ],
  };
}

export interface ReleaseOpsTimelineEvent {
  at: string;
  kind: 'delivery' | 'approval' | 'ci' | 'push' | 'mcp' | 'credential';
  label: string;
  ok: boolean;
}

export interface ReleaseOpsEventTimeline {
  events: ReleaseOpsTimelineEvent[];
  failures: number;
  copyMarkdown: string;
}

export function buildReleaseOpsEventTimeline(events: ReleaseOpsTimelineEvent[]): ReleaseOpsEventTimeline {
  const sorted = [...events].sort((a, b) => a.at.localeCompare(b.at) || a.kind.localeCompare(b.kind));
  const copyMarkdown = ['# Release Ops Timeline', '', ...sorted.map((event) => `- ${event.at} [${event.kind}] ${event.ok ? 'ok' : 'blocked'} — ${event.label}`), ''].join('\n');
  return { events: sorted, failures: sorted.filter((event) => !event.ok).length, copyMarkdown };
}

export interface SafeExecutePlan {
  mode: 'dry-run' | 'execute';
  executable: boolean;
  command: string;
  reason: string;
}

export function buildSafeExecutePlan(rows: ApprovalStoreRow[], input: { actionId: string; approvalToken?: string }): SafeExecutePlan {
  const row = rows.find((item) => item.id === input.actionId);
  if (!row) return { mode: 'dry-run', executable: false, command: '', reason: `missing action ${input.actionId}` };
  const executable = row.status === 'approved' && input.approvalToken === row.approvalToken;
  return { mode: executable ? 'execute' : 'dry-run', executable, command: row.command, reason: executable ? 'approval matched' : `requires ${row.approvalToken}` };
}

export interface WebModeEnhancementDirection {
  id: string;
  title: string;
  area: 'web-mode';
  roi: number;
}

export function buildWebModeEnhancementDirections(): WebModeEnhancementDirection[] {
  return [
    { id: 'guided-command-palette', title: 'Guided Web command palette for safe ops', area: 'web-mode', roi: 100 },
    { id: 'approval-diff-preview', title: 'Approval diff preview before execute', area: 'web-mode', roi: 95 },
    { id: 'credential-setup-wizard', title: 'Credential setup wizard with masked validation', area: 'web-mode', roi: 90 },
    { id: 'timeline-filter-search', title: 'Timeline filter, search, and drill-down', area: 'web-mode', roi: 82 },
    { id: 'scenario-replay-builder', title: 'Visual replay scenario builder', area: 'web-mode', roi: 78 },
  ];
}

export interface WebCommandPaletteCommand {
  id: string;
  label: string;
  command: string;
  intent: 'gate' | 'approval' | 'credential';
  sideEffects: false;
}

export interface WebCommandPalette {
  primary: WebCommandPaletteCommand;
  commands: WebCommandPaletteCommand[];
}

export function buildWebCommandPalette(gates: string[]): WebCommandPalette {
  const gateCommand = gates.length > 0 ? gates.join(' && npm run ') : 'check';
  const commands: WebCommandPaletteCommand[] = [
    { id: 'run-all-gates', label: 'Run all local gates', command: `npm run ${gateCommand}`, intent: 'gate', sideEffects: false },
    { id: 'copy-safe-execute', label: 'Copy safe-execute command', command: 'npm run cli safe-execute -- --dry-run', intent: 'approval', sideEffects: false },
    { id: 'open-credential-wizard', label: 'Open credential setup wizard', command: 'npm run cli production --credentials', intent: 'credential', sideEffects: false },
  ];
  return { primary: commands[0]!, commands };
}

export interface ApprovalDiffPreviewInput {
  actionId: string;
  command: string;
  payload: Record<string, unknown>;
  changedFiles: string[];
  risk: ProductionRisk;
}

export interface ApprovalDiffPreview {
  actionId: string;
  risk: ProductionRisk;
  command: string;
  payloadJson: string;
  changedFileGroups: { productCode: string[]; docs: string[]; other: string[] };
  copyMarkdown: string;
}

export function buildApprovalDiffPreview(input: ApprovalDiffPreviewInput): ApprovalDiffPreview {
  const changedFileGroups = groupChangedFiles(input.changedFiles);
  const payloadJson = JSON.stringify(input.payload, null, 2);
  const copyMarkdown = [
    `# Approval Preview: ${input.actionId}`,
    '',
    `- Risk: ${input.risk}`,
    `- Command: \`${input.command}\``,
    '',
    '```json',
    payloadJson,
    '```',
    '',
    ...input.changedFiles.map((file) => `- ${file}`),
    '',
  ].join('\n');
  return { actionId: input.actionId, risk: input.risk, command: input.command, payloadJson, changedFileGroups, copyMarkdown };
}

export interface CredentialWizardStep {
  id: string;
  title: string;
  displaysSecret: false;
}

export interface CredentialSetupWizard {
  ok: boolean;
  steps: CredentialWizardStep[];
  copyGuide: string;
}

export function buildCredentialSetupWizard(center: CredentialHealthCenter): CredentialSetupWizard {
  const failing = center.cards.filter((card) => card.severity !== 'ok');
  const targets = failing.length > 0 ? failing : center.cards;
  const firstVisible = targets[0]?.visible ?? 'IMA_PLATFORM_TOKEN=***';
  return {
    ok: center.ok,
    steps: [
      { id: 'collect-token', title: `Collect token for ${firstVisible}`, displaysSecret: false },
      { id: 'write-env', title: 'Write masked key into local .env only', displaysSecret: false },
      { id: 'probe-health', title: 'Run credential health probe before real execute', displaysSecret: false },
    ],
    copyGuide: targets.map((card) => `${card.visible} — ${card.note}`).join('\n'),
  };
}

export interface TimelineFilterInput {
  kind?: ReleaseOpsTimelineEvent['kind'];
  query?: string;
  onlyFailures?: boolean;
}

export interface FilteredReleaseOpsTimeline extends ReleaseOpsEventTimeline {
  empty: boolean;
}

export function filterReleaseOpsTimeline(timeline: ReleaseOpsEventTimeline, input: TimelineFilterInput): FilteredReleaseOpsTimeline {
  const query = input.query?.trim().toLowerCase() ?? '';
  const events = timeline.events.filter((event) => {
    if (input.kind && event.kind !== input.kind) return false;
    if (input.onlyFailures && event.ok) return false;
    if (query.length > 0 && !`${event.label} ${event.kind}`.toLowerCase().includes(query)) return false;
    return true;
  });
  return { events, failures: events.filter((event) => !event.ok).length, copyMarkdown: buildReleaseOpsEventTimeline(events).copyMarkdown, empty: events.length === 0 };
}

export interface ScenarioReplayFormField {
  name: string;
  value: string;
}

export interface ScenarioReplayForm {
  id: string;
  title: string;
  command: string;
  fields: ScenarioReplayFormField[];
  submitMode: 'dry-run';
}

export interface ScenarioReplayBuilder {
  forms: ScenarioReplayForm[];
}

export function buildScenarioReplayBuilder(library: ReplayScenarioLibrary): ScenarioReplayBuilder {
  return {
    forms: library.scenarios.map((scenario) => ({
      id: scenario.id,
      title: scenario.title,
      command: scenario.command,
      fields: [
        { name: 'contentId', value: '<content-id>' },
        { name: 'platforms', value: extractPlatforms(scenario.command) },
        { name: 'budgetUsd', value: '1.00' },
      ],
      submitMode: 'dry-run',
    })),
  };
}

export interface WebNotificationItem {
  kind: 'credential' | 'approval' | 'timeline';
  severity: 'critical' | 'warning' | 'info';
  label: string;
}

export interface WebNotificationCenter {
  unread: number;
  items: WebNotificationItem[];
}

export function buildWebNotificationCenter(input: { credentialHealth: CredentialHealthCenter; approvalRows: ApprovalStoreRow[]; timeline: ReleaseOpsEventTimeline }): WebNotificationCenter {
  const items: WebNotificationItem[] = [];
  for (const card of input.credentialHealth.cards.filter((card) => card.severity !== 'ok')) {
    items.push({ kind: 'credential', severity: card.severity === 'critical' ? 'critical' : 'warning', label: `${card.platform}: ${card.note}` });
  }
  const pendingApprovals = input.approvalRows.filter((row) => row.status === 'pending');
  if (pendingApprovals.length > 0) {
    const highRisk = pendingApprovals.some((row) => row.risk === 'high');
    items.push({ kind: 'approval', severity: highRisk ? 'critical' : 'warning', label: `${pendingApprovals.length} actions require approval` });
  }
  for (const event of input.timeline.events.filter((event) => !event.ok)) {
    items.push({ kind: 'timeline', severity: 'warning', label: event.label });
  }
  const order: Record<WebNotificationItem['kind'], number> = { credential: 0, approval: 1, timeline: 2 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || a.label.localeCompare(b.label));
  return { unread: items.length, items };
}

export interface OperatorSessionAction {
  at: string;
  action: string;
  target: string;
  result: 'ok' | 'blocked';
}

export interface OperatorSessionReplay {
  total: number;
  replayCommand: string;
  copyMarkdown: string;
}

export function buildOperatorSessionReplay(actions: OperatorSessionAction[]): OperatorSessionReplay {
  const sorted = [...actions].sort((a, b) => a.at.localeCompare(b.at));
  return {
    total: sorted.length,
    replayCommand: 'npm run cli production',
    copyMarkdown: ['# Operator Session Replay', '', ...sorted.map((action) => `- ${action.at} ${action.result}: ${action.action} -> ${action.target}`), ''].join('\n'),
  };
}

export interface WebModeExperiencePackInput {
  gates: string[];
  approvalQueue: ProductionApprovalQueue;
  credentialHealth: CredentialHealthCenter;
  scenarios: ReplayScenarioLibrary;
  timeline: ReleaseOpsEventTimeline;
}

export interface SafeExecuteWebAction {
  id: 'safe-execute';
  label: string;
  confirmationRequired: string;
  command: string;
  sideEffects: false;
}

export interface ScenarioPersistencePlan {
  path: string;
  appendPreview: string;
  scenarioCount: number;
}

export interface DeliveryClosurePlan {
  proposalId: string;
  statusPath: ['in_test_acceptance', 'accepted', 'deployed', 'delivered'];
  commands: string[];
}

export interface WebOpsCompletionPackInput extends WebModeExperiencePackInput {
  proposalId: string;
  sessionActions: OperatorSessionAction[];
}

export interface WebOpsCompletionPack {
  proposalId: string;
  webMode: WebModeExperiencePack;
  safeExecuteAction: SafeExecuteWebAction;
  scenarioPersistence: ScenarioPersistencePlan;
  operatorTimeline: OperatorSessionReplay;
  ciImport: CiAutoIngestPlan;
  deliveryClosure: DeliveryClosurePlan;
}

export interface ProductionExecutionSlaInput {
  proposalId: string;
  now: string;
  approvalRows: ApprovalStoreRow[];
  credentialHealth: CredentialHealthCenter;
  ciArtifacts: Array<{ path: string; exists: boolean; modifiedAt: string }>;
  auditEvents: OperatorSessionAction[];
  runs: ProductionRunRecord[];
}

export interface ProductionExecutionSlaPack {
  proposalId: string;
  executionAdapter: { mode: 'dry-run'; confirmationRequired: string; command: string; sideEffects: false };
  auditLedger: { path: string; appendPreview: string; eventCount: number };
  ciArtifactRead: { found: number; missing: number; latestPath: string | null; commands: string[] };
  credentialProbe: { rows: Array<{ platform: PlatformId; status: CredentialHealthCard['severity']; probeCommand: string; note: string }> };
  slaDashboard: { status: 'ok' | 'attention'; metrics: Array<{ id: string; value: number; unit: string; status: 'ok' | 'attention' }> };
}

export interface WebModeExperiencePack {
  mode: 'operator-workbench';
  commandPalette: WebCommandPalette;
  credentialWizard: CredentialSetupWizard;
  scenarioBuilder: ScenarioReplayBuilder;
  notificationCenter: WebNotificationCenter;
  nextDirections: WebModeEnhancementDirection[];
}

export function buildWebModeExperiencePack(input: WebModeExperiencePackInput): WebModeExperiencePack {
  const approvalRows = buildPersistentApprovalStore(input.approvalQueue, { rootDir: '.ima/release-ops', now: '1970-01-01T00:00:00.000Z' }).rows;
  return {
    mode: 'operator-workbench',
    commandPalette: buildWebCommandPalette(input.gates),
    credentialWizard: buildCredentialSetupWizard(input.credentialHealth),
    scenarioBuilder: buildScenarioReplayBuilder(input.scenarios),
    notificationCenter: buildWebNotificationCenter({ credentialHealth: input.credentialHealth, approvalRows, timeline: input.timeline }),
    nextDirections: buildWebModeEnhancementDirections(),
  };
}

export function buildWebOpsCompletionPack(input: WebOpsCompletionPackInput): WebOpsCompletionPack {
  const webMode = buildWebModeExperiencePack(input);
  const scenarioRows = input.scenarios.scenarios.map((scenario) => JSON.stringify({ id: scenario.id, title: scenario.title, command: scenario.command, sideEffects: scenario.sideEffects }));
  const statusPath: DeliveryClosurePlan['statusPath'] = ['in_test_acceptance', 'accepted', 'deployed', 'delivered'];
  return {
    proposalId: input.proposalId,
    webMode,
    safeExecuteAction: {
      id: 'safe-execute',
      label: 'Safe Execute',
      confirmationRequired: `EXECUTE ${input.proposalId}`,
      command: `npm run cli delivery safe-forward --proposal ${input.proposalId} --execute`,
      sideEffects: false,
    },
    scenarioPersistence: {
      path: '.ima/release-ops/scenarios.jsonl',
      appendPreview: scenarioRows.join('\n') + (scenarioRows.length > 0 ? '\n' : ''),
      scenarioCount: scenarioRows.length,
    },
    operatorTimeline: buildOperatorSessionReplay(input.sessionActions),
    ciImport: buildCiAutoIngestPlan({ provider: 'github-actions', branch: 'master', artifactName: 'release-evidence' }),
    deliveryClosure: {
      proposalId: input.proposalId,
      statusPath,
      commands: statusPath.map((status) => `python3 mcp_aisp.py update-proposal-status --proposal-id ${input.proposalId} --status ${status}`),
    },
  };
}

export function buildProductionExecutionSlaPack(input: ProductionExecutionSlaInput): ProductionExecutionSlaPack {
  const newestArtifact = input.ciArtifacts.filter((artifact) => artifact.exists).sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))[0];
  const pendingApprovals = input.approvalRows.filter((row) => row.status === 'pending');
  const oldestPending = pendingApprovals.map((row) => Date.parse(input.now) - Date.parse(row.at)).filter((age) => Number.isFinite(age)).sort((a, b) => b - a)[0] ?? 0;
  const credentialIssues = input.credentialHealth.cards.filter((card) => card.severity !== 'ok').length;
  const failedRuns = input.runs.filter((run) => !run.ok).length;
  const metrics = [
    { id: 'pending-approval-age', value: Math.round(oldestPending / 60000), unit: 'minutes', status: pendingApprovals.length > 0 ? 'attention' : 'ok' },
    { id: 'credential-expiry', value: credentialIssues, unit: 'issues', status: credentialIssues > 0 ? 'attention' : 'ok' },
    { id: 'ci-artifacts-found', value: input.ciArtifacts.filter((artifact) => artifact.exists).length, unit: 'artifacts', status: newestArtifact ? 'ok' : 'attention' },
    { id: 'failed-runs', value: failedRuns, unit: 'runs', status: failedRuns > 0 ? 'attention' : 'ok' },
  ] satisfies ProductionExecutionSlaPack['slaDashboard']['metrics'];
  return {
    proposalId: input.proposalId,
    executionAdapter: {
      mode: 'dry-run',
      confirmationRequired: `EXECUTE ${input.proposalId}`,
      command: `npm run cli safe-execute ${pendingApprovals[0]?.id ?? '<action-id>'} --approval "EXECUTE ${input.proposalId}"`,
      sideEffects: false,
    },
    auditLedger: {
      path: '.ima/release-ops/web-audit.jsonl',
      appendPreview: input.auditEvents.map((event) => JSON.stringify(event)).join('\n') + (input.auditEvents.length > 0 ? '\n' : ''),
      eventCount: input.auditEvents.length,
    },
    ciArtifactRead: {
      found: input.ciArtifacts.filter((artifact) => artifact.exists).length,
      missing: input.ciArtifacts.filter((artifact) => !artifact.exists).length,
      latestPath: newestArtifact?.path ?? null,
      commands: ['gh run list --branch master --limit 1 --json databaseId,conclusion,headSha', 'gh run download <run-id> -n release-evidence -D .ima/release-ops/ci'],
    },
    credentialProbe: {
      rows: input.credentialHealth.cards.map((card) => ({
        platform: card.platform,
        status: card.severity,
        probeCommand: `npm run cli credential probe --platform ${card.platform}`,
        note: card.note,
      })),
    },
    slaDashboard: {
      status: metrics.some((metric) => metric.status === 'attention') ? 'attention' : 'ok',
      metrics,
    },
  };
}

function groupChangedFiles(files: string[]): ApprovalDiffPreview['changedFileGroups'] {
  return {
    productCode: files.filter((file) => file.startsWith('packages/')),
    docs: files.filter((file) => file.startsWith('docs/') || file.endsWith('.md')),
    other: files.filter((file) => !file.startsWith('packages/') && !file.startsWith('docs/') && !file.endsWith('.md')),
  };
}

function extractPlatforms(command: string): string {
  const match = command.match(/--platforms\s+([^\s]+)/);
  if (match?.[1]) return match[1];
  const parts = command.trim().split(/\s+/);
  return parts.at(-1) ?? '';
}

function credentialSeverity(status: CredentialRotationItem['status']): CredentialHealthCard['severity'] {
  if (status === 'missing') return 'critical';
  if (status === 'rotate_soon' || status === 'scope_review') return 'warning';
  return 'ok';
}

function connectorStatus(connector: PlatformConnectorInput): PlatformConnectorReadiness['status'] {
  if (!connector.credentialPresent) return 'missing_credential';
  if (!connector.healthOk) return 'health_failed';
  if (!connector.dryRunOk) return 'dry_run_failed';
  return connector.realPostEnabled ? 'ready' : 'approval_required';
}

function connectorNextStep(status: PlatformConnectorReadiness['status'], platform: PlatformId, envKey: string): string {
  if (status === 'missing_credential') return `configure ${envKey}`;
  if (status === 'health_failed') return `run ${platform} credential probe and health check`;
  if (status === 'dry_run_failed') return `fix ${platform} dry-run payload before real posting`;
  if (status === 'approval_required') return `operator approval required before real ${platform} post`;
  return `${platform} connector ready for approved real post`;
}

function credentialStatus(input: CredentialRotationInput): CredentialRotationItem['status'] {
  if (!input.present) return 'missing';
  if (input.scopes.some((scope) => scope.includes('admin') || scope.includes('*'))) return 'scope_review';
  if (input.expiresInDays !== null && input.expiresInDays <= 7) return 'rotate_soon';
  return 'ok';
}

function credentialNote(status: CredentialRotationItem['status'], envKey: string): string {
  if (status === 'missing') return `${envKey} is not configured`;
  if (status === 'rotate_soon') return `${envKey} expires soon`;
  if (status === 'scope_review') return `${envKey} has broader scope than post-only`;
  return `${envKey} is usable`;
}

function cloneRun(record: ProductionRunRecord): ProductionRunRecord {
  return { ...record, failedGates: [...record.failedGates], platformErrors: { ...record.platformErrors } };
}

function countNames(names: string[]): Array<{ name: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const name of names) counts[name] = (counts[name] ?? 0) + 1;
  return Object.entries(counts).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

function countEntries(entries: Array<[string, number]>): Array<{ platform: string; count: number }> {
  const counts: Record<string, number> = {};
  for (const [platform, count] of entries) counts[platform] = (counts[platform] ?? 0) + count;
  return Object.entries(counts).map(([platform, count]) => ({ platform, count })).filter((item) => item.count > 0).sort((a, b) => b.count - a.count || a.platform.localeCompare(b.platform));
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
