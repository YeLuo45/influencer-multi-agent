import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSecret, loadSecrets, type SecretSource } from '../src/secrets.js';

void test('secrets: loadSecret(env) reads process.env and trims whitespace', () => {
  const env: SecretSource = { X: '  sk-123  ' };
  assert.equal(loadSecret('X', { env }), 'sk-123');
});

void test('secrets: loadSecret returns null when missing', () => {
  const env: SecretSource = {};
  assert.equal(loadSecret('X', { env }), null);
});

void test('secrets: file:path reads the file synchronously', () => {
  const tmpFile = join(tmpdir(), `ima-secret-${Date.now()}.txt`);
  writeFileSync(tmpFile, '  bearer-xyz  \n', 'utf-8');
  try {
    assert.equal(loadSecret(`file:${tmpFile}`), 'bearer-xyz');
  } finally {
    unlinkSync(tmpFile);
  }
});

void test('secrets: file:path returns null when missing (without throwing)', () => {
  assert.equal(loadSecret('file:/nonexistent/path/secret'), null);
});

void test('secrets: loadSecrets reads multiple keys and returns a Map with nulls for missing', () => {
  const env: SecretSource = { X_TOKEN: 'x' };
  const out = loadSecrets(['X_TOKEN', 'Y_TOKEN', 'Z_TOKEN'], { env });
  assert.equal(out.get('X_TOKEN'), 'x');
  assert.equal(out.get('Y_TOKEN'), null);
  assert.equal(out.get('Z_TOKEN'), null);
});

void test('secrets: unknown scheme returns null', () => {
  assert.equal(loadSecret('vault:foo'), null);
});
