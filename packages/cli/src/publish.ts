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
  name: string;
  version: string;
  dryRun?: boolean;
}

export function buildPublish(input: PublishInput): PublishConfig {
  return {
    name: input.name,
    version: input.version,
    tarball: `${input.name.replace(/^@/, '').replace(/\//g, '-')}-${input.version}.tgz`,
    dryRun: input.dryRun ?? false,
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
  name: string;
  version: string;
}

export type BuildValidationResult =
  | { ok: true }
  | { ok: false; reason: string };

const NAME_RE = /^@?[a-z0-9][a-z0-9._-]*(\/[a-z0-9][a-z0-9._-]*)?$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[A-Za-z0-9.-]+)?$/;

export function validateBuild(input: BuildValidationInput): BuildValidationResult {
  if (!input.name || !NAME_RE.test(input.name)) return { ok: false, reason: `invalid package name: ${input.name}` };
  if (!input.version || !VERSION_RE.test(input.version)) return { ok: false, reason: `invalid semver: ${input.version}` };
  return { ok: true };
}
