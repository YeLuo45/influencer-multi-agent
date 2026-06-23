import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublish, validateBuild, buildPrepublishGate } from '../src/publish.js';

void test('buildPrepublishGate includes test, check, build, coverage, and pack gates', () => {
  const gate = buildPrepublishGate({ packageName: '@ima/cli', version: '1.1.0' });

  assert.deepEqual(gate.commands, ['npm test', 'npm run check', 'npm run build', 'npm run coverage', 'npm pack -w @ima/cli --dry-run']);
  assert.equal(gate.ready, true);
  assert.match(gate.summary, /@ima\/cli@1.1.0/);
});

void test('validateBuild rejects publish without coverage gate', () => {
  const build = buildPublish({ packageName: '@ima/cli', currentVersion: '1.0.0', bump: 'minor' });
  const result = validateBuild({ ...build, checks: ['npm test', 'npm run check', 'npm run build'] });

  assert.equal(result.ok, false);
  assert.match(result.errors.join('\n'), /coverage/);
});
