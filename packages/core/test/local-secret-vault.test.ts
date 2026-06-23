import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLocalSecretVault } from '../src/local-secret-vault.js';
import { loadSecret } from '../src/secrets.js';

void test('local secret vault saves, reads, lists, and masks secrets', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-vault-'));
  try {
    const vault = createLocalSecretVault({ rootDir: root, passphrase: 'dev-only' });
    vault.set('IMA_X_TOKEN', 'x-token-value');

    assert.equal(vault.get('IMA_X_TOKEN'), 'x-token-value');
    assert.deepEqual(vault.list(), [{ key: 'IMA_X_TOKEN', redacted: 'x-***ue' }]);
    assert.equal(loadSecret('vault:IMA_X_TOKEN', { vault }), 'x-token-value');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('local secret vault returns null for wrong passphrase instead of throwing', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-vault-'));
  try {
    createLocalSecretVault({ rootDir: root, passphrase: 'right' }).set('IMA_X_TOKEN', 'secret');
    const wrong = createLocalSecretVault({ rootDir: root, passphrase: 'wrong' });

    assert.equal(wrong.get('IMA_X_TOKEN'), null);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
