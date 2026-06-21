import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonStore, createContent, createQueueItem } from '@ima/core';

const repoRoot = join(import.meta.dirname, '../../..');
const cliEntry = join(repoRoot, 'packages/cli/src/index.ts');
const tsxLoader = join(repoRoot, 'node_modules/tsx/dist/loader.mjs');

function runCli(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ['--import', tsxLoader, cliEntry, ...args], {
    cwd,
    encoding: 'utf-8',
    env: { ...process.env, NODE_ENV: '' },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

async function seedContent(root: string, id = 'seed'): Promise<void> {
  const store = new JsonStore({ rootDir: root });
  const content = createContent({ id, topic: 'Seed Topic' });
  content.stage = 'done';
  content.persona = 'default';
  content.posts = [
    { platform: 'x', postId: 'post-a', status: 'posted', url: 'https://x.example/p/a', variantTag: 'A' },
    { platform: 'reddit', postId: 'post-b', status: 'posted', url: 'https://reddit.example/p/b', variantTag: 'B' },
  ];
  content.engagement = [
    { platform: 'x', postId: 'post-a', likes: 10, shares: 2, comments: 3, views: 100, fetchedAt: '2026-06-21T00:00:00.000Z' },
    { platform: 'reddit', postId: 'post-b', likes: 1, shares: 0, comments: 0, views: 10, fetchedAt: '2026-06-21T00:00:00.000Z' },
  ];
  await store.write(`content/${id}.json`, content);
}

test('cli: help prints usage', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-index-help-'));
  try {
    const result = runCli(['help'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /ima run <topic>/);
    assert.match(result.stdout, /ima queue work/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cli: persona add, list, show and remove errors', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-index-persona-'));
  try {
    let result = runCli(['persona', 'add', 'ops', 'OpsPersona', 'sharp'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /persona added: ops/);

    result = runCli(['persona', 'list'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /default/);

    result = runCli(['persona', 'show', 'default'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /通用大 V/);

    result = runCli(['persona', 'remove', 'missing'], root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /persona not found: missing/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cli: list, status, step, feedback and ab report read seeded content', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-index-content-'));
  try {
    await seedContent(root, 'seed');

    let result = runCli(['list'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /seed/);
    assert.match(result.stdout, /Seed Topic/);

    result = runCli(['status', 'seed'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /"id": "seed"/);

    result = runCli(['step', 'seed'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /advanced=false/);

    result = runCli(['feedback'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /fetched 2 engagement records/);

    result = runCli(['ab', 'report', 'seed', '--min-samples', '1'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /AB report for seed/);
    assert.match(result.stdout, /\[ok\] winner=[AB]/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cli: queue list, work and prune', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-index-queue-'));
  try {
    const store = new JsonStore({ rootDir: root });
    const pending = createQueueItem({
      contentId: 'c1',
      platform: 'x',
      payload: { title: 'queued', body: 'body', tags: [] },
      now: '2026-06-21T00:00:00.000Z',
    });
    const dead = { ...pending, id: 'dead-one', status: 'failed_dead' as const, nextAttemptAt: '2026-06-21T00:00:00.000Z' };
    await store.write(`queue/${pending.id}.json`, pending);
    await store.write(`queue/${dead.id}.json`, dead);

    let result = runCli(['queue', 'list'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /pending=1/);
    assert.match(result.stdout, /dead=1/);

    result = runCli(['queue', 'work', '--limit', '1'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /processed=1/);

    result = runCli(['queue', 'prune'], root);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /pruned 1 dead-letter items/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('cli: invalid commands return non-zero and error text', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-index-error-'));
  try {
    const result = runCli(['status'], root);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /id required/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
