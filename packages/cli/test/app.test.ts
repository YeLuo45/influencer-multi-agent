import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonStore, PersonaRegistry, createContent, type Content } from '@ima/core';
import { createApp, createContentFor, fetchAndAppendEngagement, listContentIds, loadContent, saveContent, savePersonas } from '../src/app.js';

test('savePersonas: persists registry to personas.json', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-test-'));
  try {
    const store = new JsonStore({ rootDir: root });
    const personas = new PersonaRegistry();
    personas.upsert({
      id: 'operator',
      name: '运营专家',
      tone: 'sharp',
      targetAudience: 'founders',
      signaturePhrases: ['直接说结论'],
      bannedWords: ['震惊'],
      defaultPlatforms: ['x'],
      examples: ['一个爆款标题'],
      createdAt: '2026-06-21T00:00:00.000Z',
      updatedAt: '2026-06-21T00:00:00.000Z',
    });

    await savePersonas(store, personas);

    const saved = await store.read<Record<string, { id: string; name: string }>>('personas.json');
    assert.ok(saved);
    assert.equal(saved.operator.id, 'operator');
    assert.equal(saved.operator.name, '运营专家');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});


test('createApp: wires default personas and queue sink', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-app-'));
  const oldCwd = process.cwd();
  try {
    process.chdir(root);
    const app = createApp();
    assert.ok(app.personas.get('default'));
    assert.ok(app.personas.get('tech-insight'));
    assert.ok(app.personas.get('lifestyle'));
    assert.equal(app.registry.has('x'), true);
    assert.equal(await app.queue.list().then((items) => items.length), 0);
  } finally {
    process.chdir(oldCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('createApp: tolerates corrupted feedback.json', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-feedback-'));
  const oldCwd = process.cwd();
  try {
    process.chdir(root);
    writeFileSync(join(root, 'feedback.json'), '{not-json');
    const app = createApp();
    assert.ok(app.pipeline);
    assert.ok(app.personas.get('default'));
  } finally {
    process.chdir(oldCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('createApp: synchronously loads persisted custom personas', () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-persona-sync-'));
  const oldCwd = process.cwd();
  try {
    process.chdir(root);
    mkdirSync(join(root, '.ima'), { recursive: true });
    writeFileSync(join(root, '.ima/personas.json'), JSON.stringify({
      ops: {
        id: 'ops',
        name: '运营专家',
        tone: 'sharp',
        targetAudience: 'founders',
        signaturePhrases: ['直接说结论'],
        bannedWords: ['震惊'],
        defaultPlatforms: ['x'],
        examples: ['一个爆款标题'],
        createdAt: '2026-06-21T00:00:00.000Z',
        updatedAt: '2026-06-21T00:00:00.000Z',
      },
    }));

    const app = createApp();

    assert.equal(app.personas.get('ops')?.name, '运营专家');
    assert.equal(app.personas.count(), 4);
  } finally {
    process.chdir(oldCwd);
    rmSync(root, { recursive: true, force: true });
  }
});

test('content helpers: save, load, list and create content', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-content-'));
  try {
    const store = new JsonStore({ rootDir: root });
    const created = createContentFor('agent trends', 'tech-insight');
    assert.match(created.id, /^c-/);
    assert.equal(created.topic, 'agent trends');
    assert.equal(created.persona, 'tech-insight');

    await saveContent(store, created);
    await saveContent(store, createContent({ id: 'second', topic: 'another' }));
    await store.write('content/ignore.txt', { ok: false });

    assert.equal((await loadContent(store, created.id))?.topic, 'agent trends');
    assert.equal(await loadContent(store, 'missing'), null);
    assert.deepEqual(await listContentIds(store), ['second', created.id].sort());
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fetchAndAppendEngagement: appends metrics and skips posts without ids', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-engagement-'));
  try {
    const store = new JsonStore({ rootDir: root });
    const content: Content = createContent({ id: 'engage', topic: 'metrics' });
    content.posts = [
      { platform: 'x', postId: 'x-1', status: 'posted', url: 'https://x.example/p/1', postedAt: '2026-06-21T00:00:00.000Z' },
      { platform: 'reddit', postId: null, status: 'failed', error: 'missing id' },
    ];

    const result = await fetchAndAppendEngagement(store, [content], () => '2026-06-21T00:00:00.000Z');

    assert.equal(result.metrics.length, 1);
    assert.equal(result.saved, 1);
    assert.equal(content.engagement.length, 1);
    assert.equal((await loadContent(store, 'engage'))?.engagement.length, 1);
    const feedback = await store.read<{ records: unknown[] }>('feedback.json');
    assert.equal(feedback?.records.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fetchAndAppendEngagement: persists empty feedback when no posts have ids', async () => {
  const root = mkdtempSync(join(tmpdir(), 'ima-cli-engagement-fail-'));
  try {
    const store = new JsonStore({ rootDir: root });
    const content: Content = createContent({ id: 'bad', topic: 'metrics' });
    content.posts = [{ platform: 'x', postId: null, status: 'failed', error: 'missing id' }];

    const result = await fetchAndAppendEngagement(store, [content], () => '2026-06-21T00:00:00.000Z');

    assert.equal(result.metrics.length, 0);
    assert.equal(result.saved, 0);
    assert.equal((await loadContent(store, 'bad'))?.posts.length, 1);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
