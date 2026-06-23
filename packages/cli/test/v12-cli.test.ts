import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const repoRoot = join(import.meta.dirname, '../../..');
const cliEntry = join(repoRoot, 'packages/cli/src/index.ts');
const tsxLoader = join(repoRoot, 'node_modules/tsx/dist/loader.mjs');

function runCli(args: string[], cwd: string, env: Record<string, string | undefined> = {}): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', tsxLoader, cliEntry, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NODE_ENV: '', ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

void test('cli: secret local set/get/list stores encrypted-looking local vault file', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-secret-'));
  try {
    let result = runCli(['secret', 'set', 'IMA_X_TOKEN', 'x-token-value'], root, { IMA_SECRET_PASSPHRASE: 'dev' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /secret set: IMA_X_TOKEN/);

    result = runCli(['secret', 'list'], root, { IMA_SECRET_PASSPHRASE: 'dev' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /IMA_X_TOKEN\s+x-\*\*\*ue/);

    result = runCli(['secret', 'get', 'IMA_X_TOKEN'], root, { IMA_SECRET_PASSPHRASE: 'dev' });
    assert.equal(result.status, 0);
    assert.match(result.stdout, /IMA_X_TOKEN=x-\*\*\*ue/);

    const vaultFile = join(root, '.ima/secrets.json');
    assert.equal(existsSync(vaultFile), true);
    assert.equal(readFileSync(vaultFile, 'utf-8').includes('x-token-value'), false);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('cli: publish-test --sandbox runs dry plan without token by default', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-pubtest-'));
  try {
    const result = runCli(['publish-test', 'x', '--sandbox', '--title', 'T', '--body', 'B'], root);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /\[sandbox\] x/);
    assert.match(result.stdout, /willPost=false/);
    assert.match(result.stdout, /verify-post/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('cli: prepublish-gate prints all release gate commands', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-gate-'));
  try {
    const result = runCli(['prepublish-gate'], root);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /npm test/);
    assert.match(result.stdout, /npm run coverage/);
    assert.match(result.stdout, /npm pack -w @ima\/cli --dry-run/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
