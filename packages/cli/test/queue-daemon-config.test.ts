import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '../../..');

void test('docs: queue-daemon systemd unit file exists and is valid', () => {
  const path = join(repoRoot, 'docs/queue-daemon.service');
  assert.ok(existsSync(path), `expected ${path} to exist`);
  const text = readFileSync(path, 'utf-8');
  assert.match(text, /\[Unit\]/);
  assert.match(text, /\[Service\]/);
  assert.match(text, /ExecStart=.*queue:daemon/);
  assert.match(text, /Restart=on-failure/);
});

void test('docs: queue-daemon pm2 config exists and references the daemon script', () => {
  const path = join(repoRoot, 'docs/queue-daemon.pm2.cjs');
  assert.ok(existsSync(path), `expected ${path} to exist`);
  const text = readFileSync(path, 'utf-8');
  assert.match(text, /queue:daemon|queue-daemon\.ts/);
});
