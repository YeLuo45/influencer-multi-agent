import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonStore, createContent, createQueueItem } from '@ima/core';
import { parseWebOptions, readNpmPassthroughArgs, openBrowser } from '../src/index.js';

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

test('cli: web option parser accepts npm run web --port without -- separator', () => {
  const options = parseWebOptions(['web', '7777'], { npm_config_port: 'true', npm_config_host: '0.0.0.0' });
  assert.equal(options.port, 7777);
  assert.equal(options.host, '0.0.0.0');
});

test('cli: web option parser rejects browser unsafe port 6666', () => {
  assert.throws(
    () => parseWebOptions(['web', '--port', '6666'], {}),
    /unsafe browser port: 6666/,
  );
});

test('cli: web option parser gives argv precedence over npm_config_port', () => {
  const options = parseWebOptions(['web', '--port', '7778', '--host', '127.0.0.1'], { npm_config_port: '7777' });
  assert.equal(options.port, 7778);
  assert.equal(options.host, '127.0.0.1');
});

test('cli: web option parser rejects every Chromium restricted port', () => {
  for (const port of [1, 7, 6665, 6666, 6667, 6668, 6669, 6697, 6000, 5060]) {
    assert.throws(
      () => parseWebOptions(['web', '--port', String(port)], {}),
      new RegExp(`unsafe browser port: ${port}`),
      `expected ${port} to be blocked`,
    );
  }
  // sanity: a safe neighbour must not be blocked
  const safe = parseWebOptions(['web', '--port', '6677'], {});
  assert.equal(safe.port, 6677);
});

test('cli: readNpmPassthroughArgs resolves npm script aliases', () => {
  // `web` keeps the alias so runCli still sees 'web' as argv[0]
  assert.deepEqual(
    readNpmPassthroughArgs({ npm_config_argv: '/usr/bin/npm run web --port 6677' }),
    ['web', '--port', '6677'],
  );
  // `cli` is a generic dispatcher; userArgs[0] becomes the subcommand
  assert.deepEqual(
    readNpmPassthroughArgs({ npm_config_argv: '/usr/bin/npm run cli status c1' }),
    ['status', 'c1'],
  );
  // `queue:work` maps to ['queue', 'work'] so the queue subselector stays at argv[1]
  assert.deepEqual(
    readNpmPassthroughArgs({ npm_config_argv: '/usr/bin/npm run queue:work --limit 1' }),
    ['queue', 'work', '--limit', '1'],
  );
  // Unknown script alias returns userArgs only (script name is unknown)
  assert.deepEqual(
    readNpmPassthroughArgs({ npm_config_argv: '/usr/bin/npm run bootstrap' }),
    [],
  );
  // No passthrough → empty
  assert.deepEqual(readNpmPassthroughArgs({}), []);
  assert.deepEqual(readNpmPassthroughArgs({ npm_config_argv: '' }), []);
});

test('cli: openBrowser uses platform-specific command and never throws', () => {
  const calls: Array<{ cmd: string; args: string[] }> = [];
  const fakeSpawn: typeof import('node:child_process').spawn = ((cmd: string, args: string[]) => {
    calls.push({ cmd, args });
    // Simulate the process exiting successfully; do not capture stdio.
    const child = { on(_event: string, _cb: (...a: unknown[]) => void) { /* no-op */ }, unref() {} } as never;
    return child;
  }) as never;

  // Force 'linux' to assert xdg-open path
  const originalPlatform = Object.getOwnPropertyDescriptor(process, 'platform');
  Object.defineProperty(process, 'platform', { value: 'linux', configurable: true });
  try {
    openBrowser('http://127.0.0.1:6677', { spawn: fakeSpawn });
    openBrowser('http://127.0.0.1:6677', { platform: 'darwin', spawn: fakeSpawn });
    openBrowser('http://127.0.0.1:6677', { platform: 'win32', spawn: fakeSpawn });
  } finally {
    if (originalPlatform) Object.defineProperty(process, 'platform', originalPlatform);
  }

  assert.equal(calls.length, 3);
  assert.deepEqual(calls[0], { cmd: 'xdg-open', args: ['http://127.0.0.1:6677'] });
  assert.deepEqual(calls[1], { cmd: 'open', args: ['http://127.0.0.1:6677'] });
  // Windows spawns through cmd.exe to handle `start`
  assert.match(calls[2].cmd, /cmd(\.exe)?$/i);
});

test('cli: openBrowser swallows spawn failures (best-effort)', () => {
  const fakeSpawn = (() => { throw new Error('no display'); }) as never;
  assert.doesNotThrow(() =>
    openBrowser('http://127.0.0.1:6677', { platform: 'linux', spawn: fakeSpawn }),
  );
});

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
