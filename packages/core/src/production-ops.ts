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
