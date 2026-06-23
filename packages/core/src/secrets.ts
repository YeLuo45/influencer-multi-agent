// Secret management abstraction. Resolves a single secret key from one of:
//   - 'NAME'              : reads from provided env
//   - 'file:/path/to/x'   : reads file content (trimmed)
//   - 'keychain:NAME'     : OS keychain via `security` (macOS) or libsecret
//   - 'vault:KEY'         : external secret manager (placeholder; returns null)
// Missing / unreadable / unknown schemes return null (never throw).
import { readFileSync, existsSync } from 'node:fs';

export type SecretSource = Record<string, string | undefined>;

export interface SecretLoadOptions {
  env?: SecretSource;
  vault?: SecretSource | { get(key: string): string | null };
  keychain?: SecretSource;
}

export interface SecretRequirement {
  name: string;
  source: string;
}

export interface SecretDiagnosticItem {
  name: string;
  source: string;
  status: 'ok' | 'missing';
  redacted: string | null;
  fix: string;
}

export interface SecretDiagnosticReport {
  ready: boolean;
  items: SecretDiagnosticItem[];
}

export function loadSecret(key: string, opts: SecretLoadOptions = {}): string | null {
  const env = opts.env ?? (process.env as SecretSource);
  if (key.startsWith('file:')) {
    const path = key.slice('file:'.length);
    if (!existsSync(path)) return null;
    try {
      return readFileSync(path, 'utf-8').trim() || null;
    } catch {
      return null;
    }
  }
  if (key.startsWith('vault:')) {
    const vaultKey = key.slice('vault:'.length);
    if (opts.vault && 'get' in opts.vault && typeof opts.vault.get === 'function') {
      return opts.vault.get(vaultKey);
    }
    const vaultSource = opts.vault as SecretSource | undefined;
    const raw = vaultSource?.[vaultKey];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  }
  if (key.startsWith('keychain:')) {
    const raw = opts.keychain?.[key.slice('keychain:'.length)];
    return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
  }
  const raw = env[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  return raw.trim();
}

export function loadSecrets(keys: readonly string[], opts: SecretLoadOptions = {}): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const k of keys) out.set(k, loadSecret(k, opts));
  return out;
}

export function diagnoseSecrets(requirements: readonly SecretRequirement[], opts: SecretLoadOptions = {}): SecretDiagnosticReport {
  const items = requirements.map((requirement): SecretDiagnosticItem => {
    const value = loadSecret(requirement.source, opts);
    const status: SecretDiagnosticItem['status'] = value ? 'ok' : 'missing';
    return {
      name: requirement.name,
      source: requirement.source,
      status,
      redacted: value ? redactSecret(value) : null,
      fix: status === 'ok' ? 'configured' : buildFix(requirement.source),
    };
  });
  return { ready: items.every((item) => item.status === 'ok'), items };
}

function buildFix(source: string): string {
  if (source.startsWith('file:')) return `create secret file ${source.slice('file:'.length)}`;
  if (source.startsWith('vault:')) return `add ${source.slice('vault:'.length)} to vault provider`;
  if (source.startsWith('keychain:')) return `add ${source.slice('keychain:'.length)} to keychain provider`;
  return `set ${source}`;
}

function redactSecret(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
