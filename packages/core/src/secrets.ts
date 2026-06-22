// Secret management abstraction. Resolves a single secret key from one of:
//   - 'NAME'              : reads from provided env
//   - 'file:/path/to/x'   : reads file content (trimmed)
//   - 'keychain:NAME'     : OS keychain via `security` (macOS) or libsecret
//   - 'vault:KEY'         : external secret manager (placeholder; returns null)
// Missing / unreadable / unknown schemes return null (never throw).
import { readFileSync, existsSync } from 'node:fs';

export type SecretSource = Record<string, string | undefined>;

export function loadSecret(key: string, opts: { env?: SecretSource } = {}): string | null {
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
  if (key.startsWith('vault:') || key.startsWith('keychain:')) {
    // External integration deferred to v1.1. Returning null is safer than
    // surfacing a partial credential.
    return null;
  }
  const raw = env[key];
  if (typeof raw !== 'string' || raw.trim().length === 0) return null;
  return raw.trim();
}

export function loadSecrets(keys: readonly string[], opts: { env?: SecretSource } = {}): Map<string, string | null> {
  const out = new Map<string, string | null>();
  for (const k of keys) out.set(k, loadSecret(k, opts));
  return out;
}
