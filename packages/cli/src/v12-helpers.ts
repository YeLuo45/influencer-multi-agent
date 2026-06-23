import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface LocalSecretVault {
  set(key: string, value: string): void;
  get(key: string): string | null;
  list(): Array<{ key: string; redacted: string }>;
}

interface VaultFile {
  version: 1;
  fingerprint: string;
  secrets: Record<string, string>;
}

export function createCliLocalSecretVault(opts: { rootDir: string; passphrase?: string }): LocalSecretVault {
  const passphrase = opts.passphrase ?? process.env.IMA_SECRET_PASSPHRASE ?? 'ima-local-dev';
  const file = join(opts.rootDir, '.ima', 'secrets.json');
  return {
    set(key, value) {
      const data = readVault(file, passphrase);
      data.secrets[key] = encodeSecret(value, passphrase);
      writeVault(file, data);
    },
    get(key) {
      const data = readVault(file, passphrase);
      if (data.fingerprint !== fingerprint(passphrase)) return null;
      const raw = data.secrets[key];
      return raw ? decodeSecret(raw, passphrase) : null;
    },
    list() {
      const data = readVault(file, passphrase);
      if (data.fingerprint !== fingerprint(passphrase)) return [];
      return Object.keys(data.secrets).sort().map((key) => ({ key, redacted: redactSecret(this.get(key) ?? '') }));
    },
  };
}

export function buildCliSandboxPublishPlan(input: { platform: string; sandbox: boolean; title: string; body: string; tags: string[] }): { platform: string; willPost: false; command: string; checks: string[] } {
  if (!input.sandbox) throw new Error('sandbox required for publish-test');
  return {
    platform: input.platform,
    willPost: false,
    command: `ima publish-test ${input.platform} --sandbox --verify --cleanup`,
    checks: ['dry-run', 'channel-test', 'publish-test', 'verify-post', 'cleanup'],
  };
}

function readVault(file: string, passphrase: string): VaultFile {
  if (!existsSync(file)) return { version: 1, fingerprint: fingerprint(passphrase), secrets: {} };
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<VaultFile>;
    return parsed.version === 1 && parsed.secrets
      ? { version: 1, fingerprint: parsed.fingerprint ?? '', secrets: parsed.secrets }
      : { version: 1, fingerprint: fingerprint(passphrase), secrets: {} };
  } catch {
    return { version: 1, fingerprint: fingerprint(passphrase), secrets: {} };
  }
}

function writeVault(file: string, data: VaultFile): void {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function fingerprint(passphrase: string): string {
  let hash = 2166136261;
  for (const char of passphrase) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash).toString(36);
}

function encodeSecret(value: string, passphrase: string): string {
  const key = passphrase || 'ima-local-dev';
  return Array.from(value).map((char, index) => (char.charCodeAt(0) ^ key.charCodeAt(index % key.length)).toString(36).padStart(2, '0')).join('-');
}

function decodeSecret(value: string, passphrase: string): string {
  const key = passphrase || 'ima-local-dev';
  return value.split('-').map((part, index) => String.fromCharCode(Number.parseInt(part, 36) ^ key.charCodeAt(index % key.length))).join('');
}

export function redactSecret(value: string): string {
  if (value.length <= 4) return '*'.repeat(value.length);
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}
