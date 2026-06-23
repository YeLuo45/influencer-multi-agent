import { test } from 'node:test';
import assert from 'node:assert/strict';
import { executeSandboxPublish, cleanupSandboxPost } from '../src/sandbox-publish.js';
import type { PlatformId, PostRecord } from '../src/types.js';

void test('executeSandboxPublish posts only when sandbox is true and tags title', async () => {
  const calls: Array<{ platform: PlatformId; content: { title: string; body: string; tags: string[] } }> = [];
  const result = await executeSandboxPublish(
    { platform: 'x', sandbox: true, title: 'Launch', body: 'Body', tags: ['ai'] },
    {
      async post(platform, content): Promise<PostRecord> {
        calls.push({ platform, content });
        return { platform, postId: 'sandbox-1', status: 'posted', url: 'https://x.test/sandbox-1' };
      },
    },
  );

  assert.equal(result.ok, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.platform, 'x');
  assert.match(calls[0]!.content.title, /\[SANDBOX\]/);
  assert.deepEqual(calls[0]!.content.tags, ['ai', 'sandbox']);
});

void test('cleanupSandboxPost calls deletePost when publisher supports cleanup', async () => {
  const deleted: string[] = [];
  const result = await cleanupSandboxPost(
    { platform: 'reddit', postId: 'r-1' },
    { async deletePost(platform, postId) { deleted.push(`${platform}:${postId}`); return true; } },
  );

  assert.equal(result.ok, true);
  assert.deepEqual(deleted, ['reddit:r-1']);
});

void test('cleanupSandboxPost reports unsupported cleanup without throwing', async () => {
  const result = await cleanupSandboxPost({ platform: 'youtube', postId: 'y-1' }, {});

  assert.equal(result.ok, false);
  assert.match(result.error ?? '', /not supported/i);
});
