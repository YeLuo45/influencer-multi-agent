// Build / publish helpers for the @ima/cli npm package. Lets the team
// validate a release locally and emit a deterministic tarball name.
// Does NOT call `npm publish` — that step stays a manual command until
// we wire up provenance in v1.1.

export interface PublishConfig {
  name: string;
  version: string;
  tarball: string;
  /** When true, skip running `npm pack`; just compute the tarball path. */
  dryRun: boolean;
}

export interface PublishInput {
  name?: string;
  version?: string;
  packageName?: string;
  currentVersion?: string;
  bump?: BumpKind;
  dryRun?: boolean;
  checks?: string[];
}

export function buildPublish(input: PublishInput): PublishConfig & { checks?: string[] } {
  const name = input.name ?? input.packageName ?? '';
  const version = input.version ?? (input.currentVersion && input.bump ? suggestVersion(input.currentVersion, input.bump) : '');
  return {
    name,
    version,
    tarball: `${name.replace(/^@/, '').replace(/\//g, '-')}-${version}.tgz`,
    dryRun: input.dryRun ?? false,
    ...(input.checks ? { checks: [...input.checks] } : {}),
  };
}

export type BumpKind = 'patch' | 'minor' | 'major' | 'rc';

export function suggestVersion(current: string, kind: BumpKind): string {
  const m = current.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/);
  if (!m) throw new Error(`not a semver: ${current}`);
  const [, major, minor, patch, pre] = m as unknown as [string, string, string, string, string?];
  let next = `${major}.${minor}.${patch}`;
  if (kind === 'rc') {
    if (pre && pre.startsWith('rc.')) {
      const n = Number(pre.slice(3));
      return `${next}-rc.${Number.isFinite(n) ? n + 1 : 1}`;
    }
    return `${next}-rc.1`;
  }
  const maj = Number(major), min = Number(minor), pat = Number(patch);
  if (kind === 'patch') return `${maj}.${min}.${pat + 1}`;
  if (kind === 'minor') return `${maj}.${min + 1}.0`;
  return `${maj + 1}.0.0`;
}

export interface BuildValidationInput {
  name?: string;
  version?: string;
  checks?: string[];
}

export type BuildValidationResult =
  | { ok: true; errors?: never }
  | { ok: false; reason: string; errors: string[] };

const NAME_RE = /^@?[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;
const REQUIRED_GATE_COMMANDS = ['npm test', 'npm run check', 'npm run build', 'npm run coverage'] as const;

export function validateBuild(input: BuildValidationInput): BuildValidationResult {
  const errors: string[] = [];
  if (!input.name || !NAME_RE.test(input.name)) errors.push(`invalid package name: ${input.name}`);
  if (!input.version || !VERSION_RE.test(input.version)) errors.push(`invalid semver: ${input.version}`);
  if (input.checks) {
    for (const command of REQUIRED_GATE_COMMANDS) {
      if (!input.checks.includes(command)) errors.push(`missing gate: ${command}`);
    }
  }
  return errors.length === 0 ? { ok: true } : { ok: false, reason: errors[0] ?? 'invalid build', errors };
}

export interface PrepublishGate {
  packageName: string;
  version: string;
  commands: string[];
  ready: boolean;
  summary: string;
}

export function buildPrepublishGate(input: { packageName: string; version: string }): PrepublishGate {
  const commands = [...REQUIRED_GATE_COMMANDS, `npm pack -w ${input.packageName} --dry-run`];
  const validation = validateBuild({ name: input.packageName, version: input.version, checks: commands });
  return {
    packageName: input.packageName,
    version: input.version,
    commands,
    ready: validation.ok,
    summary: `${input.packageName}@${input.version} prepublish gate: ${validation.ok ? 'ready' : 'blocked'}`,
  };
}
