import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { JsonStore } from '../src/storage.js';

test('storage: write + read round-trip', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-store-'));
  try {
    const s = new JsonStore({ rootDir: dir });
    await s.write('a/b.json', { hello: 'world', n: 1 });
    const got = await s.read<{ hello: string; n: number }>('a/b.json');
    assert.equal(got?.hello, 'world');
    assert.equal(got?.n, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('storage: read missing returns null', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-store-'));
  try {
    const s = new JsonStore({ rootDir: dir });
    const got = await s.read<unknown>('nope.json');
    assert.equal(got, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('storage: list returns names', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-store-'));
  try {
    const s = new JsonStore({ rootDir: dir });
    await s.write('x/a.json', 1);
    await s.write('x/b.json', 2);
    const names = await s.list('x');
    assert.deepEqual(names.sort(), ['a.json', 'b.json']);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('storage: path is rooted under .ima', () => {
  const dir = mkdtempSync(join(tmpdir(), 'ima-store-'));
  try {
    const s = new JsonStore({ rootDir: dir });
    assert.ok(s.path('a.json').endsWith('.ima/a.json'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});