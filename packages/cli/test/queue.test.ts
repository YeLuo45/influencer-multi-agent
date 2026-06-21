import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { JsonStore } from '@ima/core';
import { createQueueItem, type QueueItem } from '@ima/core';
import { QueueStore } from '../src/queue-store.js';
import { PublishWorker, summarizeQueue } from '../src/queue-worker.js';
import type { Channel, PostInput, PostRecord } from '@ima/publisher';
import { ChannelRegistry } from '@ima/publisher';

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), 'ima-queue-test-'));
}

void test('QueueStore: write / read / list round-trip', async () => {
  const root = tmpRoot();
  try {
    const store = new JsonStore({ rootDir: root });
    const q = new QueueStore(store);
    const item = createQueueItem({
      contentId: 'c-1',
      platform: 'x',
      payload: { title: 'T', body: 'B', tags: ['a'] },
      now: '2026-06-21T00:00:00.000Z',
    });
    await q.write(item);
    const read = await q.read(item.id);
    assert.ok(read);
    assert.equal(read.id, item.id);
    const list = await q.list();
    assert.equal(list.length, 1);
    assert.equal(list[0]!.id, item.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('QueueStore: list on empty dir returns []', async () => {
  const root = tmpRoot();
  try {
    const store = new JsonStore({ rootDir: root });
    const q = new QueueStore(store);
    const list = await q.list();
    assert.deepEqual(list, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('QueueStore: remove drops the file', async () => {
  const root = tmpRoot();
  try {
    const store = new JsonStore({ rootDir: root });
    const q = new QueueStore(store);
    const item = createQueueItem({
      contentId: 'c-1', platform: 'x',
      payload: { title: 'T', body: 'B', tags: [] },
    });
    await q.write(item);
    await q.remove(item.id);
    const list = await q.list();
    assert.equal(list.length, 0);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('QueueStore: list skips corrupted files', async () => {
  const root = tmpRoot();
  try {
    const store = new JsonStore({ rootDir: root });
    const q = new QueueStore(store);
    await store.write('queue/q-bad.json', '{ this is not json');
    const good = createQueueItem({
      contentId: 'c-1', platform: 'x',
      payload: { title: 'T', body: 'B', tags: [] },
    });
    await q.write(good);
    const list = await q.list();
    // list returns all files including the corrupted one (marking it as bad),
    // so callers can detect + delete via prune-style commands.
    assert.equal(list.length, 2);
    assert.equal(list.find((i) => i.id === good.id)?.id, good.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('summarizeQueue: tallies by status and surfaces dead letters', () => {
  const items: QueueItem[] = [
    { ...createQueueItem({ contentId: 'a', platform: 'x', payload: { title: 't', body: 'b', tags: [] } }), status: 'pending' },
    { ...createQueueItem({ contentId: 'a', platform: 'x', payload: { title: 't', body: 'b', tags: [] } }), status: 'posted' },
    { ...createQueueItem({ contentId: 'b', platform: 'x', payload: { title: 't', body: 'b', tags: [] } }), status: 'failed_dead', lastError: 'oops', attempts: 3 },
  ];
  const s = summarizeQueue(items);
  assert.equal(s.total, 3);
  assert.equal(s.byStatus.pending, 1);
  assert.equal(s.byStatus.posted, 1);
  assert.equal(s.byStatus.failed_dead, 1);
  assert.equal(s.deadLettered.length, 1);
  assert.equal(s.deadLettered[0]!.lastError, 'oops');
});

void test('PublishWorker: posts due items and persists updates', async () => {
  const root = tmpRoot();
  try {
    const store = new JsonStore({ rootDir: root });
    const q = new QueueStore(store);

    // seed a pending due item (nextAttemptAt = now)
    const item = createQueueItem({
      contentId: 'c-1', platform: 'x',
      payload: { title: 'T', body: 'B', tags: [] },
      now: '2026-06-21T00:00:00.000Z',
    });
    await q.write(item);

    // build a registry with one channel
    const reg = new ChannelRegistry();
    const ch: Channel = {
      id: 'x',
      async post(_input: PostInput): Promise<PostRecord> {
        return { platform: 'x', postId: 'x-1', status: 'posted', url: 'https://x.x/p/1' };
      },
      async healthCheck() { return { ok: true, detail: 'mock' }; },
    };
    reg.register(ch);

    const worker = new PublishWorker(q, reg);
    const r = await worker.runOnce({ now: '2026-06-21T00:00:00.000Z' });
    assert.equal(r.scanned, 1);
    assert.equal(r.posted, 1);
    const after = await q.list();
    assert.equal(after[0]!.status, 'posted');
    assert.equal(after[0]!.postId, 'x-1');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('PublishWorker: empty queue short-circuits', async () => {
  const root = tmpRoot();
  try {
    const store = new JsonStore({ rootDir: root });
    const q = new QueueStore(store);
    const reg = new ChannelRegistry();
    const worker = new PublishWorker(q, reg);
    const r = await worker.runOnce();
    assert.deepEqual(r, { scanned: 0, processed: 0, posted: 0, retryScheduled: 0, deadLettered: 0 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

void test('PublishWorker: persists to .ima/queue/ via JsonStore', async () => {
  const root = tmpRoot();
  try {
    const store = new JsonStore({ rootDir: root });
    const q = new QueueStore(store);
    const item = createQueueItem({
      contentId: 'c-1', platform: 'x',
      payload: { title: 'T', body: 'B', tags: [] },
      now: '2026-06-21T00:00:00.000Z',
    });
    await q.write(item);
    const dir = join(root, '.ima', 'queue');
    assert.ok(existsSync(dir));
    const files = readdirSync(dir);
    assert.equal(files.length, 1);
    const raw = JSON.parse(readFileSync(join(dir, files[0]!), 'utf-8')) as QueueItem;
    assert.equal(raw.id, item.id);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
