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

void test('cli: reply send --sandbox appends production audit without real platform call', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-reply-'));
  try {
    const result = runCli(['reply', 'send', '--sandbox'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /mode=sandbox/);
    const audit = readFileSync(join(root, '.ima/audit.jsonl'), 'utf-8');
    assert.match(audit, /"sandbox-reply"/);
    assert.match(audit, /no external platform call/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('cli: production and release-local-json print machine-readable JSON', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-prod-'));
  try {
    const production = runCli(['production'], root);
    assert.equal(production.status, 0);
    const snapshot = JSON.parse(production.stdout) as { replySafety: { readyForRealReply: boolean }; release: { ok: boolean }; history: { total: number }; recommendations: Array<{ id: string }>; runbook: string };
    assert.equal(snapshot.replySafety.readyForRealReply, false);
    assert.equal(snapshot.release.ok, true);
    assert.equal(snapshot.history.total, 1);
    assert.ok(snapshot.recommendations.length >= 1);
    assert.match(snapshot.runbook, /Production Runbook/);

    const safeForward = runCli(['delivery', 'safe-forward', '--proposal', 'P-20260624-013'], root);
    assert.equal(safeForward.status, 0);
    assert.match(safeForward.stdout, /mode=dry-run/);
    assert.match(safeForward.stdout, /EXECUTE P-20260624-013/);

    const runbook = runCli(['delivery', 'runbook', '--proposal', 'P-20260624-013'], root);
    assert.equal(runbook.status, 0);
    assert.match(runbook.stdout, /Production Runbook — P-20260624-013/);

    const release = runCli(['release-local-json'], root);
    assert.equal(release.status, 0);
    const report = JSON.parse(release.stdout) as { ok: boolean; gates: unknown[] };
    assert.equal(report.ok, true);
    assert.equal(report.gates.length, 4);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
