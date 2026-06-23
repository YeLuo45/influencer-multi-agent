import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { diagnoseSecrets, loadSecret } from '../src/secrets.js';

void test('loadSecret resolves vault source from injected vault provider', () => {
  const value = loadSecret('vault:IMA_X_TOKEN', { vault: { IMA_X_TOKEN: ' vault-token ' } });
  assert.equal(value, 'vault-token');
});

void test('loadSecret resolves keychain source from injected keychain provider', () => {
  const value = loadSecret('keychain:IMA_REDDIT_TOKEN', { keychain: { IMA_REDDIT_TOKEN: ' reddit-token ' } });
  assert.equal(value, 'reddit-token');
});

void test('diagnoseSecrets returns redacted source status without leaking token values', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-secret-'));
  try {
    const tokenFile = join(root, 'token.txt');
    writeFileSync(tokenFile, 'secret-token-value', 'utf-8');
    const report = diagnoseSecrets([
      { name: 'x', source: `file:${tokenFile}` },
      { name: 'reddit', source: 'MISSING_TOKEN' },
    ], { env: {} });

    assert.equal(report.ready, false);
    assert.equal(report.items[0]!.status, 'ok');
    assert.equal(report.items[0]!.redacted, 'se***ue');
    assert.equal(report.items[1]!.status, 'missing');
    assert.match(report.items[1]!.fix, /set MISSING_TOKEN/);
    assert.equal(JSON.stringify(report).includes('secret-token-value'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
