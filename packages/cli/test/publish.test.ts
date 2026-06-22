import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPublish, suggestVersion, validateBuild, type PublishConfig } from '../src/publish.js';

void test('publish: buildPublish returns a config with name + tarball path', () => {
  const cfg: PublishConfig = buildPublish({ name: '@ima/cli', version: '0.1.0', dryRun: true });
  assert.match(cfg.tarball, /ima-cli-0\.1\.0\.tgz/);
  assert.equal(cfg.dryRun, true);
});

void test('publish: suggestVersion follows semver with prerelease label', () => {
  assert.equal(suggestVersion('0.1.0', 'patch'), '0.1.1');
  assert.equal(suggestVersion('0.1.0', 'minor'), '0.2.0');
  assert.equal(suggestVersion('0.1.0', 'major'), '1.0.0');
  assert.equal(suggestVersion('0.1.0', 'rc'), '0.1.0-rc.1');
});

void test('publish: validateBuild rejects invalid package names', () => {
  const r1 = validateBuild({ name: 'bad name', version: '0.1.0' });
  assert.equal(r1.ok, false);
  assert.match(r1.reason ?? '', /name/);
  const r2 = validateBuild({ name: '@ima/cli', version: 'not-a-version' });
  assert.equal(r2.ok, false);
  assert.match(r2.reason ?? '', /version/);
  const r3 = validateBuild({ name: '@ima/cli', version: '0.1.0' });
  assert.equal(r3.ok, true);
  const r4 = validateBuild({ name: '@ima/cli', version: '0.1.0-rc.1' });
  assert.equal(r4.ok, true, 'prerelease versions are accepted');
});
