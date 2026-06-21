import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = join(import.meta.dirname, '../../..');
const cliEntry = join(repoRoot, 'packages/cli/src/index.ts');
const tsxLoader = join(repoRoot, 'node_modules/tsx/dist/loader.mjs');

function runCli(args: string[], cwd: string, env: Record<string, string | undefined> = {}): { status: number; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', tsxLoader, cliEntry, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NODE_ENV: '', ...env },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

void test('doctor: warns when LLM is mock and reports provider/model', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-doc-mock-'));
  try {
    // ensure no real LLM env is set
    const env: Record<string, string | undefined> = {
      IMA_LLM_ENDPOINT: '',
      IMA_LLM_KEY: '',
      IMA_LLM_MODEL: '',
    };
    const r = runCli(['doctor'], root, env);
    assert.equal(r.status, 0);
    const llmLines = r.stdout.split('\n').filter((l) => l.startsWith('OK') || l.startsWith('WARN') || l.startsWith('FAIL')).filter((l) => /llm\s/.test(l));
    assert.ok(llmLines.length >= 1, `expected an llm line, got:\n${r.stdout}`);
    assert.match(llmLines[0]!, /provider=mock/);
    assert.match(llmLines[0]!, /model=/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('doctor: reports feedback.json freshness with lastUpdated + age', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-doc-fb-'));
  try {
    const { JsonStore } = await import('@ima/core');
    const store = new JsonStore({ rootDir: root });
    await store.write('feedback.json', {
      records: [{ platform: 'x', postId: 'p-1', likes: 10, comments: 1, shares: 0, views: 100, fetchedAt: '2026-06-21T00:00:00.000Z' }],
      windowDays: 7,
      lastUpdated: '2026-06-21T00:00:00.000Z',
      totalRecords: 1,
    });
    const r = runCli(['doctor'], root);
    assert.equal(r.status, 0);
    const fbLine = r.stdout.split('\n').find((l) => /feedback\s/.test(l));
    assert.ok(fbLine);
    assert.match(fbLine, /lastUpdated=2026-06-21/);
    assert.match(fbLine, /age=/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('doctor: reports no feedback when feedback.json is missing', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-doc-nofb-'));
  try {
    const r = runCli(['doctor'], root);
    assert.equal(r.status, 0);
    const fbLine = r.stdout.split('\n').find((l) => /feedback\s/.test(l));
    assert.ok(fbLine);
    assert.match(fbLine, /none/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('doctor: reports crawler health + persona count', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-doc-base-'));
  try {
    const r = runCli(['doctor'], root);
    assert.equal(r.status, 0);
    assert.match(r.stdout, /crawler/);
    assert.match(r.stdout, /engagement/);
    assert.match(r.stdout, /personas\s+count=\d+/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
