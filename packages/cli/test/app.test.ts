import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JsonStore, PersonaRegistry } from '@ima/core';
import { savePersonas } from '../src/app.js';

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
