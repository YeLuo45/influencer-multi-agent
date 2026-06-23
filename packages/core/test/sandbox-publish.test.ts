import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildSandboxPublishPlan, verifySandboxPost } from '../src/sandbox-publish.js';
import type { PlatformId, PostRecord } from '../src/types.js';

void test('sandbox publish plan requires sandbox flag and never posts by default', () => {
  const plan = buildSandboxPublishPlan({ platform: 'x', sandbox: true, title: 'Launch', body: 'Body', tags: ['ai'] });

  assert.equal(plan.platform, 'x');
  assert.equal(plan.mode, 'sandbox');
  assert.equal(plan.willPost, false);
  assert.match(plan.command, /publish-test x --sandbox/);
  assert.ok(plan.checks.includes('dry-run'));
  assert.ok(plan.checks.includes('verify-post'));
});

void test('sandbox publish plan rejects non sandbox requests', () => {
  assert.throws(() => buildSandboxPublishPlan({ platform: 'reddit', sandbox: false, title: 'T', body: 'B', tags: [] }), /sandbox required/i);
});

void test('verifySandboxPost reports cleanup command for posted sandbox record', () => {
  const record: PostRecord = { platform: 'reddit' as PlatformId, postId: 'r-1', status: 'posted', url: 'https://reddit.test/r/1' };
  const verified = verifySandboxPost(record);

  assert.equal(verified.ok, true);
  assert.equal(verified.postId, 'r-1');
  assert.match(verified.cleanupCommand ?? '', /cleanup reddit r-1/);
});
