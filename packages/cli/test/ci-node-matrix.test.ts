import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '../../..');

void test('CI: workflow runs on Node 20 and 22 matrix', () => {
  const wf = join(repoRoot, '.github/workflows/ci.yml');
  assert.ok(existsSync(wf), `expected ${wf}`);
  const text = readFileSync(wf, 'utf-8');
  assert.match(text, /matrix:/);
  assert.match(text, /node-version:/);
  assert.match(text, /'20\.20\.2'/);
  assert.match(text, /'22\./);
});
